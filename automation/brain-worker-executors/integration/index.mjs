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
const STATES = new Set(['COMPLETE', 'SAFE_ABORT', 'UNKNOWN']);
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
    paths: Object.freeze([...task.paths].sort())
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
  const bytes = Uint8Array.from(signed.signature.match(/../g), p => parseInt(p, 16));
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
 * Persistent coordination must use ONE SQLite-backed Durable Object shared by
 * both build lanes. transactionSync is mandatory. Claims are intentionally not
 * auto-released on timeout/crash: ambiguous work requires manual reconciliation.
 */
export class SqlCoordinator {
  constructor(storage) {
    ensure(typeof storage?.transactionSync === 'function' && typeof storage?.sql?.exec === 'function',
      'DURABLE_ATOMIC_STORE_REQUIRED');
    this.storage = storage;
    storage.sql.exec('CREATE TABLE IF NOT EXISTS integration_claims (task_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, type TEXT NOT NULL, state TEXT NOT NULL, scopes TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL)');
  }
  claim(task, now = Date.now()) {
    return this.storage.transactionSync(() => {
      const sql = this.storage.sql;
      const fingerprint = JSON.stringify(task);
      const prior = [...sql.exec('SELECT fingerprint,state FROM integration_claims WHERE task_id=?', task.taskId)][0];
      if (prior) {
        ensure(prior.fingerprint === fingerprint, 'IDEMPOTENCY_PAYLOAD_CONFLICT');
        return { status: prior.state === 'COMPLETE' ? 'REPLAY_COMPLETE' : 'REPLAY_BLOCKED', state: prior.state };
      }
      const active = [...sql.exec("SELECT type,scopes FROM integration_claims WHERE state IN ('CLAIMED','UNKNOWN') LIMIT 201")];
      ensure(active.length <= 200, 'COORDINATOR_CAPACITY_UNVERIFIED');
      if (task.type === 'build') {
        ensure(active.filter(row => row.type === 'build').length < 2, 'TWO_BUILD_LIMIT_REACHED');
        for (const row of active) {
          const scopes = JSON.parse(row.scopes);
          ensure(!task.paths.some(path => scopes.some(scope => overlaps(path, scope))), 'FILE_SCOPE_BUSY');
        }
      }
      sql.exec('INSERT INTO integration_claims(task_id,fingerprint,type,state,scopes,created,updated) VALUES(?,?,?,?,?,?,?)',
        task.taskId, fingerprint, task.type, 'CLAIMED', JSON.stringify(task.type === 'build' ? task.paths : []), now, now);
      return { status: 'CLAIMED' };
    });
  }
  finish(taskId, state, now = Date.now()) {
    ensure(UUID.test(taskId || '') && STATES.has(state), 'INVALID_CLAIM_TRANSITION');
    return this.storage.transactionSync(() => {
      const sql = this.storage.sql;
      const old = [...sql.exec('SELECT state FROM integration_claims WHERE task_id=?', taskId)][0];
      ensure(old?.state === 'CLAIMED', 'RECONCILIATION_REQUIRED');
      sql.exec('UPDATE integration_claims SET state=?,updated=? WHERE task_id=?', state, now, taskId);
      return { status: state };
    });
  }
}

