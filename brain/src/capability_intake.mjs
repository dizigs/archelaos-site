/**
 * Canonical private capability intakes within the EXISTING BrainCoordinator DO.
 * Implements the #201 Apps Script and #220 Analytics envelope shapes.
 * Does not trust client-supplied provider claims as independent provenance.
 * No external calls, AI dispatch, Google writes or second budget ledger.
 */
import { Rejected, HEX, UUID, digest } from './contract.mjs';

const SHA = /^[0-9a-f]{40}$/;
const DAY = 86_400_000;
const ANALYTICS_SOURCES = Object.freeze({
  ga4: new Set(['sessions', 'users', 'engaged_sessions', 'key_events']),
  search_console: new Set(['clicks', 'impressions', 'ctr_pct', 'position']),
  clarity: new Set(['sessions', 'dead_clicks', 'rage_clicks', 'scroll_depth_pct']),
  cloudflare_web_analytics: new Set(['visits', 'page_views'])
});
const PHASES = Object.freeze({
  'apps_script.source.read': 'SOURCE_READ_VERIFIED',
  'apps_script.backup.verified': 'BACKUP_VERIFIED',
  'apps_script.rollback.verified': 'SMOKE_ROLLBACK_VERIFIED'
});
const WORKFLOWS = Object.freeze({
  ga4: 'Google Search and GA4 daily aggregate',
  search_console: 'Google Search and GA4 daily aggregate',
  clarity: 'Clarity daily private aggregate report'
});
const exact = (value, keys) => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && Object.keys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key));
const fail = (code, status = 422) => { throw new Rejected(code, status); };
const positive = n => Number.isSafeInteger(n) && n > 0;
function time(value, now) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      Date.parse(value) > now + 300_000 || Date.parse(value) < now - 7 * DAY)
    fail('CAPABILITY_INVALID_TIME');
  return Date.parse(value);
}
function day(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value) ||
      !Number.isFinite(Date.parse(value + 'T00:00:00Z')) ||
      new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value)
    fail('CAPABILITY_INVALID_DAY');
  return value;
}
function digestUuid(hex) {
  const variant = ((Number.parseInt(hex[16], 16) & 3) | 8).toString(16);
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-5' + hex.slice(13, 16) +
    '-' + variant + hex.slice(17, 20) + '-' + hex.slice(20, 32);
}
export const CAPABILITY_SCHEMA = [
  "CREATE TABLE IF NOT EXISTS analytics_snapshots(snapshot_key TEXT PRIMARY KEY,metric_revision TEXT NOT NULL,event_id TEXT NOT NULL,observed INTEGER NOT NULL,receipt_id TEXT NOT NULL,report_digest TEXT NOT NULL,aggregate_json TEXT NOT NULL,updated INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS analytics_snapshot_versions(receipt_id TEXT PRIMARY KEY,snapshot_key TEXT NOT NULL,event_id TEXT NOT NULL UNIQUE,metric_revision TEXT NOT NULL,source TEXT NOT NULL,correlation_id TEXT NOT NULL,report_digest TEXT NOT NULL,producer_evidence_digest TEXT NOT NULL,run_id INTEGER NOT NULL,artifact_id INTEGER NOT NULL,run_sha TEXT NOT NULL,observed INTEGER NOT NULL,status TEXT NOT NULL,created INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS capability_deliveries(source TEXT NOT NULL,event_id TEXT NOT NULL,receipt_id TEXT NOT NULL,body_digest TEXT NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(source,event_id))",
  "CREATE TABLE IF NOT EXISTS apps_script_receipts(event_id TEXT PRIMARY KEY,receipt_id TEXT NOT NULL,operation_id TEXT NOT NULL,phase TEXT NOT NULL,source_fingerprint TEXT NOT NULL,source_revision TEXT NOT NULL,evidence_digest TEXT NOT NULL,observed INTEGER NOT NULL,UNIQUE(operation_id,phase))",
  "CREATE TABLE IF NOT EXISTS capability_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,receipt_id TEXT NOT NULL,source TEXT NOT NULL,code TEXT NOT NULL,created INTEGER NOT NULL)"
];

