import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIENCE, REQUIRED_CHECKS, REQUIRED_JOBS, REPOSITORY, IntegrationBlocked, SqlCoordinator,
  confirmBrainReceipt, evaluateTestingGate, normalizeIntent, runIntegration, safePath,
  verifySignedBrainEnvelope
} from './index.mjs';

const sha = 'a'.repeat(40);
const id = n => '11111111-1111-4111-8111-' + String(n).padStart(12, '0');
const gemini = 'automation/brain-worker-executors/providers/gemini/task.mjs';
const gemma = 'automation/brain-worker-executors/providers/gemma/task.mjs';
const makeTask = (n, lane = 'A', paths = [gemini], type = 'build') =>
  ({ taskId: id(n), receiptId: id(900 + n), commitSha: sha, type,
    ...(type === 'build' ? { lane } : {}), paths });
const receipt = task => ({
  verified: true, issuer: 'central-brain', audience: AUDIENCE, repository: REPOSITORY,
  approved: true, taskId: task.taskId, receiptId: task.receiptId, commitSha: task.commitSha,
  type: task.type, lane: task.type === 'build' ? task.lane : null,
  expiresAtMs: Date.now() + 60_000, allowedPaths: task.paths,
  permissions: { draftOnly: true, merge: false, deploy: false }
});
class FakeSql {
  constructor() { this.rows = new Map(); }
  exec(query, ...args) {
    if (query.startsWith('CREATE TABLE')) return [];
    if (query.startsWith('SELECT fingerprint,state')) {
      const row = this.rows.get(args[0]); return row ? [row] : [];
    }
    if (query.startsWith('SELECT type,scopes')) return [...this.rows.values()]
      .filter(x => ['CLAIMED', 'UNKNOWN'].includes(x.state)).slice(0, 201);
    if (query.startsWith('INSERT INTO integration_claims')) {
      const [task_id, fingerprint, type, state, scopes, created, updated] = args;
      this.rows.set(task_id, { task_id, fingerprint, type, state, scopes, created, updated });
      return [];
    }
    if (query.startsWith('SELECT state FROM')) {
      const row = this.rows.get(args[0]); return row ? [row] : [];
    }
    if (query.startsWith('UPDATE integration_claims')) {
      const [state, updated, task_id] = args;
      Object.assign(this.rows.get(task_id), { state, updated }); return [];
    }
    throw new Error('Unexpected SQL: ' + query);
  }
}
class FakeStorage {
  constructor() { this.sql = new FakeSql(); }
  transactionSync(fn) { return fn(); }
}
const checks = (commitSha = sha) => REQUIRED_CHECKS.map((workflow, index) => ({
  workflow, repository: REPOSITORY, headSha: commitSha, provenanceVerified: true,
  runId: 9000 + index, runAttempt: 1, status: 'completed', conclusion: 'success',
  jobs: REQUIRED_JOBS[workflow].map(name => ({ name, status: 'completed', conclusion: 'success' }))
}));
function portsFor(task, coordinator, overrides = {}) {
  const state = { calls: 0, reserves: 0, settlements: 0, routed: [] };
  const ports = {
    brain: {
      verifyTaskReceipt: async () => receipt(task),
      readControls: async () => ({ globalPaused: false, aiPaused: false }),
      ledger: {
        reserve: async () => { state.reserves++; return { accepted: true, shared: true,
          reservationId: 'reservation-1', amountMicroEur: 1000 }; },
        claim: async () => ({ authorized: true }),
        settle: async () => { state.settlements++; return { confirmed: true }; }
      }
    },
    coordinator, checks: { readVerified: async () => checks() },
    builders: {
      A: { verified: true, quote: async () => ({ verified: true, modelId: 'mock-model', maxMicroEur: 1000 }),
        execute: async () => { state.calls++; return { verified: true, commitSha: sha, draftOnly: true,
          mergeAllowed: false, deployAllowed: false, changedFiles: task.paths.filter(x => !x.endsWith('/')),
          draftRef: '#300', actualMicroEur: 250 }; } }
    },
    healer: { observe: async finding => { state.routed.push(finding); } }
  };
  Object.assign(ports, overrides);
  return { ports, state };
}
const policy = { enabled: true, executionMode: 'staging-approved',
  providersAttested: true, centralLedgerConfirmed: true };

