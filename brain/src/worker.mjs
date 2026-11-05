import { DurableObject } from 'cloudflare:workers';
import { Rejected, UUID, authenticate, boundedBody, digest, reply, route, validateEvent } from './contract.mjs';
import { claimBudgetCall, reserveBudget, settleBudget } from './budget.mjs';
import { readTaskIntent, storeTaskIntent } from './task_intents.mjs';
import { EXEC_SCHEMA, submitExecutionIntent, approveExecutionIntent, claimExecutionIntent, beginExecutionCall, finishExecutionIntent, reconcileExecutionIntent, inspectExecutionIntent, executionDiagnostics, recoverExecutionLeases } from './exec_authority.mjs';

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,source TEXT NOT NULL,type TEXT NOT NULL,correlation TEXT NOT NULL,envelope TEXT NOT NULL,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,due INTEGER NOT NULL,lease_until INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL,updated INTEGER NOT NULL,route TEXT NOT NULL,code TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS jobs_due ON jobs(status,due)',
  'CREATE TABLE IF NOT EXISTS event_keys(key TEXT PRIMARY KEY,job_id TEXT NOT NULL,signature TEXT NOT NULL,kind TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,job_id TEXT NOT NULL,at INTEGER NOT NULL,status TEXT NOT NULL,code TEXT NOT NULL,attempt INTEGER NOT NULL,correlation TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS rate_counters(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS ai_months(month TEXT PRIMARY KEY,spent INTEGER NOT NULL,reserved INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS ai_reservations(id TEXT PRIMARY KEY,month TEXT NOT NULL,provider TEXT NOT NULL,model TEXT NOT NULL,event_id TEXT NOT NULL,source_revision TEXT NOT NULL,operation TEXT NOT NULL,amount INTEGER NOT NULL,status TEXT NOT NULL,actual INTEGER,call_claimed INTEGER NOT NULL DEFAULT 0,price_hash TEXT NOT NULL,currency TEXT NOT NULL,fx_hash TEXT,UNIQUE(event_id,source_revision,operation))',
  'CREATE TABLE IF NOT EXISTS ai_provider_alerts(month TEXT NOT NULL,provider TEXT NOT NULL,threshold INTEGER NOT NULL,PRIMARY KEY(month,provider,threshold))',
  'CREATE TABLE IF NOT EXISTS ai_alerts(month TEXT NOT NULL,threshold INTEGER NOT NULL,PRIMARY KEY(month,threshold))'
  ,'CREATE TABLE IF NOT EXISTS controls(name TEXT PRIMARY KEY,value INTEGER NOT NULL)'
  ,'CREATE TABLE IF NOT EXISTS control_audit(at INTEGER NOT NULL,code TEXT NOT NULL,revision INTEGER NOT NULL,scope TEXT NOT NULL)'
  ,'CREATE TABLE IF NOT EXISTS task_intents(id TEXT PRIMARY KEY,payload TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL)'
  ,'CREATE TABLE IF NOT EXISTS task_intent_audit(id TEXT NOT NULL,at INTEGER NOT NULL,code TEXT NOT NULL)',
  ...EXEC_SCHEMA
];