export async function validateAnalyticsSnapshot(request, now = Date.now()) {
  if (!exact(request, ['schemaVersion', 'event', 'snapshotKey', 'metricRevision', 'evidence', 'operation']) ||
      request.schemaVersion !== 1 || request.operation !== 'UPSERT_NOT_INCREMENT')
    fail('ANALYTICS_INVALID_REQUEST');
  const { event, evidence } = request;
  if (!exact(event, ['schemaVersion', 'eventId', 'source', 'type', 'sourceRevision', 'observedAt',
    'correlationId', 'payload', 'privacyStatus', 'aiRouting', 'publish']) ||
    event.schemaVersion !== 1 || event.source !== 'analytics' || event.type !== 'aggregate_report_ready' ||
    event.privacyStatus !== 'AGGREGATED_ONLY' || event.aiRouting !== 'CENTRAL_BRAIN_ONLY' ||
    event.publish !== false || !HEX.test(event.eventId) || !HEX.test(event.sourceRevision) ||
    typeof event.correlationId !== 'string' || event.correlationId !== event.eventId.slice(0, 24))
    fail('ANALYTICS_INVALID_EVENT');
  const observed = time(event.observedAt, now);
  const payload = event.payload;
  if (!exact(payload, ['schemaVersion', 'source', 'reportDigest', 'period', 'metrics',
    'suppressedRows', 'rawVisitorDataStored', 'externalAiCalls']) ||
    payload.schemaVersion !== 1 || !Object.hasOwn(ANALYTICS_SOURCES, payload.source) ||
    !HEX.test(payload.reportDigest) || payload.reportDigest !== event.sourceRevision ||
    payload.rawVisitorDataStored !== false || payload.externalAiCalls !== 0 ||
    !Number.isSafeInteger(payload.suppressedRows) || payload.suppressedRows < 0 ||
    payload.suppressedRows > 300 || !exact(payload.period, ['from', 'to']))
    fail('ANALYTICS_INVALID_AGGREGATE');
  const from = day(payload.period.from), to = day(payload.period.to);
  if (to < from || (Date.parse(to) - Date.parse(from)) / DAY > 31 ||
      request.snapshotKey !== payload.source + '|' + from + '|' + to ||
      !HEX.test(request.metricRevision)) fail('ANALYTICS_INVALID_SNAPSHOT_KEY');
  if (!Array.isArray(payload.metrics) || payload.metrics.length > 300) fail('ANALYTICS_INVALID_METRICS');
  const seen = new Set();
  for (const metric of payload.metrics) {
    if (!exact(metric, ['pagePath', 'name', 'value', 'sampleSize', 'confidence']) ||
        typeof metric.pagePath !== 'string' || !/^\/[A-Za-z0-9/_\-.]{0,180}$/.test(metric.pagePath) ||
        metric.pagePath.includes('//') || metric.pagePath.includes('..') ||
        !ANALYTICS_SOURCES[payload.source].has(metric.name) ||
        typeof metric.value !== 'number' || !Number.isFinite(metric.value) || metric.value < 0 ||
        metric.value > (['scroll_depth_pct', 'ctr_pct'].includes(metric.name) ? 100 :
          metric.name === 'position' ? 1000 : 1_000_000_000) ||
        !Number.isSafeInteger(metric.sampleSize) || metric.sampleSize < 20 ||
        metric.sampleSize > 1_000_000_000 ||
        metric.confidence !== 'AGGREGATE_ONLY_NO_CAUSAL_INFERENCE' ||
        seen.has(metric.pagePath + '|' + metric.name)) fail('ANALYTICS_UNSAFE_MEASUREMENT');
    seen.add(metric.pagePath + '|' + metric.name);
  }
  if (!exact(evidence, ['repository', 'runId', 'artifactId', 'runSha', 'reportDigest', 'workflow', 'observedAt']) ||
      evidence.repository !== 'dizigs/archelaos-site' || !positive(evidence.runId) ||
      !positive(evidence.artifactId) || !SHA.test(evidence.runSha) ||
      evidence.reportDigest !== payload.reportDigest ||
      evidence.workflow !== WORKFLOWS[payload.source] ||
      time(evidence.observedAt, now) !== observed)
    fail('ANALYTICS_UNTRUSTED_PROVENANCE');
  if (await digest('analytics|' + payload.source + '|' + payload.reportDigest + '|' + from + '|' + to) !== event.eventId ||
      await digest(JSON.stringify(payload.metrics)) !== request.metricRevision)
    fail('ANALYTICS_HASH_MISMATCH', 409);
  return { eventId: event.eventId, snapshotKey: request.snapshotKey,
    metricRevision: request.metricRevision, observed, reportDigest: payload.reportDigest,
    source: payload.source, correlationId: event.correlationId,
    producerEvidenceDigest: await digest(JSON.stringify(evidence)),
    runId: evidence.runId, artifactId: evidence.artifactId, runSha: evidence.runSha,
    aggregate: JSON.stringify({ source: payload.source, period: payload.period,
      metrics: payload.metrics, suppressedRows: payload.suppressedRows }) };
}

