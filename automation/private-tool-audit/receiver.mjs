// SOURCE ONLY: not mounted in any Worker, Brain router, or public endpoint.
// SQLite Durable Object contract for a future private tool audit sink.
// Requires a trusted service-bound caller; no HTTP handler is exported.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const SHA40 = /^[a-f0-9]{40}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ID = /^[a-z][a-z0-9-]{1,47}$/;
const TASK = /^[A-Z0-9][A-Z0-9:._-]{0,95}$/;
const OUTCOMES = new Set(['PASS', 'FAIL', 'BLOCKED', 'UNKNOWN', 'SKIPPED']);
const TOP_KEYS = ['v', 'source', 'issuedAt', 'nonce', 'record'];
const RECORD_KEYS = ['eventId', 'toolId', 'commandId', 'outcome', 'taskId', 'commitSha', 'evidenceUrl'];
const GENESIS = '0'.repeat(64);

export class AuditFault extends Error {
  constructor(code) { super(code); this.name = 'AuditFault'; this.code = code; }
}

function exact(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function validUrl(value) {
  if (value === null) return true;
  if (typeof value !== 'string' || value.length > 240) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname === 'github.com' &&
      !u.username && !u.password && !u.search && !u.hash &&
      u.pathname.startsWith('/dizigs/archelaos-site/');
  } catch { return false; }
}
export function canonicalEnvelope(envelope) {
  if (!exact(envelope, TOP_KEYS) || envelope.v !== 1 ||
    typeof envelope.source !== 'string' || !ID.test(envelope.source) ||
    !Number.isSafeInteger(envelope.issuedAt) || !UUID.test(envelope.nonce ?? '') ||
    !exact(envelope.record, RECORD_KEYS)) {
    throw new AuditFault('INVALID_ENVELOPE');
  }
  const r = envelope.record;
  if (!UUID.test(r.eventId ?? '') || !ID.test(r.toolId ?? '') ||
    !ID.test(r.commandId ?? '') || !OUTCOMES.has(r.outcome) ||
    (r.taskId !== null && (typeof r.taskId !== 'string' || !TASK.test(r.taskId))) ||
    (r.commitSha !== null && (typeof r.commitSha !== 'string' || !SHA40.test(r.commitSha))) ||
    !validUrl(r.evidenceUrl)) {
    throw new AuditFault('INVALID_RECORD');
  }
  return {
    v: 1,
    source: envelope.source,
    issuedAt: envelope.issuedAt,
    nonce: envelope.nonce,
    record: {
      eventId: r.eventId, toolId: r.toolId, commandId: r.commandId,
      outcome: r.outcome, taskId: r.taskId, commitSha: r.commitSha,
      evidenceUrl: r.evidenceUrl,
    },
  };
}
export function canonicalBytes(envelope) {
  const normalized = canonicalEnvelope(envelope);
  const serialized = JSON.stringify(normalized);
  if (Buffer.byteLength(serialized, 'utf8') > 1600) throw new AuditFault('ENVELOPE_TOO_LARGE');
  return serialized;
}
export function signForTrustedProducer(envelope, secret) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new AuditFault('INVALID_SECRET_CONFIG');
  }
  return createHmac('sha256', secret).update(canonicalBytes(envelope)).digest('hex');
}
export function authenticateSignedEnvelope({ envelope, signature, secrets, now = Date.now() }) {
  const serialized = canonicalBytes(envelope);
  if (!Number.isSafeInteger(now) || Math.abs(now - envelope.issuedAt) > 300000) {
    throw new AuditFault('STALE_OR_FUTURE_RECEIPT');
  }
  // Source IDs are untrusted selectors; only server-side secrets authorize a caller.
  const secret = secrets instanceof Map ? secrets.get(envelope.source) :
    (secrets && Object.hasOwn(secrets, envelope.source) ? secrets[envelope.source] : undefined);
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new AuditFault('UNKNOWN_SOURCE');
  }
  if (typeof signature !== 'string' || !HEX64.test(signature)) {
    throw new AuditFault('BAD_SIGNATURE');
  }
  const expected = createHmac('sha256', secret).update(serialized).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) throw new AuditFault('BAD_SIGNATURE');
  return canonicalEnvelope(envelope);
}
const sha256 = value => createHash('sha256').update(value).digest('hex');
const first = (sql, query, ...params) => [...sql.exec(query, ...params)][0];

