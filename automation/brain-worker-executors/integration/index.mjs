/**
 * Brain executor integration contract. Inert unless explicitly wired to trusted ports.
 * No provider imports, network transport, secrets, merge, or deploy permission here.
 */
export const REPOSITORY = 'dizigs/archelaos-site';
export const AUDIENCE = 'brain-worker-executors.integration.v1';
export const MONTHLY_CAP_MICRO_EUR = 20_000_000;
export const REQUIRED_JOBS = Object.freeze({
  'rebuild-check.yml': ['HTML, data and JavaScript integrity'],
  'axe-accessibility.yml': ['axe'],
  'lighthouse-ci.yml': ['Lighthouse CI mobile audit'],
  'eslint-guard.yml': ['ESLint JavaScript quality'],
  'codeql-security.yml': ['CodeQL (javascript-typescript)', 'CodeQL (python)'],
  'javascript-syntax-guard.yml': ['JavaScript syntax (all site scripts)'],
  'release-qa.yml': ['Validate production build'],
  'validate-site.yml': ['verify']
});
export const REQUIRED_CHECKS = Object.freeze(Object.keys(REQUIRED_JOBS));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{40}$/;
const SAFE = /^[a-zA-Z0-9_.\/-]{1,180}$/;
export class IntegrationBlocked extends Error {
  constructor(code) { super(code); this.name = 'IntegrationBlocked'; this.code = code; }
}
function ensure(condition, code) { if (!condition) throw new IntegrationBlocked(code); }
export function safePath(p, directory = false) {
  if (typeof p !== 'string' || !SAFE.test(p) || p.startsWith('/') ||
      p.includes('//') || p.includes('\\') || p.split('/').filter((x, i, arr) => !(directory && i === arr.length - 1)).some(x => x === '.' || x === '..' || x === '') ||
      p.endsWith('/') !== directory) return false;
  return !p.startsWith('.git/') && !p.startsWith('brain/') &&
    !p.startsWith('automation/brain-worker-executors/integration/');
}
export function overlaps(a, b) {
  return a === b || (a.endsWith('/') && b.startsWith(a)) || (b.endsWith('/') && a.startsWith(b));
}
function pathAllowed(path, scope) { return scope.endsWith('/') ? path.startsWith(scope) : path === scope; }
export function normalizeIntent(task) {
  ensure(task && typeof task === 'object' && !Array.isArray(task), 'INVALID_INTENT');
  ensure(UUID.test(task.taskId || '') && UUID.test(task.receiptId || '') && SHA.test(task.commitSha || ''), 'INVALID_INTENT_IDENTITY');
  ensure(['build', 'testing'].includes(task.type), 'UNSUPPORTED_INTENT');
  ensure(task.type !== 'build' || ['A', 'B'].includes(task.lane), 'INVALID_BUILD_LANE');
  ensure(task.type !== 'testing' || task.lane === undefined, 'INVALID_TEST_LANE');
  ensure(Array.isArray(task.paths) && task.paths.length >= 1 && task.paths.length <= 20 &&
    task.paths.every(p => safePath(p) || safePath(p, true)) &&
    new Set(task.paths).size === task.paths.length, 'INVALID_FILE_SCOPE');
  ensure(task.production !== true && task.autoMerge !== true && task.deploy !== true, 'FORBIDDEN_MUTATION');
  return Object.freeze({
    taskId: task.taskId, receiptId: task.receiptId, commitSha: task.commitSha,
    type: task.type, lane: task.type === 'build' ? task.lane : null,
    paths: Object.freeze([...task.paths].sort((a, b) => a.localeCompare(b)))
  });
}
/**
 * Authenticator primitive for the TRUSTED Brain-port implementation. The port
 * must also read back taskId/receiptId from the Brain's durable receipt store;
 * a MAC alone never substitutes for approval or source validation.
 * Secrets are passed through runtime bindings only and are never logged.
 */