export async function validateAppsScriptEvent(event, now = Date.now()) {
  if (!exact(event, ['schemaVersion', 'eventId', 'source', 'type', 'sourceRevision',
    'observedAt', 'correlationId', 'metadata']) ||
    event.schemaVersion !== 1 || event.source !== 'apps_script' ||
    !Object.hasOwn(PHASES, event.type) || !UUID.test(event.eventId || '') ||
    !UUID.test(event.correlationId || '') || !HEX.test(event.sourceRevision || '') ||
    !exact(event.metadata, ['sourceFingerprint', 'evidenceDigest', 'privacy']) ||
    !HEX.test(event.metadata.sourceFingerprint || '') ||
    !HEX.test(event.metadata.evidenceDigest || '') ||
    event.metadata.privacy !== 'OPAQUE_AUDIT_ONLY')
    fail('APPS_SCRIPT_INVALID_EVENT');
  const observed = time(event.observedAt, now);
  const fingerprint = await digest('archelaos|apps-script|v1|' + event.correlationId +
    '|' + PHASES[event.type] + '|' + event.metadata.sourceFingerprint +
    '|' + event.sourceRevision + '|' + event.metadata.evidenceDigest);
  if (digestUuid(fingerprint) !== event.eventId) fail('APPS_SCRIPT_HASH_MISMATCH', 409);
  return { eventId: event.eventId, operationId: event.correlationId, phase: event.type,
    observed, sourceFingerprint: event.metadata.sourceFingerprint,
    sourceRevision: event.sourceRevision, evidenceDigest: event.metadata.evidenceDigest };
}

/** Both capabilities use the existing BrainCoordinator storage and transactionSync. */
/**
 * UPSERT identity is (source, from, to), not an incrementing counter.
 * Each revision has a distinct immutable receipt; current snapshot points at it.
 * The optional trusted beforeCommit gate runs WITHIN the same SQLite transaction
 * as rate limiting, global/source pause and all receipt writes.
 */