export function createPrivateAuditStore(storage, { maxPerMinute = 60, maxRecords = 500000 } = {}) {
  if (typeof storage?.transactionSync !== 'function' || typeof storage?.sql?.exec !== 'function') {
    throw new AuditFault('SQLITE_DURABLE_STORAGE_REQUIRED');
  }
  if (!Number.isSafeInteger(maxPerMinute) || maxPerMinute < 1 || maxPerMinute > 300 ||
      !Number.isSafeInteger(maxRecords) || maxRecords < 1 || maxRecords > 1000000) {
    throw new AuditFault('INVALID_STORE_LIMITS');
  }
  const sql = storage.sql;
  for (const statement of [
    'CREATE TABLE IF NOT EXISTS tool_audit_state(id INTEGER PRIMARY KEY CHECK(id=1),total INTEGER NOT NULL,tail_hash TEXT NOT NULL)',
    'INSERT OR IGNORE INTO tool_audit_state(id,total,tail_hash) VALUES(1,0,?)',
    'CREATE TABLE IF NOT EXISTS tool_audit_nonces(source TEXT NOT NULL,nonce TEXT NOT NULL,expires INTEGER NOT NULL,PRIMARY KEY(source,nonce))',
    'CREATE TABLE IF NOT EXISTS tool_audit_rates(source TEXT NOT NULL,bucket INTEGER NOT NULL,used INTEGER NOT NULL,PRIMARY KEY(source,bucket))',
    'CREATE TABLE IF NOT EXISTS tool_audit_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,source TEXT NOT NULL,event_id TEXT NOT NULL,tool_id TEXT NOT NULL,command_id TEXT NOT NULL,outcome TEXT NOT NULL,task_id TEXT,commit_sha TEXT,evidence_url TEXT,server_at INTEGER NOT NULL,record_hash TEXT NOT NULL,prev_hash TEXT NOT NULL,receipt_hash TEXT NOT NULL,UNIQUE(source,event_id))',
    'CREATE INDEX IF NOT EXISTS tool_audit_filter ON tool_audit_events(tool_id,seq)',
  ]) {
    if (statement.startsWith('INSERT OR IGNORE')) sql.exec(statement, GENESIS);
    else sql.exec(statement);
  }

  function appendAuthenticated(envelope, now = Date.now()) {
    if (!Number.isSafeInteger(now)) throw new AuditFault('INVALID_SERVER_CLOCK');
    const e = canonicalEnvelope(envelope);
    const digest = sha256(JSON.stringify(e.record));
    // No await inside this transaction: nonce, quota, deduplication and ledger
    // state are committed together or rolled back together on any failure.
    return storage.transactionSync(() => {
      const nonce = first(sql, 'SELECT nonce FROM tool_audit_nonces WHERE source=? AND nonce=?', e.source, e.nonce);
      if (nonce) throw new AuditFault('REPLAY_BLOCKED');
      const bucket = Math.floor(now / 60000);
      const oldRate = first(sql, 'SELECT used FROM tool_audit_rates WHERE source=? AND bucket=?', e.source, bucket);
      if (oldRate && oldRate.used >= maxPerMinute) throw new AuditFault('RATE_BLOCKED');
      sql.exec('DELETE FROM tool_audit_nonces WHERE expires<?', now);
      sql.exec('DELETE FROM tool_audit_rates WHERE bucket<?', bucket - 1);
      sql.exec('INSERT INTO tool_audit_nonces(source,nonce,expires) VALUES(?,?,?)', e.source, e.nonce, now + 600000);
      sql.exec('INSERT INTO tool_audit_rates(source,bucket,used) VALUES(?,?,1) ON CONFLICT(source,bucket) DO UPDATE SET used=used+1', e.source, bucket);
      const old = first(sql, 'SELECT seq,record_hash,receipt_hash,server_at FROM tool_audit_events WHERE source=? AND event_id=?', e.source, e.record.eventId);
      if (old) {
        if (old.record_hash !== digest) throw new AuditFault('IDEMPOTENCY_CONFLICT');
        return { status: 'DUPLICATE', seq: old.seq, hash: old.receipt_hash, serverAt: old.server_at };
      }
      const state = first(sql, 'SELECT total,tail_hash FROM tool_audit_state WHERE id=1');
      if (!state || !HEX64.test(state.tail_hash) || !Number.isSafeInteger(state.total)) {
        throw new AuditFault('BROKEN_STORE_STATE');
      }
      if (state.total >= maxRecords) throw new AuditFault('AUDIT_CAPACITY_REACHED');
      const receiptHash = sha256(['audit-v1', state.tail_hash, digest, e.source, e.record.eventId, String(now)].join(':'));
      sql.exec(
        'INSERT INTO tool_audit_events(source,event_id,tool_id,command_id,outcome,task_id,commit_sha,evidence_url,server_at,record_hash,prev_hash,receipt_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
        e.source, e.record.eventId, e.record.toolId, e.record.commandId,
        e.record.outcome, e.record.taskId, e.record.commitSha, e.record.evidenceUrl,
        now, digest, state.tail_hash, receiptHash,
      );
      sql.exec('UPDATE tool_audit_state SET total=?,tail_hash=? WHERE id=1', state.total + 1, receiptHash);
      const inserted = first(sql, 'SELECT seq FROM tool_audit_events WHERE source=? AND event_id=?', e.source, e.record.eventId);
      if (!inserted || !Number.isSafeInteger(inserted.seq)) throw new AuditFault('INSERT_READBACK_FAILED');
      return { status: 'RECORDED', seq: inserted.seq, hash: receiptHash, serverAt: now };
    });
  }

  function listAuthorized({ after = 0, limit = 25, toolId = null } = {}) {
    // Call only after the existing Admin / Brain read authorization.
    // No public route or HTTP auth is provided by this module.
    if (!Number.isSafeInteger(after) || after < 0 ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
        (toolId !== null && !ID.test(toolId))) throw new AuditFault('INVALID_QUERY');
    const filter = toolId === null ?
      'WHERE seq>?' : 'WHERE seq>? AND tool_id=?';
    const params = toolId === null ? [after, limit] : [after, toolId, limit];
    return [...sql.exec(
      'SELECT seq,source,event_id,tool_id,command_id,outcome,task_id,commit_sha,evidence_url,server_at,record_hash,prev_hash,receipt_hash FROM tool_audit_events ' + filter + ' ORDER BY seq LIMIT ?',
      ...params,
    )];
  }

  return Object.freeze({ appendAuthenticated, listAuthorized });
}