test('scope normalization blocks traversal, brain files and integration ownership', () => {
  assert.equal(safePath('automation/providers/'), false);
  assert.equal(safePath('automation/providers/', true), true);
  assert.equal(safePath('automation/../brain/x.mjs'), false);
  assert.equal(safePath('brain/src/worker.mjs'), false);
  assert.equal(safePath('automation/brain-worker-executors/integration/x.mjs'), false);
  assert.equal(normalizeIntent(makeTask(1)).type, 'build');
  assert.throws(() => normalizeIntent(makeTask(2, 'A', ['../unsafe.js'])), IntegrationBlocked);
});

test('caller approved flag cannot bypass authoritative Brain receipt', async () => {
  const task = makeTask(1);
  assert.throws(() => confirmBrainReceipt(normalizeIntent(task), { ...receipt(task),
    allowedPaths: [gemma] }), /BRAIN_PATH_AUTHORIZATION_MISMATCH/);
  const { ports, state } = portsFor(task, new SqlCoordinator(new FakeStorage()));
  ports.brain.verifyTaskReceipt = async () => ({ ...receipt(task), approved: false });
  const result = await runIntegration({ ...task, approved: true }, ports, policy);
  assert.equal(result.code, 'BRAIN_AUTHORIZATION_UNVERIFIED');
  assert.equal(state.calls, 0);
});

test('defaults OFF and no paid call without explicit attestation', async () => {
  const task = makeTask(1);
  const { ports, state } = portsFor(task, new SqlCoordinator(new FakeStorage()));
  assert.equal((await runIntegration(task, ports)).code, 'INTEGRATION_DISABLED_OR_UNATTESTED');
  assert.equal(state.reserves, 0);
});

test('atomic two-build maximum, exact file lock, replay and immutable fingerprint', () => {
  const c = new SqlCoordinator(new FakeStorage());
  const a = normalizeIntent(makeTask(1));
  const b = normalizeIntent(makeTask(2, 'B', [gemma]));
  assert.equal(c.claim(a).status, 'CLAIMED');
  assert.equal(c.claim(a).status, 'REPLAY_BLOCKED');
  assert.throws(() => c.claim({ ...a, paths: [gemma] }), /IDEMPOTENCY_PAYLOAD_CONFLICT/);
  assert.throws(() => c.claim(normalizeIntent(makeTask(3, 'B', [gemini]))), /FILE_SCOPE_BUSY/);
  assert.equal(c.claim(b).status, 'CLAIMED');
  assert.throws(() => c.claim(normalizeIntent(makeTask(4, 'B', ['automation/other.mjs']))), /TWO_BUILD_LIMIT_REACHED/);
  c.finish(a.taskId, 'UNKNOWN');
  assert.throws(() => c.claim(normalizeIntent(makeTask(4, 'B', ['automation/other.mjs']))), /TWO_BUILD_LIMIT_REACHED/);
  c.finish(b.taskId, 'COMPLETE');
  assert.equal(c.claim(normalizeIntent(makeTask(4, 'B', ['automation/other.mjs']))).status, 'CLAIMED');
  assert.equal(c.claim(b).status, 'REPLAY_COMPLETE');
});

test('testing gate fails closed on missing/skipped, wrong SHA and duplicate report', () => {
  assert.equal(evaluateTestingGate(sha, checks()).passed, true);
  assert.equal(evaluateTestingGate(sha, checks().slice(1)).passed, false);
  assert.equal(evaluateTestingGate(sha, checks().map((x, i) => i === 1 ? { ...x, conclusion: 'skipped' } : x)).passed, false);
  assert.equal(evaluateTestingGate(sha, checks('b'.repeat(40))).passed, false);
  assert.equal(evaluateTestingGate(sha, [...checks(), checks()[0]]).passed, false);
  assert.equal(evaluateTestingGate(sha, checks().map((x, i) => i === 1 ? {
    ...x, jobs: [{ name: 'axe', status: 'completed', conclusion: 'skipped' }]
  } : x)).passed, false);
});

