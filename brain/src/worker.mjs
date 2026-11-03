import { DurableObject } from 'cloudflare:workers';
import { Rejected, UUID, authenticate, boundedBody, digest, reply, route, validateEvent } from './contract.mjs';
import { reserveBudget, settleBudget } from './budget.mjs';

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,source TEXT NOT NULL,type TEXT NOT NULL,correlation TEXT NOT NULL,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,due INTEGER NOT NULL,lease_until INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL,updated INTEGER NOT NULL,route TEXT NOT NULL,code TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS jobs_due ON jobs(status,due)',
  'CREATE TABLE IF NOT EXISTS event_keys(key TEXT PRIMARY KEY,job_id TEXT NOT NULL,signature TEXT NOT NULL,kind TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,job_id TEXT NOT NULL,at INTEGER NOT NULL,status TEXT NOT NULL,code TEXT NOT NULL,attempt INTEGER NOT NULL,correlation TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS rate_counters(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS ai_months(month TEXT PRIMARY KEY,spent INTEGER NOT NULL,reserved INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS ai_reservations(id TEXT PRIMARY KEY,month TEXT NOT NULL,provider TEXT NOT NULL,amount INTEGER NOT NULL,status TEXT NOT NULL,actual INTEGER)',
  'CREATE TABLE IF NOT EXISTS ai_alerts(month TEXT NOT NULL,threshold INTEGER NOT NULL,PRIMARY KEY(month,threshold))'
];

export class BrainCoordinator extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env); this.ctx = ctx; this.env = env; this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => { for (const statement of SCHEMA) this.sql.exec(statement); });
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
        this.sql.exec('INSERT INTO jobs(id,source,type,correlation,status,due,created,updated,route,code) VALUES(?,?,?,?,?,?,?,?,?,?)', id, event.sourceType, event.eventType, event.correlationId, 'QUEUED', now, now, now, selected, 'ACCEPTED');
        this.record({ id, correlation: event.correlationId, attempts: 0 }, 'QUEUED', 'ACCEPTED', now);
      }
      for (const [key, keySignature, keyKind] of keys) this.sql.exec('INSERT OR IGNORE INTO event_keys(key,job_id,signature,kind) VALUES(?,?,?,?)', key, id, keySignature, keyKind);
      const job = [...this.sql.exec('SELECT * FROM jobs WHERE id=?', id)][0];
      return { receiptId: id, correlationId: job.correlation, eventId: event.eventId, dedupeKey: blob, status: job.status, duplicate: Boolean(existing), durable: true };
    });
    return reply(result, result.duplicate ? 200 : 202);
  }
  async fetch(request) {
    try {
      const url = new URL(request.url);
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
      return reply({ code: 'NOT_FOUND' }, 404);
    } catch (error) {
      if (error instanceof Rejected) return reply({ code: error.code }, error.status);
      console.error(JSON.stringify({ service: 'archelaos-brain', code: 'INTERNAL_FAILURE', commit: this.env.DEPLOY_SHA }));
      return reply({ code: 'INTERNAL_FAILURE' }, 503);
    }
  }
  async alarm() {
    const now = Date.now();
    // Arm crash recovery BEFORE claiming durable jobs. If execution stops after
    // a RUNNING write, another alarm will still reclaim its expired lease.
    await this.wake(now + 30000);
    let processed = 0;
    while (processed < 5) {
      const job = this.ctx.storage.transactionSync(() => {
        const candidate = [...this.sql.exec('SELECT * FROM jobs WHERE (status IN (?,?) AND due<=?) OR (status=? AND lease_until<=?) ORDER BY due LIMIT 1', 'QUEUED', 'RETRY_WAIT', now, 'RUNNING', now)][0];
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
      this.ctx.storage.transactionSync(() => {
        const transient = job.type === 'staging.retry.always' || job.type === 'staging.retry.once' && job.attempts === 1;
        const status = transient ? (job.attempts >= 3 ? 'DLQ' : 'RETRY_WAIT') : (job.route === 'QUARANTINE' ? 'QUARANTINED' : 'WAITING_REVIEW');
        const code = transient ? 'STAGING_INJECTED_FAILURE' : (status === 'QUARANTINED' ? 'NO_APPROVED_ROUTE' : 'DETERMINISTIC_ROUTE_COMPLETE');
        const delay = this.env.STAGING_SHORT_RETRIES === 'true' ? 200 * 2 ** (job.attempts - 1) : 60000 * 2 ** (job.attempts - 1);
        this.sql.exec('UPDATE jobs SET status=?,code=?,due=?,lease_until=0,updated=? WHERE id=?', status, code, now + delay, now, job.id);
        this.record(job, status, code, now);
      });
      processed += 1;
    }
    const pending = [...this.sql.exec('SELECT MIN(CASE WHEN status=? THEN lease_until ELSE due END) AS due FROM jobs WHERE status IN (?,?,?)', 'RUNNING', 'QUEUED', 'RETRY_WAIT', 'RUNNING')][0].due;
    if (pending !== null) await this.ctx.storage.setAlarm(Math.max(Date.now() + 10, pending));
    else await this.ctx.storage.deleteAlarm();
  }
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (env.ENVIRONMENT !== 'staging' || !/^[0-9a-f]{40}$/.test(env.DEPLOY_SHA || '') || !Number.isFinite(Date.parse(env.STAGING_EXPIRES_AT)) || Date.now() >= Date.parse(env.STAGING_EXPIRES_AT)) throw new Rejected('STAGING_DISABLED_OR_EXPIRED', 503);
      if (request.method === 'GET' && url.pathname === '/healthz' && !url.search) return reply({ service: 'archelaos-brain', environment: 'staging', commit: env.DEPLOY_SHA, aiExecutionEnabled: false });
      if (url.search || !((request.method === 'POST' && url.pathname === '/v1/events') || (request.method === 'GET' && (url.pathname === '/v1/diagnostics' || UUID.test(url.pathname.slice('/v1/tasks/'.length)) && url.pathname.startsWith('/v1/tasks/'))))) throw new Rejected('NOT_FOUND', 404);
      const raw = await boundedBody(request);
      const source = await authenticate(request, env, raw);
      const coordinator = env.BRAIN.get(env.BRAIN.idFromName('central-v1'));
      if (request.method === 'POST') {
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