export function createSignedAuditReceiver({ storage, secrets, allowedCommands, readerCapability = null, now = () => Date.now(), options = {} }) {
  if (!(allowedCommands instanceof Map) || allowedCommands.size === 0 ||
      typeof now !== 'function') throw new AuditFault('TRUSTED_POLICY_REQUIRED');
  const store = createPrivateAuditStore(storage, options);
  return Object.freeze({
    ingest(envelope, signature) {
      const serverAt = now();
      const verified = authenticateSignedEnvelope({ envelope, signature, secrets, now: serverAt });
      const permitted = allowedCommands.get(verified.record.toolId);
      if (!(permitted instanceof Set) || !permitted.has(verified.record.commandId)) {
        throw new AuditFault('COMMAND_NOT_ALLOWLISTED');
      }
      return store.appendAuthenticated(verified, serverAt);
    },
    // A non-serializable trusted symbol is required for every read, even if
    // this object is accidentally handed to an untrusted caller. The symbol
    // must be held only by the preauthenticated Admin/Brain service closure.
    listAuthorized(grant, query) {
      if (typeof readerCapability !== 'symbol' || grant !== readerCapability) {
        throw new AuditFault('READ_NOT_AUTHORIZED');
      }
      return store.listAuthorized(query);
    },
  });
}
