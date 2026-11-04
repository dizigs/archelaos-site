import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { actor, fixture, files, projectId } from './fixtures.mjs';
import { verifyGithubWriterToken, writerAudience, githubWriter, smokeFile } from '../../automation/apps-script/github-writer.mjs';
import { verifyGithubProbeToken, oidcAudience } from '../../automation/apps-script/github-oidc.mjs';
import { sha256 } from '../../automation/apps-script/security.mjs';
import { MuseumScriptCoordinator } from '../../automation/apps-script/cloudflare-mount.mjs';

const sourceCommit = 'c'.repeat(40);
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const key = { ...pair.publicKey.export({ format: 'jwk' }), kid: 'writer-test-key', use: 'sig', alg: 'RS256' };
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function token(clock, fields = {}) {
  const seconds = Math.floor(clock / 1000);
  const claims = { iss: 'https://token.actions.githubusercontent.com', aud: writerAudience,
    repository: 'dizigs/archelaos-site', repository_id: '1433399999',
    ref: 'refs/heads/main', event_name: 'workflow_dispatch', runner_environment: 'github-hosted',
    workflow_ref: 'dizigs/archelaos-site/.github/workflows/apps-script-writer.yml@refs/heads/main',
    workflow_sha: sourceCommit, sha: sourceCommit, sub: 'repo:dizigs/archelaos-site:ref:refs/heads/main',
    run_id: '100', run_attempt: '1', jti: 'synthetic-unique-token', iat: seconds - 5, nbf: seconds - 5, exp: seconds + 120, ...fields };
  const raw = b64({ alg: 'RS256', kid: key.kid }) + '.' + b64(claims);
  return raw + '.' + sign('RSA-SHA256', Buffer.from(raw), pair.privateKey).toString('base64url');
}
const command = (f, hash) => ({ version: 1, operationId: crypto.randomUUID(), action: 'create-smoke',
  sourceCommit, expectedBaseHash: hash, expiresAt: f.state.clock + 120000 });
function request(f, value, fields = {}) {
  return new Request('https://synthetic.invalid/api/apps-script/github-oidc-write', {
    method: 'POST', headers: { authorization: 'Bearer ' + token(f.state.clock, fields), 'content-type': 'application/json' }, body: JSON.stringify(value) });
}
const verification = f => ({ approvedWorkflowCommit: sourceCommit, now: () => f.state.clock,
  fetchKeys: async url => { assert.equal(url, 'https://token.actions.githubusercontent.com/.well-known/jwks'); return Response.json({ keys: [key] }); } });
function route(f, approvals) {
  return githubWriter({ store: f.store, now: () => f.state.clock,
    verifyIdentity: value => verifyGithubWriterToken(value, verification(f)),
    authorizeCommand: async value => approvals.has(value.digest),
    resolveAdmin: async () => actor, editorFor: async () => f.editor() });
}
const approve = async (set, value) => set.add(await sha256(JSON.stringify(value)));

test('writer requires independently pinned workflow; rejects readonly audience and unreviewed claims', async t => {
  const f = fixture(t);
  assert.throws(() => verifyGithubWriterToken(token(f.state.clock)), e => e.code === 'REVIEWED_WRITER_WORKFLOW_REQUIRED');
  for (const fields of [{ aud: oidcAudience }, { workflow_sha: 'd'.repeat(40) }, { sha: 'd'.repeat(40) },
    { ref: 'refs/heads/codex/automation-bridge-integration' }, { event_name: 'push' },
    { sub: 'repo:other/repository:ref:refs/heads/main' }, { repository_id: '0' }, { runner_environment: 'self-hosted' }]) {
    await assert.rejects(verifyGithubWriterToken(token(f.state.clock, fields), verification(f)), e => e.code === 'GITHUB_OIDC_AUTH_REQUIRED');
  }
  await assert.rejects(verifyGithubProbeToken(token(f.state.clock), verification(f)), e => e.code === 'GITHUB_OIDC_AUTH_REQUIRED');
  assert.equal(f.state.updates, 0);
});

test('signed command requires exact independent digest approval before Admin access or edits', async t => {
  const f = fixture(t), approvals = new Set();
  const c = command(f, 'a'.repeat(64));
  const response = await route(f, approvals)(request(f, c));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'IMMUTABLE_COMMAND_APPROVAL_REQUIRED');
  assert.equal(f.state.reads, 0); assert.equal(f.state.updates, 0);
});