export class BrainCoordinator extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env); this.ctx = ctx; this.env = env; this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => {
      for (const statement of SCHEMA) this.sql.exec(statement);
      this.sql.exec('INSERT OR IGNORE INTO controls(name,value) VALUES(?,0),(?,1),(?,0)', 'global', 'ai', 'revision');
    });
  }
  paused(source) {
    return [...this.sql.exec('SELECT value FROM controls WHERE name IN (?,?)', 'global', 'source:' + source)].some(row => row.value === 1);
  }
  controlState() {
    const values = Object.fromEntries([...this.sql.exec('SELECT name,value FROM controls')].map(row => [row.name, row.value]));
    return { globalPaused: values.global === 1, aiPaused: true, revision: values.revision,
      sourcePaused: Object.fromEntries(Object.entries(values).filter(([key]) => key.startsWith('source:')).map(([key, value]) => [key.slice(7), value === 1])) };
  }
  async control(input) {
    if (!input || !['pause', 'resume'].includes(input.operation) || !['global', 'source', 'ai'].includes(input.scope) || !Number.isSafeInteger(input.expectedRevision)) throw new Rejected('INVALID_CONTROL', 422);
    if (input.scope === 'source' && !['staging', 'drive', 'gmail', 'site', 'github', 'news'].includes(input.source)) throw new Rejected('INVALID_CONTROL_SOURCE', 422);
    if (input.operation === 'resume' && (input.healthCommit !== this.env.DEPLOY_SHA || input.scope === 'ai')) throw new Rejected('RESUME_HEALTH_OR_AI_COVERAGE_UNVERIFIED', 409);
    if (input.operation === 'resume') await this.wake(Date.now() + 10);
    return this.ctx.storage.transactionSync(() => {
      const current = this.controlState();
      if (current.revision !== input.expectedRevision) throw new Rejected('CONTROL_REVISION_CONFLICT', 409);
      // Reading the initialized durable schema is an independent storage health
      // prerequisite; an unavailable ledger cannot authorize a resume.
      this.sql.exec('SELECT COUNT(*) FROM jobs').toArray();
      const name = input.scope === 'source' ? 'source:' + input.source : input.scope;
      const value = input.operation === 'pause' ? 1 : 0;
      const revision = current.revision + 1;
      this.sql.exec('INSERT INTO controls(name,value) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value', name, value);
      this.sql.exec('UPDATE controls SET value=? WHERE name=?', revision, 'revision');
      const code = input.operation === 'pause' ? 'AUTOMATION_PAUSED' : 'EXPLICIT_HEALTH_CHECKED_RESUME';
      this.sql.exec('INSERT INTO control_audit(at,code,revision,scope) VALUES(?,?,?,?)', Date.now(), code, revision, name);
      console.log(JSON.stringify({ service: 'archelaos-brain', commit: this.env.DEPLOY_SHA, code, revision, scope: name }));
      return reply(this.controlState());
    });
  }
  record(job, status, code, now) {
    this.sql.exec('INSERT INTO audit(job_id,at,status,code,attempt,correlation) VALUES(?,?,?,?,?,?)', job.id, now, status, code, job.attempts, job.correlation);
    console.log(JSON.stringify({ service: 'archelaos-brain', commit: this.env.DEPLOY_SHA, receiptId: job.id, correlationId: job.correlation, status, code, attempt: job.attempts }));
  }
  async wake(at) {
    const alarm = await this.ctx.storage.getAlarm();
    if (alarm === null || at < alarm) await this.ctx.storage.setAlarm(at);
  }
  limit(source, now) {
    this.sql.exec('DELETE FROM rate_counters WHERE expires<?', now);
    for (const [key, maximum, expires] of [
      ['minute:' + source + ':' + Math.floor(now / 60000), 30, now + 120000],
      ['day:' + Math.floor(now / 86400000), 1000, now + 2 * 86400000]
    ]) {
      const old = [...this.sql.exec('SELECT count FROM rate_counters WHERE key=?', key)][0];
      if (old && old.count >= maximum) throw new Rejected('RATE_LIMITED', 429);
      this.sql.exec('INSERT INTO rate_counters(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1', key, expires);
    }
  }
  async intake(event) {
    const now = Date.now();
    event = validateEvent(event, event?.sourceType, now);
    const content = JSON.stringify(event.payload);
    const kind = event.eventType.startsWith('source.file.') ? 'source.file' : event.eventType;
    const prefix = event.sourceType + '|' + event.sourceId + '|' + kind + '|';
    const delivery = await digest('delivery|' + event.sourceType + '|' + event.eventId);
    const revision = await digest('revision|' + prefix + event.sourceRevision);
    const blob = await digest('blob|' + prefix + event.payload.blobSha256);
    const signature = await digest(content);
    const deliverySignature = await digest(prefix + event.sourceRevision + '|' + content);
    // Persist a wake-up BEFORE acknowledging/inserting the job. A process crash
    // cannot strand a committed receipt without its outbox wake-up.
    await this.wake(now + 50);
    const result = this.ctx.storage.transactionSync(() => {
      if (this.paused(event.sourceType)) throw new Rejected('AUTOMATION_PAUSED', 423);
      this.limit(event.sourceType, now);
      const keys = [[delivery, deliverySignature, 'delivery'], [revision, signature, 'revision'], [blob, signature, 'blob']];
      let existing = null;
      for (const [key, expected] of keys) {
        const row = [...this.sql.exec('SELECT * FROM event_keys WHERE key=?', key)][0];
        if (!row) continue;
        if (row.signature !== expected || existing && existing !== row.job_id) throw new Rejected('IDEMPOTENCY_CONFLICT', 409);
        existing = row.job_id;
      }
      const counts = [...this.sql.exec('SELECT (SELECT COUNT(*) FROM jobs) AS jobs,(SELECT COUNT(*) FROM event_keys) AS keys')][0];
      if ((!existing && counts.jobs >= 2000) || counts.keys >= 20000) throw new Rejected('DURABLE_CAPACITY_REACHED', 429);
      const id = existing || crypto.randomUUID();
      if (!existing) {
        const selected = route(event);
        this.sql.exec('INSERT INTO jobs(id,source,type,correlation,envelope,status,due,created,updated,route,code) VALUES(?,?,?,?,?,?,?,?,?,?,?)', id, event.sourceType, event.eventType, event.correlationId, JSON.stringify(event), 'QUEUED', now, now, now, selected, 'ACCEPTED');
        if (this.env.TEST_BUDGET === 'true' && this.env.TEST_STOP_BEFORE_RECEIPT_COMMIT === 'true') throw new Error('SYNTHETIC_STOP_BEFORE_RECEIPT_COMMIT');
        this.record({ id, correlation: event.correlationId, attempts: 0 }, 'QUEUED', 'ACCEPTED', now);
      }
      for (const [key, keySignature, keyKind] of keys) this.sql.exec('INSERT OR IGNORE INTO event_keys(key,job_id,signature,kind) VALUES(?,?,?,?)', key, id, keySignature, keyKind);
      const job = [...this.sql.exec('SELECT * FROM jobs WHERE id=?', id)][0];
      return { receiptId: id, correlationId: job.correlation, eventId: event.eventId, dedupeKey: blob, status: job.status, duplicate: Boolean(existing), durable: true };
    });
    if (this.env.TEST_BUDGET === 'true' && this.env.TEST_STOP_AFTER_RECEIPT_COMMIT === 'true') throw new Error('SYNTHETIC_STOP_AFTER_RECEIPT_COMMIT');
    return reply(result, result.duplicate ? 200 : 202);
  }
  async fetch(request) {
    try {
      const url = new URL(request.url);
      if (request.method === 'GET' && url.pathname.startsWith('/internal/envelopes/')) {
        const id = url.pathname.slice('/internal/envelopes/'.length);
        const row = [...this.sql.exec('SELECT envelope FROM jobs WHERE id=?', id)][0];
        return row ? reply(JSON.parse(row.envelope)) : reply({ code: 'NOT_FOUND' }, 404);
      }
      if (url.pathname.startsWith('/internal/exec/')) {
        const synthetic = this.env.TEST_BUDGET === 'true' && this.env.BRAIN_EXECUTION_ADMISSION === 'synthetic';
        const enabled = synthetic || (this.env.ENVIRONMENT === 'staging' &&
          this.env.BRAIN_EXECUTION_ADMISSION === 'enabled' && this.env.CENTRAL_LEDGER_VERIFIED === 'true');
        const path = url.pathname;
        if (request.method === 'GET' && path === '/internal/exec/diagnostics') return reply(executionDiagnostics(this.ctx.storage));
        if (request.method === 'GET' && path.startsWith('/internal/exec/intents/'))
          return reply(inspectExecutionIntent(this.ctx.storage, path.slice('/internal/exec/intents/'.length)));
        if (request.method !== 'POST') throw new Rejected('NOT_FOUND', 404);
        let input; try { input = await request.json(); } catch { throw new Rejected('INVALID_JSON', 422); }
        if (path === '/internal/exec/intents') return reply(await submitExecutionIntent(this.ctx.storage, input), 202);
        if (path === '/internal/exec/approvals')
          return reply(approveExecutionIntent(this.ctx.storage, input, this.controlState()));
        if (!enabled) throw new Rejected('EXECUTION_ADMISSION_DISABLED', 423);
        const controls = this.controlState();
        // Synthetic admission is restricted to explicit test flags; it cannot
        // unpause the real shared AI budget or dispatch an external provider.
        if (synthetic) controls.aiPaused = false;
        let configuration = null;
        if (this.env.BRAIN_EXECUTION_CONFIG) {
          try { configuration = JSON.parse(this.env.BRAIN_EXECUTION_CONFIG); }
          catch { throw new Rejected('EXEC_BUDGET_CONFIG_INVALID', 503); }
        }
        if (path === '/internal/exec/claims') {
          // Alarm before claim commit: a crash after durable lease acquisition
          // cannot strand work indefinitely without reconciliation.
          await this.wake(Date.now() + 30_050);
          return reply(claimExecutionIntent(this.ctx.storage, input, controls, configuration));
        }
        if (path === '/internal/exec/begin') return reply(beginExecutionCall(this.ctx.storage, input));
        if (path === '/internal/exec/complete') return reply(finishExecutionIntent(this.ctx.storage, input));
        if (path === '/internal/exec/reconcile') return reply(reconcileExecutionIntent(this.ctx.storage, input));
        throw new Rejected('NOT_FOUND', 404);
      }
      if (url.pathname === '/internal/task-intents' && request.method === 'POST') {
        let input; try { input = await request.json(); } catch { throw new Rejected('INVALID_JSON', 422); }
        const result = this.ctx.storage.transactionSync(() => storeTaskIntent(this.sql, input));
        return reply(result, result.duplicate ? 200 : 202);
      }
      if (request.method === 'GET' && url.pathname.startsWith('/internal/task-intents/')) {
        const id = url.pathname.slice('/internal/task-intents/'.length);
        return reply(readTaskIntent(this.sql, id));
      }
      if (url.pathname === '/internal/control' && request.method === 'GET') return reply(this.controlState());
      if (url.pathname === '/internal/control' && request.method === 'POST') return await this.control(await request.json());
      if (this.env.TEST_BUDGET === 'true' && request.method === 'POST' && url.pathname === '/internal/testing/expire-lease') {
        const input = await request.json();
        if (!UUID.test(input.receiptId)) throw new Rejected('INVALID_TEST_RECEIPT', 422);
        this.sql.exec('UPDATE jobs SET lease_until=? WHERE id=? AND status=?', Date.now() - 1, input.receiptId, 'RUNNING');
        await this.wake(Date.now() + 10);
        return reply({ leaseExpiredForSyntheticRecovery: true });
      }
      if (request.method === 'POST' && url.pathname === '/internal/events') return await this.intake(await request.json());
      if (request.method === 'GET' && url.pathname.startsWith('/internal/tasks/')) {
        const id = url.pathname.slice('/internal/tasks/'.length);
        const job = [...this.sql.exec('SELECT * FROM jobs WHERE id=?', id)][0];
        if (!job) return reply({ code: 'NOT_FOUND' }, 404);
        const audit = [...this.sql.exec('SELECT at,status,code,attempt,correlation FROM audit WHERE job_id=? ORDER BY id LIMIT 20', id)];
        return reply({ receiptId: job.id, status: job.status, attempts: job.attempts, route: job.route, code: job.code, correlationId: job.correlation, audit });
      }
      if (request.method === 'GET' && url.pathname === '/internal/diagnostics') return reply({ jobs: [...this.sql.exec('SELECT status,COUNT(*) AS count FROM jobs GROUP BY status')], auditEntries: [...this.sql.exec('SELECT COUNT(*) AS count FROM audit')][0].count, aiProviderCalls: 0, aiExecutionEnabled: false });
      // Internal-only test API: no public Worker route and no provider executor.
      if (this.env.TEST_BUDGET === 'true' && request.method === 'POST' && url.pathname === '/internal/budget/reserve') {
        const input = await request.json();
        return reply(this.ctx.storage.transactionSync(() => reserveBudget(this.sql, input.request, input.config, input.now)));
      }
      if (this.env.TEST_BUDGET === 'true' && request.method === 'POST' && url.pathname === '/internal/budget/settle') {
        const input = await request.json();
        return reply(this.ctx.storage.transactionSync(() => settleBudget(this.sql, input.id, input.actualMicroEur)));
      }
      if (this.env.TEST_BUDGET === 'true' && request.method === 'POST' && url.pathname === '/internal/budget/claim') {
        const input = await request.json();
        return reply(this.ctx.storage.transactionSync(() => claimBudgetCall(this.sql, input.id)));
      }
      return reply({ code: 'NOT_FOUND' }, 404);
    } catch (error) {
      if (error instanceof Rejected) return reply({ code: error.code }, error.status);
      console.error(JSON.stringify({ service: 'archelaos-brain', code: 'INTERNAL_FAILURE', commit: this.env.DEPLOY_SHA }));
      return reply({ code: 'INTERNAL_FAILURE' }, 503);
    }
  }
  async alarm() {
    const now = Date.now();
    this.ctx.storage.transactionSync(() => recoverExecutionLeases(this.ctx.storage, now));
    // Arm crash recovery BEFORE claiming durable jobs. If execution stops after
    // a RUNNING write, another alarm will still reclaim its expired lease.
    await this.wake(now + 30000);
    let processed = 0;
    while (processed < 5) {
      const job = this.ctx.storage.transactionSync(() => {
        if (this.controlState().globalPaused) return null;
        const candidate = [...this.sql.exec('SELECT * FROM jobs WHERE ((status IN (?,?) AND due<=?) OR (status=? AND lease_until<=?)) AND NOT EXISTS(SELECT 1 FROM controls WHERE name=?||jobs.source AND value=1) ORDER BY due LIMIT 1', 'QUEUED', 'RETRY_WAIT', now, 'RUNNING', now, 'source:')][0];
        if (!candidate) return null;
        if (candidate.attempts >= 3) {
          this.sql.exec('UPDATE jobs SET status=?,code=?,updated=? WHERE id=?', 'DLQ', 'ATTEMPT_CAP', now, candidate.id);
          this.record(candidate, 'DLQ', 'ATTEMPT_CAP', now); return null;
        }
        candidate.attempts += 1;
        this.sql.exec('UPDATE jobs SET status=?,attempts=?,lease_until=?,updated=? WHERE id=?', 'RUNNING', candidate.attempts, now + 30000, now, candidate.id);
        this.record(candidate, 'RUNNING', 'DISPATCH_STARTED', now); return candidate;
      });
      if (!job) break;
      if (this.env.TEST_BUDGET === 'true' && this.env.TEST_STOP_AFTER_CLAIM === 'true') throw new Error('SYNTHETIC_STOP_AFTER_DURABLE_CLAIM');
      if (this.env.TEST_BUDGET === 'true' && this.env.TEST_PAUSE_WINDOW_MS === '200') await new Promise(resolve => setTimeout(resolve, 200));
      this.ctx.storage.transactionSync(() => {
        if (this.paused(job.source)) {
          this.sql.exec('UPDATE jobs SET status=?,attempts=attempts-1,lease_until=0,code=?,updated=? WHERE id=?', 'QUEUED', 'DISPATCH_PAUSED', Date.now(), job.id);
          this.record(job, 'QUEUED', 'DISPATCH_PAUSED', Date.now()); return;
        }
        const transient = job.type === 'staging.retry.always' || job.type === 'staging.retry.once' && job.attempts === 1;
        const status = transient ? (job.attempts >= 3 ? 'DLQ' : 'RETRY_WAIT') : (job.route === 'QUARANTINE' ? 'QUARANTINED' : 'WAITING_REVIEW');
        const code = transient ? 'STAGING_INJECTED_FAILURE' : (status === 'QUARANTINED' ? 'NO_APPROVED_ROUTE' : 'DETERMINISTIC_ROUTE_COMPLETE');
        const delay = this.env.STAGING_SHORT_RETRIES === 'true' ? 200 * 2 ** (job.attempts - 1) : 60000 * 2 ** (job.attempts - 1);
        this.sql.exec('UPDATE jobs SET status=?,code=?,due=?,lease_until=0,updated=? WHERE id=?', status, code, now + delay, now, job.id);
        this.record(job, status, code, now);
      });
      processed += 1;
    }
    const pending = this.controlState().globalPaused ? null : [...this.sql.exec('SELECT MIN(CASE WHEN status=? THEN lease_until ELSE due END) AS due FROM jobs WHERE status IN (?,?,?) AND NOT EXISTS(SELECT 1 FROM controls WHERE name=?||jobs.source AND value=1)', 'RUNNING', 'QUEUED', 'RETRY_WAIT', 'RUNNING', 'source:')][0].due;
    const execPending = [...this.sql.exec("SELECT MIN(lease_until) AS due FROM exec_intents WHERE status IN ('CLAIMED','IN_FLIGHT')")][0].due;
    const nextDue = [pending, execPending].filter(due => due !== null && due !== undefined);
    if (nextDue.length) await this.ctx.storage.setAlarm(Math.max(Date.now() + 10, Math.min(...nextDue)));
    else await this.ctx.storage.deleteAlarm();
  }
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (env.ENVIRONMENT !== 'staging' || !/^[0-9a-f]{40}$/.test(env.DEPLOY_SHA || '') || !Number.isFinite(Date.parse(env.STAGING_EXPIRES_AT)) || Date.now() >= Date.parse(env.STAGING_EXPIRES_AT)) throw new Rejected('STAGING_DISABLED_OR_EXPIRED', 503);
      if (request.method === 'GET' && url.pathname === '/healthz' && !url.search) return reply({ service: 'archelaos-brain', environment: 'staging', commit: env.DEPLOY_SHA, aiExecutionEnabled: false });
      const execPost = request.method === 'POST' &&
        ['/v1/exec/intents','/v1/exec/approvals','/v1/exec/claims','/v1/exec/begin',
         '/v1/exec/complete','/v1/exec/reconcile'].includes(url.pathname);
      const execGet = request.method === 'GET' &&
        (url.pathname === '/v1/exec/diagnostics' ||
         (url.pathname.startsWith('/v1/exec/intents/') &&
          UUID.test(url.pathname.slice('/v1/exec/intents/'.length))));
      const existingRoute = ((['GET','POST'].includes(request.method) && url.pathname === '/v1/control') ||
        (request.method === 'POST' && ['/v1/events','/v1/task-intents'].includes(url.pathname)) ||
        (request.method === 'GET' && (url.pathname === '/v1/diagnostics' ||
          (url.pathname.startsWith('/v1/tasks/') && UUID.test(url.pathname.slice('/v1/tasks/'.length))) ||
          (url.pathname.startsWith('/v1/task-intents/') && UUID.test(url.pathname.slice('/v1/task-intents/'.length))))));
      if (url.search || !(existingRoute || execPost || execGet)) throw new Rejected('NOT_FOUND', 404);
      const raw = await boundedBody(request);
      const source = await authenticate(request, env, raw);
      const coordinator = env.BRAIN.get(env.BRAIN.idFromName('central-v1'));
      if (url.pathname.startsWith('/v1/exec/')) {
        if (source !== 'operator') throw new Rejected('OPERATOR_SCOPE_REQUIRED', 403);
        const target = 'https://brain.internal/internal' + url.pathname.slice('/v1'.length);
        if (request.method === 'GET') return await coordinator.fetch(target);
        if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || ''))
          throw new Rejected('JSON_REQUIRED', 415);
        return await coordinator.fetch(target, { method: 'POST', body: raw });
      }
      if (url.pathname === '/v1/task-intents' || url.pathname.startsWith('/v1/task-intents/')) {
        if (source !== 'operator') throw new Rejected('OPERATOR_SCOPE_REQUIRED', 403);
        if (request.method === 'POST') {
          if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || '')) throw new Rejected('JSON_REQUIRED', 415);
          let input; try { input = JSON.parse(raw); } catch { throw new Rejected('INVALID_JSON', 422); }
          return await coordinator.fetch('https://brain.internal/internal/task-intents', { method: 'POST', body: JSON.stringify(input) });
        }
        return await coordinator.fetch('https://brain.internal' + url.pathname.replace('/v1/', '/internal/'));
      }
      if (url.pathname === '/v1/control') {
        if (source !== 'operator') throw new Rejected('OPERATOR_SCOPE_REQUIRED', 403);
        if (request.method === 'GET') return await coordinator.fetch('https://brain.internal/internal/control');
        let input; try { input = JSON.parse(raw); } catch { throw new Rejected('INVALID_JSON', 422); }
        return await coordinator.fetch('https://brain.internal/internal/control', { method: 'POST', body: JSON.stringify(input) });
      }
      if (request.method === 'POST') {
        if (source === 'operator') throw new Rejected('SOURCE_SCOPE_REQUIRED', 403);
        if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || '')) throw new Rejected('JSON_REQUIRED', 415);
        let event;
        try { event = JSON.parse(raw); } catch { throw new Rejected('INVALID_JSON', 422); }
        event = validateEvent(event, source);
        return await coordinator.fetch('https://brain.internal/internal/events', { method: 'POST', body: JSON.stringify(event) });
      }
      const internal = url.pathname.replace('/v1/', '/internal/');
      return await coordinator.fetch('https://brain.internal' + internal);
    } catch (error) {
      if (error instanceof Rejected) return reply({ code: error.code }, error.status);
      return reply({ code: 'INTERNAL_FAILURE' }, 503);
    }
  }
};