export function persistAnalyticsSnapshot(storage, validated, bodyDigest,
  now = Date.now(), beforeCommit) {
  if (typeof storage?.transactionSync !== 'function') fail('DURABLE_STORAGE_REQUIRED', 503);
  if (!HEX.test(bodyDigest || '') || typeof beforeCommit !== 'function')
    fail('TRUSTED_CAPABILITY_GATE_REQUIRED', 503);
  return storage.transactionSync(() => {
    beforeCommit();
    const sql = storage.sql;
    const prior = [...sql.exec('SELECT * FROM capability_deliveries WHERE source=? AND event_id=?',
      'analytics', validated.eventId)][0];
    if (prior) {
      if (prior.body_digest !== bodyDigest) fail('CAPABILITY_IDEMPOTENCY_CONFLICT', 409);
      const current = [...sql.exec('SELECT receipt_id FROM analytics_snapshots WHERE snapshot_key=?',
        validated.snapshotKey)][0];
      if (!current || current.receipt_id !== prior.receipt_id)
        fail('ANALYTICS_REVISION_SUPERSEDED', 409);
      return { receiptId: prior.receipt_id, eventId: validated.eventId,
        snapshotKey: validated.snapshotKey, metricRevision: validated.metricRevision,
        status: 'DUPLICATE', durable: true, producerEvidenceDigest: validated.producerEvidenceDigest,
        correlationId: validated.correlationId };
    }
    const old = [...sql.exec('SELECT * FROM analytics_snapshots WHERE snapshot_key=?',
      validated.snapshotKey)][0];
    if (old) {
      const priorVersion = [...sql.exec(
        'SELECT * FROM analytics_snapshot_versions WHERE receipt_id=?', old.receipt_id)][0];
      if (!priorVersion) fail('ANALYTICS_IMMUTABLE_HISTORY_MISSING', 503);
      // Event time = verified provider workflow completion time, NOT ingest time.
      // Equal timestamps are deterministically ordered by authoritative run ID.
      // A newer run with identical metrics is still a NEW provenanced version.
      if (validated.observed < priorVersion.observed ||
          (validated.observed === priorVersion.observed &&
           validated.runId <= priorVersion.run_id))
        fail('ANALYTICS_STALE_OR_AMBIGUOUS_REVISION', 409);
    }
    if ([...sql.exec('SELECT COUNT(*) AS n FROM capability_deliveries')][0].n >= 10_000)
      fail('CAPABILITY_CAPACITY_REACHED', 429);
    const id = crypto.randomUUID();
    const status = old ? 'UPDATED' : 'ACCEPTED';
    sql.exec('INSERT INTO analytics_snapshot_versions(receipt_id,snapshot_key,event_id,metric_revision,source,correlation_id,report_digest,producer_evidence_digest,run_id,artifact_id,run_sha,observed,status,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      id, validated.snapshotKey, validated.eventId, validated.metricRevision,
      validated.source, validated.correlationId, validated.reportDigest,
      validated.producerEvidenceDigest, validated.runId, validated.artifactId,
      validated.runSha, validated.observed, status, now);
    if (!old) {
      sql.exec('INSERT INTO analytics_snapshots(snapshot_key,metric_revision,event_id,observed,receipt_id,report_digest,aggregate_json,updated) VALUES(?,?,?,?,?,?,?,?)',
        validated.snapshotKey, validated.metricRevision, validated.eventId,
        validated.observed, id, validated.reportDigest, validated.aggregate, now);
    } else {
      sql.exec('UPDATE analytics_snapshots SET metric_revision=?,event_id=?,observed=?,receipt_id=?,report_digest=?,aggregate_json=?,updated=? WHERE snapshot_key=?',
        validated.metricRevision, validated.eventId, validated.observed, id,
        validated.reportDigest, validated.aggregate, now, validated.snapshotKey);
    }
    sql.exec('INSERT INTO capability_deliveries(source,event_id,receipt_id,body_digest,created) VALUES(?,?,?,?,?)',
      'analytics', validated.eventId, id, bodyDigest, now);
    sql.exec('INSERT INTO capability_audit(receipt_id,source,code,created) VALUES(?,?,?,?)',
      id, 'analytics', status, now);
    return { receiptId: id, eventId: validated.eventId, snapshotKey: validated.snapshotKey,
      metricRevision: validated.metricRevision, status, durable: true,
      producerEvidenceDigest: validated.producerEvidenceDigest,
      correlationId: validated.correlationId };
  });
}

/**
 * Read ONLY immutable revision metadata from the canonical ledger.
 * A superseded version still exists, but is explicitly marked not-current.
 */