test('SQLite signed create/readback/restart/rollback preserves originals and consumes one operation', async t => {
  const f = fixture(t), approvals = new Set();
  const original = await f.editor().read(actor);
  const c = command(f, original.headHash); await approve(approvals, c);
  let response = await route(f, approvals)(request(f, c));
  assert.equal(response.status, 200);
  const edited = await response.json();
  assert.equal(edited.status, 'VERIFIED'); assert.equal(f.state.updates, 1);
  assert.equal(edited.files, undefined); assert.equal(edited.backupId, undefined);
  assert.deepEqual(f.state.files.slice(0, files().length), files());
  assert.equal(f.state.files.at(-1).source, smokeFile.source);
  f.restart();
  response = await route(f, approvals)(request(f, c, { run_id: '101' }));
  assert.equal(response.status, 200); assert.equal(f.state.updates, 1);
  const rollback = { ...command(f, edited.headHash), action: 'rollback-smoke', restoreOperationId: c.operationId };
  await approve(approvals, rollback);
  response = await route(f, approvals)(request(f, rollback, { run_id: '102' }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).headHash, original.headHash);
  assert.deepEqual(f.state.files, files()); assert.equal(f.state.updates, 2);
  assert.equal(f.store.signedCommand(c.operationId).status, 'VERIFIED');
  assert.equal([...f.storage.sql.exec('SELECT COUNT(*) AS n FROM script_private_blobs')][0].n, 2);
});

test('concurrent identical deliveries cause one full-file PUT and no duplicate backup', async t => {
  const f = fixture(t), approvals = new Set();
  const c = command(f, (await f.editor().read(actor)).headHash); await approve(approvals, c);
  const handler = route(f, approvals);
  const responses = await Promise.all([handler(request(f, c)), handler(request(f, c))]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  assert.equal(f.state.updates, 1);
  assert.equal([...f.storage.sql.exec('SELECT COUNT(*) AS n FROM script_private_blobs')][0].n, 1);
});

test('one signed run cannot authorize a different command even when both digests are approved', async t => {
  const f = fixture(t), approvals = new Set();
  const c = command(f, (await f.editor().read(actor)).headHash); await approve(approvals, c);
  assert.equal((await route(f, approvals)(request(f, c))).status, 200);
  const other = command(f, c.expectedBaseHash); await approve(approvals, other);
  const response = await route(f, approvals)(request(f, other));
  assert.equal((await response.json()).code, 'SIGNED_COMMAND_REPLAY_CONFLICT');
  assert.equal(f.state.updates, 1);
});

test('caller flags, arbitrary source, expired commands and mismatched source commits never reach Google', async t => {
  const f = fixture(t), approvals = new Set();
  const c = command(f, 'a'.repeat(64));
  for (const fields of [{ verified: true }, { changes: [{ source: 'evil' }] }, { expiresAt: f.state.clock - 1 },
    { expiresAt: f.state.clock + 300001 }, { sourceCommit: 'd'.repeat(40) }]) {
    const response = await route(f, approvals)(request(f, { ...c, ...fields }));
    assert.equal((await response.json()).code, 'BOUNDED_WRITER_COMMAND_REQUIRED');
  }
  const response = await route(f, approvals)(request(f, { ...c, padding: 'x'.repeat(3000) }));
  assert.equal(response.status, 502); assert.equal(f.state.reads, 0); assert.equal(f.state.updates, 0);
});

test('partial trigger inventory or a lease that excludes no external writers never permits PUT', async t => {
  const f = fixture(t), approvals = new Set();
  const c = command(f, (await f.editor().read(actor)).headHash); await approve(approvals, c);
  f.ports.readTriggerInventory = async () => ({ verified: true, completeProjectInventory: false, projectId, fingerprint: f.state.trigger });
  let response = await route(f, approvals)(request(f, c));
  assert.equal((await response.json()).code, 'TRIGGER_VERIFICATION_UNAVAILABLE');
  f.ports.assertExclusiveWriter = async () => ({ verified: true, projectId, expiresAt: f.state.clock + 60000 });
  const other = command(f, c.expectedBaseHash); await approve(approvals, other);
  response = await route(f, approvals)(request(f, other, { run_id: '101' }));
  assert.equal((await response.json()).code, 'EXTERNAL_WRITER_EXCLUSION_UNVERIFIED');
  assert.equal(f.state.updates, 0);
});

test('uncertain Google response survives restart and replay never repeats the PUT', async t => {
  const f = fixture(t), approvals = new Set();
  const c = command(f, (await f.editor().read(actor)).headHash); await approve(approvals, c);
  f.state.onUpdate = async () => { throw Error('PRIVATE_PROVIDER_ERROR'); };
  const response = await route(f, approvals)(request(f, c));
  assert.equal((await response.json()).code, 'WRITE_OUTCOME_REQUIRES_RECONCILIATION');
  f.restart();
  const replay = await route(f, approvals)(request(f, c, { run_id: '101' }));
  assert.equal((await replay.json()).status, 'RECONCILIATION_REQUIRED');
  assert.equal(f.state.updates, 1);
});

test('existing Worker default rejects signed writer route without adding credentials or enabling policy', async t => {
  const f = fixture(t);
  const object = new MuseumScriptCoordinator({ storage: f.storage }, {});
  const response = await object.fetch(request(f, command(f, 'a'.repeat(64))));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'SIGNED_WRITER_PREREQUISITES_UNCONFIGURED');
  assert.equal(f.state.updates, 0);
});
