import { Rejected, UUID } from './contract.mjs';

const SHA = /^[0-9a-f]{40}$/;
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
const FIELD_NAMES = ['schemaVersion', 'taskId', 'roadmapIssue', 'baseCommit', 'taskType', 'allowedPaths', 'issuedAt', 'expiresAt'];
const TASK_TYPES = new Set(['STAGING_PROOF', 'SOURCE_ADAPTER_REVIEW', 'SECURITY_REVIEW']);
const DAY = 24 * 60 * 60 * 1000;

function scopedPath(path) {
  if (typeof path !== 'string' || path.length > 160 || !/^[a-zA-Z0-9_./-]+$/.test(path) ||
      path.includes('//') || path.split('/').some(part => part === '.' || part === '..')) return false;
  return path.startsWith('brain/') || path === '.github/workflows/brain-core.yml';
}

export function validateTaskIntent(input, now = Date.now()) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).length !== FIELD_NAMES.length ||
      FIELD_NAMES.some(key => !Object.hasOwn(input, key))) throw new Rejected('INVALID_TASK_INTENT', 422);
  if (input.schemaVersion !== 1 || !UUID.test(input.taskId) ||
      ![71, 108].includes(input.roadmapIssue) || !SHA.test(input.baseCommit) ||
      !TASK_TYPES.has(input.taskType)) throw new Rejected('INVALID_TASK_IDENTITY', 422);
  if (!Array.isArray(input.allowedPaths) || input.allowedPaths.length < 1 ||
      input.allowedPaths.length > 12 || input.allowedPaths.some(path => !scopedPath(path)) ||
      new Set(input.allowedPaths).size !== input.allowedPaths.length) throw new Rejected('INVALID_TASK_SCOPE', 422);
  if (typeof input.issuedAt !== 'string' || typeof input.expiresAt !== 'string' ||
      !ISO.test(input.issuedAt) || !ISO.test(input.expiresAt)) throw new Rejected('INVALID_TASK_TIME', 422);
  const issued = Date.parse(input.issuedAt), expires = Date.parse(input.expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) ||
      issued < now - 15 * 60 * 1000 || issued > now + 5 * 60 * 1000 ||
      expires <= now || expires > issued + DAY) throw new Rejected('TASK_INTENT_EXPIRED_OR_UNBOUNDED', 422);
  return {
    schemaVersion: 1, taskId: input.taskId, roadmapIssue: input.roadmapIssue,
    baseCommit: input.baseCommit, taskType: input.taskType,
    allowedPaths: [...input.allowedPaths].sort((a, b) => a.localeCompare(b)), issuedAt: input.issuedAt,
    expiresAt: input.expiresAt
  };
}

export function storeTaskIntent(sql, input, now = Date.now()) {
  const canonical = validateTaskIntent(input, now);
  const serialized = JSON.stringify(canonical);
  const previous = [...sql.exec('SELECT payload FROM task_intents WHERE id=?', canonical.taskId)][0];
  if (previous && previous.payload !== serialized) throw new Rejected('TASK_INTENT_CONFLICT', 409);
  if (!previous) {
    const total = [...sql.exec('SELECT COUNT(*) AS count FROM task_intents')][0].count;
    if (total >= 250) throw new Rejected('TASK_LEDGER_CAPACITY_REACHED', 429);
    sql.exec('INSERT INTO task_intents(id,payload,created,expires) VALUES(?,?,?,?)',
      canonical.taskId, serialized, now, Date.parse(canonical.expiresAt));
    sql.exec('INSERT INTO task_intent_audit(id,at,code) VALUES(?,?,?)',
      canonical.taskId, now, 'INTENT_RECORDED_NO_EXECUTION');
  }
  return {
    taskId: canonical.taskId, roadmapIssue: canonical.roadmapIssue,
    baseCommit: canonical.baseCommit, allowedPaths: canonical.allowedPaths,
    status: 'PENDING_MANUAL_REVIEW', duplicate: Boolean(previous),
    executorEnabled: false, paidAiCalls: 0, githubWrites: 0
  };
}

export function readTaskIntent(sql, id, now = Date.now()) {
  if (!UUID.test(id)) throw new Rejected('INVALID_TASK_ID', 422);
  const previous = [...sql.exec('SELECT payload,expires FROM task_intents WHERE id=?', id)][0];
  if (!previous) throw new Rejected('TASK_INTENT_NOT_FOUND', 404);
  const value = JSON.parse(previous.payload);
  return {
    taskId: value.taskId, roadmapIssue: value.roadmapIssue, baseCommit: value.baseCommit,
    taskType: value.taskType, allowedPaths: value.allowedPaths,
    status: previous.expires <= now ? 'EXPIRED' : 'PENDING_MANUAL_REVIEW',
    executorEnabled: false, paidAiCalls: 0, githubWrites: 0
  };
}
