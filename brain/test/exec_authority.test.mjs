import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { Miniflare } from 'miniflare';

const OPERATOR = 'synthetic-exec-operator-1111111111111111111111111111111111111';
const INTAKE = 'synthetic-exec-intake-000000000000000000000000000000000000';
const DEPLOY_SHA = 'a'.repeat(40);
const H = 'f'.repeat(64);
let mf, directory, calls;
let syntheticMode = true;
let cap = 20_000_000;
const now = () => Date.now();
function config() {
  const price = model => ({
    verified: true, boundedBillingVerified: true, currency: 'EUR', model,
    evidenceSha256: H, sourceUrl: 'https://example.org/synthetic-prices',
    effectiveAt: new Date(now() - 3600_000).toISOString(),
    expiresAt: new Date(now() + 3600_000).toISOString(),
    inputMicroCurrencyPerMillion: 1_000_000,
    outputMicroCurrencyPerMillion: 1_000_000,
    fixedMicroCurrency: 0, fxNumerator: 1, fxDenominator: 1
  });
  return { coverageConfirmed: true, capMicroEur: cap,
    prices: { gemini: price('synthetic-gemini'), gemma: price('synthetic-gemma') },
    bounds: { gemini: { maxInputTokens: 1000, maxOutputTokens: 1000 },
      gemma: { maxInputTokens: 1000, maxOutputTokens: 1000 } } };
}
function options() {
  return { name: 'brain-exec-authority-test', modules: true,
    scriptPath: resolve('src/worker.mjs'), compatibilityDate: '2026-07-30',
    outboundService: async () => { calls += 1; return new Response('outbound blocked', {status: 503}); },
    durableObjects: { BRAIN: { className: 'BrainCoordinator', useSQLite: true } },
    durableObjectsPersist: directory,
    bindings: { ENVIRONMENT: 'staging', DEPLOY_SHA,
      STAGING_EXPIRES_AT: new Date(Date.now() + 3600_000).toISOString(),
      STAGING_INTAKE_KEY: INTAKE, STAGING_OPERATOR_KEY: OPERATOR,
      BRAIN_EXECUTION_ADMISSION: syntheticMode ? 'synthetic' : 'disabled',
      BRAIN_EXECUTION_CONFIG: JSON.stringify(config()), TEST_BUDGET: syntheticMode ? 'true' : 'false',
      STAGING_SHORT_RETRIES: 'true' } };
}
beforeEach(async () => {
  calls = 0; cap = 20_000_000; syntheticMode = true;
  directory = await mkdtemp(join(tmpdir(), 'archelaos-brain-exec-'));
  mf = new Miniflare(options());
});
afterEach(async () => {
  await mf.dispose(); await rm(directory, {recursive: true, force: true});
  assert.equal(calls, 0, 'No external transport or paid provider calls in the Brain execution authority');
});
function task(type = 'BUILD_A', paths = ['brain/src/alpha.mjs'], changes = {}) {
  return { schemaVersion: 1, taskId: randomUUID(), roadmapIssue: 108,
    type, baseCommit: 'b'.repeat(40), allowedPaths: paths,
    issuedAt: new Date(now()).toISOString(),
    expiresAt: new Date(now() + 600_000).toISOString(), ...changes };
}
async function call(path, body, role = 'operator') {
  const method = body === undefined ? 'GET' : 'POST', raw = body === undefined ? '' : JSON.stringify(body);
  const stamp = String(Math.floor(Date.now() / 1000));
  const secret = role === 'operator' ? OPERATOR : INTAKE;
  const signature = createHmac('sha256', secret).update(method + '\n' + path + '\n' + stamp + '\n' + raw).digest('hex');
  const response = await mf.dispatchFetch('https://brain.test' + path, {
    method, headers: { 'x-archelaos-key-id': role === 'operator' ? 'operator-v1' : 'staging-v1',
      'x-archelaos-timestamp': stamp, 'x-archelaos-signature': signature,
      'content-type': 'application/json' },
    ...(body === undefined ? {} : {body: raw}) });
  return { status: response.status, data: await response.json() };
}
async function submitAndApprove(value) {
  const submitted = await call('/v1/exec/intents', value);
  assert.equal(submitted.status, 202);
  assert.equal(submitted.data.status, 'PENDING_REVIEW');
  const approved = await call('/v1/exec/approvals', {
    taskId: value.taskId, scopeDigest: submitted.data.scopeDigest, evidenceSha256: H });
  assert.equal(approved.status, 200);
  return approved.data;
}
test('operator-only exact task contract, durable receipt and immutable replay', async () => {
  const value = task();
  const first = await call('/v1/exec/intents', value);
  assert.equal(first.status, 202); assert.equal(first.data.executor, 'gemini');
  assert.equal(first.data.productionAllowed, false);
  const replay = await call('/v1/exec/intents', {...value, allowedPaths: [...value.allowedPaths].reverse()});
  assert.equal(replay.data.duplicate, true);
  assert.equal((await call('/v1/exec/intents', {...value, baseCommit: 'c'.repeat(40)})).status, 409);
  assert.equal((await call('/v1/exec/intents', task(), 'staging')).status, 403);
  assert.equal((await call('/v1/exec/intents/' + value.taskId, undefined, 'staging')).status, 403);
  await mf.dispose(); mf = new Miniflare(options());
  assert.equal((await call('/v1/exec/intents/' + value.taskId)).data.scopeDigest, first.data.scopeDigest);
});
test('reject malformed identities, path traversal, extra privileged fields and invalid approvals', async () => {
  for (const changes of [
    {command: 'rm -rf /'}, {approved: true}, {type: 'RUN_SHELL'},
    {allowedPaths: ['../private']}, {allowedPaths: ['brain/../../secrets']},
    {allowedPaths: ['https://example.org/file']}, {allowedPaths: ['brain/src/x', 'brain/src/x']},
    {allowedPaths: ['.github/workflows/deploy.yml']},
    {issuedAt: new Date(now() - 3600_000).toISOString()},
    {expiresAt: new Date(now() + 3 * 86400_000).toISOString()}
  ]) assert.equal((await call('/v1/exec/intents', task('BUILD_A', ['brain/src/x'], changes))).status, 422);
  const value = task();
  const created = await call('/v1/exec/intents', value);
  assert.equal((await call('/v1/exec/approvals', {taskId: value.taskId, scopeDigest: H, evidenceSha256: H})).status, 409);
  assert.equal((await call('/v1/exec/approvals', {taskId: value.taskId, scopeDigest: created.data.scopeDigest, evidenceSha256: H, bypass: true})).status, 422);
});
test('not a live executor: claims remain off by default even with approved work', async () => {
  syntheticMode = false; await mf.dispose(); mf = new Miniflare(options());
  const value = task(); await submitAndApprove(value);
  assert.equal((await call('/v1/exec/claims', {taskId: value.taskId})).status, 423);
  assert.equal((await call('/v1/exec/diagnostics')).data.executorTransportEnabled, false);
});
test('one shared microEUR ledger and exactly two concurrent builds', async () => {
  const a = task('BUILD_A', ['brain/src/build-a.mjs']);
  const b = task('BUILD_B', ['brain/src/build-b.mjs']);
  const c = task('BUILD_A', ['brain/src/build-c.mjs']);
  await submitAndApprove(a); await submitAndApprove(b); await submitAndApprove(c);
  const first = await call('/v1/exec/claims', {taskId:a.taskId});
  const second = await call('/v1/exec/claims', {taskId:b.taskId});
  assert.equal(first.status, 200); assert.equal(second.status, 200);
  assert.equal(first.data.status, 'CLAIMED'); assert.equal(second.data.status, 'CLAIMED');
  assert.ok(first.data.budgetReservationId && second.data.budgetReservationId);
  assert.equal((await call('/v1/exec/claims', {taskId:c.taskId})).data.code, 'EXEC_BUILD_CONCURRENCY_LIMIT');
  assert.equal((await call('/v1/exec/claims', {taskId:a.taskId})).status, 409);
  const begun = await call('/v1/exec/begin', {taskId:a.taskId, owner:first.data.owner});
  assert.equal(begun.data.status, 'IN_FLIGHT');
  assert.equal((await call('/v1/exec/begin', {taskId:a.taskId, owner:first.data.owner})).status, 409);
  const completed = await call('/v1/exec/complete', {
    taskId:a.taskId, owner:first.data.owner, outcome:'SUCCEEDED', evidenceSha256: H, actualMicroEur: 750 });
  assert.equal(completed.data.status, 'SUCCEEDED');
  assert.equal((await call('/v1/exec/claims', {taskId:c.taskId})).status, 200);
});
test('file subtree locks, evidence requirement, no unbounded retries and budget cap', async () => {
  const a = task('TESTING', ['brain/src']);
  const b = task('SELF_HEAL', ['brain/src/worker.mjs']);
  await submitAndApprove(a); await submitAndApprove(b);
  const first = await call('/v1/exec/claims', {taskId:a.taskId});
  assert.equal(first.status, 200);
  assert.equal((await call('/v1/exec/claims', {taskId:b.taskId})).data.code, 'EXEC_PATH_LOCKED');
  assert.equal((await call('/v1/exec/complete', {
    taskId:a.taskId, owner:first.data.owner, outcome:'SUCCEEDED', evidenceSha256:H,
    actualMicroEur: 1 })).status, 409);
  assert.equal((await call('/v1/exec/complete', {
    taskId:a.taskId, owner:first.data.owner, outcome:'SUCCEEDED', evidenceSha256:H,
    actualMicroEur: 0 })).status, 200);
  assert.equal((await call('/v1/exec/claims', {taskId:b.taskId})).status, 200);
  const c = task('BUILD_B', ['brain/src/new.mjs']);
  await submitAndApprove(c);
  cap = 100; await mf.dispose(); mf = new Miniflare(options());
  assert.equal((await call('/v1/exec/claims', {taskId:c.taskId})).data.code, 'BUDGET_INSUFFICIENT');
});
