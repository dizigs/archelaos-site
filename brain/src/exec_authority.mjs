import { Rejected, HEX, UUID, digest } from './contract.mjs';
import { reserveBudget, settleBudget, claimBudgetCall } from './budget.mjs';

// An extension of the EXISTING BrainCoordinator SQLite Durable Object, not a new Worker.
// External executor adapters must obtain an independently authenticated Brain receipt.
const SHA = /^[a-f0-9]{40}$/;
const TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
const FIELDS = ['schemaVersion', 'taskId', 'roadmapIssue', 'type', 'baseCommit', 'allowedPaths', 'issuedAt', 'expiresAt'];
const ROUTES = Object.freeze({
  BUILD_A: { executor: 'gemini', budgetProvider: 'gemini' },
  BUILD_B: { executor: 'gemma', budgetProvider: 'gemma' },
  TESTING: { executor: 'github-actions' },
  SELF_HEAL: { executor: 'self-heal' },
  APPS_SCRIPT: { executor: 'apps-script' },
  ANALYTICS: { executor: 'analytics' },
  LIBRARIAN: { executor: 'librarian' }
});
const BUILD = new Set(['BUILD_A', 'BUILD_B']);
const PATH_ROOTS = ['brain/', 'automation/', 'rebuild/', 'tests/', 'functions/', 'assets/'];
const MAX_ROWS = 500;
const LEASE_MS = 30_000;

export const EXEC_SCHEMA = [
  'CREATE TABLE IF NOT EXISTS exec_intents(task_id TEXT PRIMARY KEY,payload TEXT NOT NULL,fingerprint TEXT NOT NULL,status TEXT NOT NULL,owner TEXT,lease_until INTEGER NOT NULL DEFAULT 0,budget_id TEXT,attempts INTEGER NOT NULL DEFAULT 0,result_digest TEXT,approval_evidence TEXT,created INTEGER NOT NULL,updated INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS exec_ready ON exec_intents(status,created)',
  'CREATE TABLE IF NOT EXISTS exec_path_locks(path TEXT PRIMARY KEY,task_id TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS exec_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,task_id TEXT NOT NULL,at INTEGER NOT NULL,status TEXT NOT NULL,code TEXT NOT NULL)'
];