/** All ports are supplied by trusted server-side bindings, never from task JSON. */
export async function runIntegration(taskInput, ports, policy = {}, now = Date.now()) {
  const blocked = code => ({ status: 'BLOCKED', code, providerCalls: 0, mergeAllowed: false, deployAllowed: false });
  if (policy.enabled !== true || policy.executionMode !== 'staging-approved' ||
      policy.providersAttested !== true || policy.centralLedgerConfirmed !== true) {
    return blocked('INTEGRATION_DISABLED_OR_UNATTESTED');
  }
  let task, claimed = false, externalStarted = false, budgetHeld = false;
  try {
    task = normalizeIntent(taskInput);
    ensure(ports?.brain && ports?.coordinator && ports?.checks, 'TRUSTED_PORTS_MISSING');
    ensure(typeof ports.brain.verifyTaskReceipt === 'function' && typeof ports.brain.readControls === 'function',
      'TRUSTED_BRAIN_PORT_MISSING');
    // The verifier must independently authenticate the Brain and read its durable
    // approved receipt. Caller-provided approved booleans are never accepted.
    const approval = await ports.brain.verifyTaskReceipt(task);
    confirmBrainReceipt(task, approval, now);
    const controls = await ports.brain.readControls();
    ensure(controls?.globalPaused === false && controls?.aiPaused === false, 'BRAIN_PAUSED_OR_UNVERIFIED');
    const claim = ports.coordinator.claim(task, now);
    if (claim.status !== 'CLAIMED') return { ...blocked('IDEMPOTENT_' + claim.status), priorState: claim.state };
    claimed = true;
    if (task.type === 'testing') {
      ensure(typeof ports.checks.readVerified === 'function', 'GITHUB_CHECKS_PORT_MISSING');
      const checks = await ports.checks.readVerified({ repository: REPOSITORY, commitSha: task.commitSha });
      const gate = evaluateTestingGate(task.commitSha, checks);
      if (!gate.passed) {
        // Only canonical GitHub run ID permits the private Self-Heal contract.
        // Missing, skipped or pending checks are NOT a verified CI_FAILURE.
        // Route only an actual completed failed/cancelled GitHub run whose
        // repository, exact head SHA, run attempt and source were verified.
        const failedRun = checks.find(c =>
          REQUIRED_CHECKS.includes(c?.workflow) &&
          c.repository === REPOSITORY && c.headSha === task.commitSha &&
          c.provenanceVerified === true &&
          Number.isSafeInteger(c.runId) && c.runId > 0 &&
          Number.isSafeInteger(c.runAttempt) && c.runAttempt > 0 &&
          c.status === 'completed' &&
          ['failure', 'cancelled', 'timed_out', 'action_required'].includes(c.conclusion));
        const evidenceId = failedRun?.runId;
        let routed = false;
        if (evidenceId && typeof ports.healer?.observe === 'function') {
          const finding = {
            schemaVersion: 1, source: 'github_actions', repository: REPOSITORY,
            code: 'CI_FAILURE', resource: '/ci', commit: task.commitSha,
            observedAt: new Date(now).toISOString(), evidenceId: 'actions:' + evidenceId
          };
          try { await ports.healer.observe(finding); routed = true; } catch { routed = false; }
        }
        ports.coordinator.finish(task.taskId, 'COMPLETE', now);
        return { status: 'TESTING_FAILED_CLOSED', gate, selfHealRouted: routed, mergeAllowed: false, deployAllowed: false };
      }
      ports.coordinator.finish(task.taskId, 'COMPLETE', now);
      return { status: 'TESTING_PASSED_REVIEW_ONLY', gate, mergeAllowed: false, deployAllowed: false };
    }
    const builder = ports.builders?.[task.lane];
    ensure(builder?.verified === true && typeof builder.execute === 'function', 'PROVIDER_ADAPTER_NOT_VERIFIED');
    ensure(typeof ports.brain.ledger?.reserve === 'function' &&
      typeof ports.brain.ledger?.settle === 'function' &&
      typeof ports.brain.ledger?.claim === 'function', 'SHARED_LEDGER_PORT_MISSING');
    const quote = await builder.quote(task);
    ensure(quote?.verified === true && typeof quote.modelId === 'string' && quote.modelId.length > 0 &&
      Number.isSafeInteger(quote.maxMicroEur) && quote.maxMicroEur > 0 &&
      quote.maxMicroEur <= MONTHLY_CAP_MICRO_EUR, 'UNVERIFIED_PRICE_OR_BUDGET');
    const reservation = await ports.brain.ledger.reserve({
      taskId: task.taskId, receiptId: task.receiptId, lane: task.lane, quote
    });
    ensure(reservation?.accepted === true && reservation?.shared === true &&
      Number.isSafeInteger(reservation.amountMicroEur) &&
      reservation.amountMicroEur >= quote.maxMicroEur &&
      reservation.amountMicroEur <= MONTHLY_CAP_MICRO_EUR &&
      typeof reservation.reservationId === 'string', 'CENTRAL_BUDGET_NOT_RESERVED');
    budgetHeld = true;
    const latest = await ports.brain.readControls();
    ensure(latest?.globalPaused === false && latest?.aiPaused === false, 'BRAIN_PAUSED_AFTER_RESERVATION');
    const callClaim = await ports.brain.ledger.claim(reservation.reservationId);
    ensure(callClaim?.authorized === true, 'BUDGET_CALL_ALREADY_CLAIMED');
    // Unknown outcomes are never retried automatically, especially after a claim.
    externalStarted = true;
    const output = await builder.execute({ task, modelId: quote.modelId, reservationId: reservation.reservationId });
    ensure(output?.verified === true && output?.commitSha === task.commitSha &&
      output?.draftOnly === true && output?.mergeAllowed === false &&
      output?.deployAllowed === false &&
      Array.isArray(output.changedFiles) && output.changedFiles.length > 0 &&
      output.changedFiles.length <= 20 &&
      output.changedFiles.every(path => safePath(path) && task.paths.some(scope => pathAllowed(path, scope))) &&
      typeof output.draftRef === 'string' && /^#[1-9][0-9]{0,6}$/.test(output.draftRef) &&
      Number.isSafeInteger(output.actualMicroEur) && output.actualMicroEur >= 0 &&
      output.actualMicroEur <= reservation.amountMicroEur, 'EXECUTOR_OUTPUT_UNVERIFIED');
    const settlement = await ports.brain.ledger.settle(reservation.reservationId, output.actualMicroEur);
    ensure(settlement?.confirmed === true, 'BUDGET_SETTLEMENT_UNVERIFIED');
    ports.coordinator.finish(task.taskId, 'COMPLETE', now);
    return { status: 'BUILD_DRAFT_REQUIRES_TESTING', lane: task.lane, draftRef: output.draftRef || null,
      providerCalls: 1, mergeAllowed: false, deployAllowed: false };
  } catch (error) {
    const code = error instanceof IntegrationBlocked ? error.code : 'PORT_FAILURE_OR_OUTCOME_UNKNOWN';
    if (claimed) {
      try { ports.coordinator.finish(task.taskId, externalStarted || budgetHeld ? 'UNKNOWN' : 'SAFE_ABORT', now); }
      catch { return blocked('COORDINATOR_RECONCILIATION_REQUIRED'); }
    }
    return blocked(code);
  }
}