export function readAnalyticsSnapshotReceipt(storage, input) {
  if (!exact(input, ['receiptId', 'eventId', 'snapshotKey']) ||
      !UUID.test(input.receiptId || '') || !HEX.test(input.eventId || '') ||
      typeof input.snapshotKey !== 'string' || input.snapshotKey.length > 120)
    fail('ANALYTICS_INVALID_READBACK', 422);
  const sql = storage.sql;
  const row = [...sql.exec('SELECT * FROM analytics_snapshot_versions WHERE receipt_id=?',
    input.receiptId)][0];
  if (!row || row.event_id !== input.eventId || row.snapshot_key !== input.snapshotKey)
    fail('ANALYTICS_RECEIPT_NOT_FOUND', 404);
  const current = [...sql.exec('SELECT receipt_id FROM analytics_snapshots WHERE snapshot_key=?',
    row.snapshot_key)][0];
  if (!current) fail('ANALYTICS_CURRENT_SNAPSHOT_MISSING', 503);
  return { receiptId: row.receipt_id, eventId: row.event_id,
    snapshotKey: row.snapshot_key, metricRevision: row.metric_revision,
    reportDigest: row.report_digest, source: row.source,
    correlationId: row.correlation_id, producerEvidenceDigest: row.producer_evidence_digest,
    status: row.status, isCurrent: current.receipt_id === row.receipt_id, durable: true };
}

export function readAppsScriptReceipt(storage, input) {
  if (!exact(input, ['receiptId', 'eventId', 'operationId']) ||
      !UUID.test(input.receiptId || '') || !UUID.test(input.eventId || '') ||
      !UUID.test(input.operationId || ''))
    fail('APPS_SCRIPT_INVALID_READBACK', 422);
  const row = [...storage.sql.exec('SELECT * FROM apps_script_receipts WHERE receipt_id=?',
    input.receiptId)][0];
  if (!row || row.event_id !== input.eventId || row.operation_id !== input.operationId)
    fail('APPS_SCRIPT_RECEIPT_NOT_FOUND', 404);
  return { receiptId: row.receipt_id, eventId: row.event_id,
    correlationId: row.operation_id, phase: row.phase,
    sourceRevision: row.source_revision, evidenceDigest: row.evidence_digest,
    status: 'WAITING_REVIEW', durable: true };
}

export function persistAppsScriptEvent(storage, validated, bodyDigest,
  now = Date.now(), beforeCommit) {
  if (typeof storage?.transactionSync !== 'function') fail('DURABLE_STORAGE_REQUIRED', 503);
  if (!HEX.test(bodyDigest || '') || typeof beforeCommit !== 'function')
    fail('TRUSTED_CAPABILITY_GATE_REQUIRED', 503);
  return storage.transactionSync(() => {
    beforeCommit();
    const sql = storage.sql;
    const prior = [...sql.exec('SELECT * FROM capability_deliveries WHERE source=? AND event_id=?',
      'apps_script', validated.eventId)][0];
    if (prior) {
      if (prior.body_digest !== bodyDigest) fail('CAPABILITY_IDEMPOTENCY_CONFLICT', 409);
      return { receiptId: prior.receipt_id, correlationId: validated.operationId,
        status: 'WAITING_REVIEW', durable: true, duplicate: true };
    }
    const collision = [...sql.exec('SELECT event_id FROM apps_script_receipts WHERE operation_id=? AND phase=?',
      validated.operationId, validated.phase)][0];
    if (collision) fail('APPS_SCRIPT_OPERATION_CONFLICT', 409);
    if ([...sql.exec('SELECT COUNT(*) AS n FROM capability_deliveries')][0].n >= 10_000)
      fail('CAPABILITY_CAPACITY_REACHED', 429);
    const id = crypto.randomUUID();
    sql.exec('INSERT INTO apps_script_receipts(event_id,receipt_id,operation_id,phase,source_fingerprint,source_revision,evidence_digest,observed) VALUES(?,?,?,?,?,?,?,?)',
      validated.eventId, id, validated.operationId, validated.phase, validated.sourceFingerprint,
      validated.sourceRevision, validated.evidenceDigest, validated.observed);
    sql.exec('INSERT INTO capability_deliveries(source,event_id,receipt_id,body_digest,created) VALUES(?,?,?,?,?)',
      'apps_script', validated.eventId, id, bodyDigest, now);
    sql.exec('INSERT INTO capability_audit(receipt_id,source,code,created) VALUES(?,?,?,?)',
      id, 'apps_script', 'WAITING_REVIEW', now);
    return { receiptId: id, correlationId: validated.operationId,
      status: 'WAITING_REVIEW', durable: true, duplicate: false };
  });
}