export async function verifySignedBrainEnvelope(signed, key, now = Date.now()) {
  ensure(signed && typeof signed.raw === 'string' &&
    signed.raw.length > 0 && signed.raw.length <= 4096 &&
    typeof signed.signature === 'string' && /^[0-9a-f]{64}$/.test(signed.signature) &&
    Number.isSafeInteger(signed.timestampMs) &&
    Math.abs(now - signed.timestampMs) <= 300_000 &&
    typeof key === 'string' && key.length >= 43, 'BRAIN_SIGNATURE_INVALID');
  const encoder = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = Uint8Array.from(signed.signature.match(/../g), p => Number.parseInt(p, 16));
  const payload = encoder.encode(String(signed.timestampMs) + '\n' + signed.raw);
  ensure(await crypto.subtle.verify('HMAC', k, bytes, payload), 'BRAIN_SIGNATURE_INVALID');
  let verified;
  try { verified = JSON.parse(signed.raw); } catch { throw new IntegrationBlocked('BRAIN_RECEIPT_INVALID'); }
  ensure(verified && typeof verified === 'object' && !Array.isArray(verified),
    'BRAIN_RECEIPT_INVALID');
  return verified;
}
export function confirmBrainReceipt(task, verified, now = Date.now()) {
  ensure(verified?.verified === true && verified?.issuer === 'central-brain' &&
    verified?.audience === AUDIENCE && verified?.repository === REPOSITORY &&
    verified?.approved === true && verified?.receiptId === task.receiptId &&
    verified?.taskId === task.taskId && verified?.commitSha === task.commitSha &&
    verified?.type === task.type && (verified?.lane ?? null) === task.lane,
    'BRAIN_AUTHORIZATION_UNVERIFIED');
  ensure(Number.isSafeInteger(verified.expiresAtMs) && verified.expiresAtMs > now &&
    verified.expiresAtMs <= now + 24 * 60 * 60 * 1000, 'BRAIN_AUTHORIZATION_EXPIRED');
  ensure(Array.isArray(verified.allowedPaths) && verified.allowedPaths.length > 0 &&
    verified.allowedPaths.length <= 30 &&
    verified.allowedPaths.every(p => safePath(p) || safePath(p, true)) &&
    task.paths.every(p => verified.allowedPaths.some(scope => pathAllowed(p, scope))),
    'BRAIN_PATH_AUTHORIZATION_MISMATCH');
  ensure(verified.permissions?.draftOnly === true &&
    verified.permissions?.merge === false &&
    verified.permissions?.deploy === false, 'BRAIN_PERMISSION_UNVERIFIED');
  return true;
}
export function evaluateTestingGate(sha, checks) {
  ensure(SHA.test(sha || '') && Array.isArray(checks) && checks.length <= 100, 'INVALID_CHECK_SET');
  const failures = [], successful = [], evidence = [];
  for (const name of REQUIRED_CHECKS) {
    const matches = checks.filter(c => c?.workflow === name);
    if (matches.length !== 1) { failures.push({ workflow: name, reason: 'MISSING_OR_DUPLICATE' }); continue; }
    const c = matches[0];
    if (c.repository !== REPOSITORY || c.headSha !== sha || c.provenanceVerified !== true ||
        !Number.isSafeInteger(c.runId) || c.runId < 1 ||
        !Number.isSafeInteger(c.runAttempt) || c.runAttempt < 1) {
      failures.push({ workflow: name, reason: 'UNVERIFIED_PROVENANCE' }); continue;
    }
    evidence.push(c.runId);
    const jobs = c.jobs;
    const requiredJobs = REQUIRED_JOBS[name];
    if (c.status !== 'completed' || c.conclusion !== 'success' ||
        !Array.isArray(jobs) || jobs.length === 0 ||
        jobs.some(job => typeof job?.name !== 'string' ||
          job.status !== 'completed' || job.conclusion !== 'success') ||
        requiredJobs.some(jobName => jobs.filter(job => job.name === jobName).length !== 1)) {
      failures.push({ workflow: name, reason: 'WORKFLOW_OR_REQUIRED_JOB_NOT_SUCCESS' });
    } else successful.push(name);
  }
  return Object.freeze({
    passed: failures.length === 0, failures, successful,
    runIds: [...new Set(evidence)], commitSha: sha, mergeAllowed: false
  });
}

/**
 * Canonical Brain ONLY: no local dispatcher or second SQLite/budget authority.
 * The actual signed readback adapter is canonical-review.mjs, review-only.
 */
export function runIntegration() {
  return Object.freeze({
    status: 'BLOCKED', code: 'CANONICAL_BRAIN_ONLY', providerCalls: 0,
    mergeAllowed: false, deployAllowed: false
  });
}