function exact(value, names) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === names.length && names.every(k => Object.hasOwn(value, k));
}
function validPath(path) {
  return typeof path === 'string' && path.length <= 180 && /^[a-zA-Z0-9_./-]+$/.test(path) &&
    !path.startsWith('/') && !path.includes('//') && !path.endsWith('/') &&
    !path.split('/').some(part => part === '.' || part === '..' || part === '') &&
    PATH_ROOTS.some(root => path.startsWith(root));
}
function overlap(left, right) {
  return left === right || left.startsWith(right + '/') || right.startsWith(left + '/');
}
function requireIdentity(id) {
  if (!UUID.test(id || '')) throw new Rejected('EXEC_INVALID_TASK_ID', 422);
}
function audit(sql, id, status, code, now) {
  sql.exec('INSERT INTO exec_audit(task_id,at,status,code) VALUES(?,?,?,?)', id, now, status, code);
}
function readRow(sql, id) {
  requireIdentity(id);
  const row = [...sql.exec('SELECT * FROM exec_intents WHERE task_id=?', id)][0];
  if (!row) throw new Rejected('EXEC_NOT_FOUND', 404);
  return row;
}
function view(row, duplicate = false) {
  const task = JSON.parse(row.payload);
  return { taskId: task.taskId, type: task.type, executor: ROUTES[task.type].executor,
    baseCommit: task.baseCommit, scopeDigest: row.fingerprint, status: row.status,
    attempts: row.attempts, budgetReservationId: row.budget_id || null,
    duplicate, productionAllowed: false, autoMergeAllowed: false };
}
export function validateExecutionIntent(input, now = Date.now()) {
  if (!exact(input, FIELDS) || input.schemaVersion !== 1 ||
      !UUID.test(input.taskId || '') || ![71, 108].includes(input.roadmapIssue) ||
      !Object.hasOwn(ROUTES, input.type) || !SHA.test(input.baseCommit || '')) {
    throw new Rejected('EXEC_INVALID_INTENT', 422);
  }
  if (!Array.isArray(input.allowedPaths) || input.allowedPaths.length < 1 ||
      input.allowedPaths.length > 12 || input.allowedPaths.some(p => !validPath(p)) ||
      new Set(input.allowedPaths).size !== input.allowedPaths.length) {
    throw new Rejected('EXEC_INVALID_PATH_SCOPE', 422);
  }
  if (!TIME.test(input.issuedAt || '') || !TIME.test(input.expiresAt || '')) throw new Rejected('EXEC_INVALID_TIME', 422);
  const issued = Date.parse(input.issuedAt), expires = Date.parse(input.expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) ||
      issued < now - 15 * 60_000 || issued > now + 5 * 60_000 ||
      expires <= now || expires > issued + 24 * 60 * 60_000) {
    throw new Rejected('EXEC_EXPIRED', 422);
  }
  return { ...input, allowedPaths: [...input.allowedPaths].sort((a, b) => a.localeCompare(b)) };
}
export async function submitExecutionIntent(storage, input, now = Date.now()) {
  const task = validateExecutionIntent(input, now);
  const serialized = JSON.stringify(task);
  const fingerprint = await digest(serialized);
  return storage.transactionSync(() => {
    const sql = storage.sql;
    const existing = [...sql.exec('SELECT * FROM exec_intents WHERE task_id=?', task.taskId)][0];
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new Rejected('EXEC_IDEMPOTENCY_CONFLICT', 409);
      return view(existing, true);
    }
    if ([...sql.exec('SELECT COUNT(*) AS n FROM exec_intents')][0].n >= MAX_ROWS) throw new Rejected('EXEC_DURABLE_CAPACITY', 429);
    sql.exec('INSERT INTO exec_intents(task_id,payload,fingerprint,status,created,updated) VALUES(?,?,?,?,?,?)',
      task.taskId, serialized, fingerprint, 'PENDING_REVIEW', now, now);
    audit(sql, task.taskId, 'PENDING_REVIEW', 'SIGNED_OPERATOR_SUBMISSION', now);
    return view(readRow(sql, task.taskId));
  });
}
export function approveExecutionIntent(storage, input, controls, now = Date.now()) {
  if (!exact(input, ['taskId', 'scopeDigest', 'evidenceSha256']) ||
      !HEX.test(input.scopeDigest || '') || !HEX.test(input.evidenceSha256 || '')) throw new Rejected('EXEC_INVALID_APPROVAL', 422);
  return storage.transactionSync(() => {
    const sql = storage.sql;
    if (controls.globalPaused) throw new Rejected('EXEC_PAUSED', 423);
    const row = readRow(sql, input.taskId), task = JSON.parse(row.payload);
    if (row.fingerprint !== input.scopeDigest) throw new Rejected('EXEC_APPROVAL_SCOPE_MISMATCH', 409);
    if (Date.parse(task.expiresAt) <= now) throw new Rejected('EXEC_EXPIRED', 409);
    if (row.status === 'QUEUED' && row.approval_evidence === input.evidenceSha256) return view(row, true);
    if (row.status !== 'PENDING_REVIEW') throw new Rejected('EXEC_APPROVAL_CONFLICT', 409);
    sql.exec('UPDATE exec_intents SET status=?,approval_evidence=?,updated=? WHERE task_id=?', 'QUEUED', input.evidenceSha256, now, task.taskId);
    audit(sql, task.taskId, 'QUEUED', 'EXPLICIT_OPERATOR_APPROVAL', now);
    return view(readRow(sql, task.taskId));
  });
}
export function recoverExecutionLeases(storage, now = Date.now()) {
  const sql = storage.sql;
  const expired = [...sql.exec('SELECT task_id FROM exec_intents WHERE status IN (?,?) AND lease_until<=?', 'CLAIMED', 'IN_FLIGHT', now)];
  for (const { task_id } of expired) {
    // No automatic retry of an uncertain remote side effect. Locks and
    // reservations remain held pending an independently verified reconciliation.
    sql.exec('UPDATE exec_intents SET status=?,updated=? WHERE task_id=?', 'RECONCILE_REQUIRED', now, task_id);
    audit(sql, task_id, 'RECONCILE_REQUIRED', 'LEASE_EXPIRED_OUTCOME_UNKNOWN', now);
  }
  return expired.length;
}
export function claimExecutionIntent(storage, input, controls, config, now = Date.now()) {
  if (!exact(input, ['taskId']) || !UUID.test(input.taskId || '')) throw new Rejected('EXEC_INVALID_CLAIM', 422);
  return storage.transactionSync(() => {
    const sql = storage.sql;
    recoverExecutionLeases(storage, now);
    const row = readRow(sql, input.taskId), task = JSON.parse(row.payload);
    if (row.status !== 'QUEUED') throw new Rejected('EXEC_NOT_QUEUED', 409);
    if (Date.parse(task.expiresAt) <= now) throw new Rejected('EXEC_EXPIRED', 409);
    if (controls.globalPaused || (BUILD.has(task.type) && controls.aiPaused)) throw new Rejected('EXEC_PAUSED', 423);
    if (BUILD.has(task.type)) {
      const busy = [...sql.exec("SELECT COUNT(*) AS n FROM exec_intents WHERE status IN ('CLAIMED','IN_FLIGHT','RECONCILE_REQUIRED') AND json_extract(payload,'$.type') IN ('BUILD_A','BUILD_B')")][0].n;
      if (busy >= 2) throw new Rejected('EXEC_BUILD_CONCURRENCY_LIMIT', 429);
    }
    const locks = [...sql.exec('SELECT path,task_id FROM exec_path_locks')];
    if (task.allowedPaths.some(path => locks.some(lock => lock.task_id !== task.taskId && overlap(path, lock.path)))) {
      throw new Rejected('EXEC_PATH_LOCKED', 409);
    }
    let budgetId = null;
    if (BUILD.has(task.type)) {
      const provider = ROUTES[task.type].budgetProvider;
      const bounded = config?.bounds?.[provider];
      if (!config || !bounded || !Number.isSafeInteger(bounded.maxInputTokens) ||
          !Number.isSafeInteger(bounded.maxOutputTokens)) throw new Rejected('EXEC_VERIFIED_BUDGET_REQUIRED', 409);
      const result = reserveBudget(sql, {
        reservationId: row.fingerprint, eventId: task.taskId, sourceRevision: row.fingerprint,
        operation: 'build', provider, model: config.prices?.[provider]?.model,
        maxInputTokens: bounded.maxInputTokens, maxOutputTokens: bounded.maxOutputTokens
      }, config, now);
      budgetId = result.reservationId;
    }
    for (const path of task.allowedPaths) sql.exec('INSERT INTO exec_path_locks(path,task_id) VALUES(?,?)', path, task.taskId);
    const owner = crypto.randomUUID();
    sql.exec('UPDATE exec_intents SET status=?,owner=?,lease_until=?,budget_id=?,attempts=attempts+1,updated=? WHERE task_id=?',
      'CLAIMED', owner, now + LEASE_MS, budgetId, now, task.taskId);
    audit(sql, task.taskId, 'CLAIMED', 'BOUNDED_SCOPE_AND_BUDGET_RESERVED', now);
    return { ...view(readRow(sql, task.taskId)), owner, leaseUntil: now + LEASE_MS,
      allowedPaths: task.allowedPaths };
  });
}
export function beginExecutionCall(storage, input, now = Date.now()) {
  if (!exact(input, ['taskId', 'owner']) || !UUID.test(input.owner || '')) throw new Rejected('EXEC_INVALID_BEGIN', 422);
  return storage.transactionSync(() => {
    const sql = storage.sql, row = readRow(sql, input.taskId);
    if (row.status !== 'CLAIMED' || row.owner !== input.owner || row.lease_until <= now) throw new Rejected('EXEC_CLAIM_LOST', 409);
    if (row.budget_id && !claimBudgetCall(sql, row.budget_id).authorized) throw new Rejected('EXEC_BUDGET_CALL_NOT_AUTHORIZED', 409);
    sql.exec('UPDATE exec_intents SET status=?,updated=? WHERE task_id=?', 'IN_FLIGHT', now, input.taskId);
    audit(sql, input.taskId, 'IN_FLIGHT', 'ONE_SHOT_EXTERNAL_CALL_CLAIMED', now);
    return { taskId: input.taskId, status: 'IN_FLIGHT', oneShot: true };
  });
}
export function finishExecutionIntent(storage, input, now = Date.now()) {
  if (!exact(input, ['taskId','owner','outcome','evidenceSha256','actualMicroEur']) ||
      !UUID.test(input.owner || '') || !HEX.test(input.evidenceSha256 || '') ||
      !['SUCCEEDED','FAILED'].includes(input.outcome)) throw new Rejected('EXEC_INVALID_COMPLETION', 422);
  return storage.transactionSync(() => {
    const sql = storage.sql, row = readRow(sql, input.taskId);
    if (row.owner !== input.owner || row.lease_until <= now ||
        !['CLAIMED','IN_FLIGHT'].includes(row.status)) throw new Rejected('EXEC_COMPLETION_REQUIRES_LIVE_CLAIM', 409);
    if (row.budget_id) {
      if (!Number.isSafeInteger(input.actualMicroEur) || input.actualMicroEur < 0 ||
          (row.status === 'CLAIMED' && input.actualMicroEur !== 0)) throw new Rejected('EXEC_USAGE_PROOF_REQUIRED', 409);
      settleBudget(sql, row.budget_id, input.actualMicroEur);
    } else if (input.actualMicroEur !== 0) throw new Rejected('EXEC_UNEXPECTED_COST', 409);
    sql.exec('UPDATE exec_intents SET status=?,result_digest=?,lease_until=0,updated=? WHERE task_id=?', input.outcome, input.evidenceSha256, now, input.taskId);
    sql.exec('DELETE FROM exec_path_locks WHERE task_id=?', input.taskId);
    audit(sql, input.taskId, input.outcome, 'VERIFIED_TERMINAL_RECONCILIATION', now);
    return view(readRow(sql, input.taskId));
  });
}
export function reconcileExecutionIntent(storage, input, now = Date.now()) {
  if (!exact(input, ['taskId','outcome','evidenceSha256','actualMicroEur']) ||
      !HEX.test(input.evidenceSha256 || '') || !['SUCCEEDED','FAILED'].includes(input.outcome)) {
    throw new Rejected('EXEC_INVALID_RECONCILIATION', 422);
  }
  return storage.transactionSync(() => {
    const sql = storage.sql, row = readRow(sql, input.taskId);
    if (row.status !== 'RECONCILE_REQUIRED') throw new Rejected('EXEC_NOT_RECONCILABLE', 409);
    if (row.budget_id) {
      if (!Number.isSafeInteger(input.actualMicroEur) || input.actualMicroEur < 0) throw new Rejected('EXEC_USAGE_PROOF_REQUIRED', 409);
      settleBudget(sql, row.budget_id, input.actualMicroEur);
    } else if (input.actualMicroEur !== 0) throw new Rejected('EXEC_UNEXPECTED_COST', 409);
    sql.exec('UPDATE exec_intents SET status=?,result_digest=?,lease_until=0,updated=? WHERE task_id=?', input.outcome, input.evidenceSha256, now, input.taskId);
    sql.exec('DELETE FROM exec_path_locks WHERE task_id=?', input.taskId);
    audit(sql, input.taskId, input.outcome, 'EXPLICIT_OPERATOR_RECONCILIATION', now);
    return view(readRow(sql, input.taskId));
  });
}
export function inspectExecutionIntent(storage, id) {
  return view(readRow(storage.sql, id));
}
export function executionDiagnostics(storage) {
  return { statuses: [...storage.sql.exec('SELECT status,COUNT(*) AS count FROM exec_intents GROUP BY status')],
    activePathLocks: [...storage.sql.exec('SELECT COUNT(*) AS n FROM exec_path_locks')][0].n,
    executorTransportEnabled: false, automaticRetriesEnabled: false };
}