test('testing failure routes metadata-only CI finding, never auto-repairs', async () => {
  const task = makeTask(6, undefined, ['automation/test.mjs'], 'testing');
  const { ports, state } = portsFor(task, new SqlCoordinator(new FakeStorage()));
  ports.checks.readVerified = async () => checks().map((c, i) =>
    i ? c : { ...c, conclusion: 'failure' });
  const result = await runIntegration(task, ports, policy);
  assert.equal(result.status, 'TESTING_FAILED_CLOSED');
  assert.equal(result.selfHealRouted, true);
  assert.deepEqual(Object.keys(state.routed[0]).sort(), [
    'code','commit','evidenceId','observedAt','repository','resource','schemaVersion','source'].sort());
  assert.equal(state.routed[0].code, 'CI_FAILURE');
  assert.equal(result.mergeAllowed, false);
});

test('testing missing evidence never invents a Self-Heal run ID', async () => {
  const task = makeTask(7, undefined, ['automation/test.mjs'], 'testing');
  const { ports, state } = portsFor(task, new SqlCoordinator(new FakeStorage()));
  ports.checks.readVerified = async () => [];
  const result = await runIntegration(task, ports, policy);
  assert.equal(result.selfHealRouted, false);
  assert.equal(state.routed.length, 0);
});

test('verified mock build reserves shared ledger, settles and yields draft-only', async () => {
  const task = makeTask(8);
  const { ports, state } = portsFor(task, new SqlCoordinator(new FakeStorage()));
  const result = await runIntegration(task, ports, policy);
  assert.equal(result.status, 'BUILD_DRAFT_REQUIRES_TESTING');
  assert.equal(result.mergeAllowed, false);
  assert.equal(state.calls, 1);
  assert.equal(state.reserves, 1);
  assert.equal(state.settlements, 1);
  assert.equal((await runIntegration(task, ports, policy)).code, 'IDEMPOTENT_REPLAY_COMPLETE');
  assert.equal(state.calls, 1);
});

test('provider failure after call holds UNKNOWN and suppresses replay', async () => {
  const task = makeTask(9);
  const coordinator = new SqlCoordinator(new FakeStorage());
  const { ports, state } = portsFor(task, coordinator);
  ports.builders.A.execute = async () => { state.calls++; throw Error('synthetic outage'); };
  assert.equal((await runIntegration(task, ports, policy)).code, 'PORT_FAILURE_OR_OUTCOME_UNKNOWN');
  assert.equal(coordinator.claim(normalizeIntent(task)).state, 'UNKNOWN');
  assert.equal((await runIntegration(task, ports, policy)).code, 'IDEMPOTENT_REPLAY_BLOCKED');
  assert.equal(state.calls, 1);
});

test('signed Brain envelope detects tampering and freshness', async () => {
  const key = 'synthetic-only-key-material-with-a-length-over-43-characters';
  const timestampMs = Date.now(), raw = JSON.stringify(receipt(makeTask(10)));
  const encoder = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = [...new Uint8Array(await crypto.subtle.sign('HMAC', k,
    encoder.encode(String(timestampMs) + '\n' + raw)))]
    .map(b => b.toString(16).padStart(2, '0')).join('');
  const signed = { timestampMs, raw, signature };
  assert.equal((await verifySignedBrainEnvelope(signed, key)).issuer, 'central-brain');
  await assert.rejects(() => verifySignedBrainEnvelope({ ...signed, raw: raw + 'x' }, key),
    /BRAIN_SIGNATURE_INVALID/);
  await assert.rejects(() => verifySignedBrainEnvelope(signed, key, timestampMs + 600_000),
    /BRAIN_SIGNATURE_INVALID/);
});


test('skipped or pending check with a real run ID does not fabricate a CI_FAILURE', async () => {
  for (const conclusion of ['skipped', null]) {
    const task = makeTask(conclusion === 'skipped' ? 11 : 12, undefined, ['automation/test.mjs'], 'testing');
    const { ports, state } = portsFor(task, new SqlCoordinator(new FakeStorage()));
    ports.checks.readVerified = async () => checks().map((c, i) =>
      i ? c : { ...c, conclusion, status: conclusion ? 'completed' : 'in_progress' });
    const result = await runIntegration(task, ports, policy);
    assert.equal(result.status, 'TESTING_FAILED_CLOSED');
    assert.equal(result.selfHealRouted, false);
    assert.equal(state.routed.length, 0);
    assert.equal(result.mergeAllowed, false);
  }
});
