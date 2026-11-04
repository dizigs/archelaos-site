import assert from 'node:assert/strict';
import { test } from 'node:test';
import { actor, cipher, fixture, projectId, files } from './fixtures.mjs';
import { GoogleProjects } from '../../automation/apps-script/editor.mjs';
import { ScriptFault } from '../../automation/apps-script/security.mjs';
import { applyChanges, normalizeFiles } from '../../automation/apps-script/files.mjs';
const change = hash => ({ operationId: crypto.randomUUID(), expectedBaseHash: hash, changes: [{ name: 'SyntheticProbe.gs', source: '// harmless synthetic fixture only', create: true }] });
const rejected = code => error => error.code === code;

test('authorized private read returns every file including HTML/manifest, no project ID', async t => {
  const f = fixture(t); const result = await f.editor().read(actor);
  assert.equal(result.files.length, 5); assert.equal(result.projectIdentityVerified, true);
  assert.deepEqual(result.files, files()); assert.equal(result.projectId, undefined);
});
test('complete immutable backup is encrypted and privately read back before write', async t => {
  const f = fixture(t); const result = await f.editor().backup(actor);
  const encoded = f.store.getPrivate(result.backupId);
  assert.equal(encoded.includes('PRIVATE_SYNTHETIC_SOURCE'), false);
  const saved = await cipher().open(encoded, 'script-backup:' + projectId + ':' + result.backupId);
  assert.deepEqual(saved.content.files, files()); assert.equal(saved.beforeHash, result.headHash);
  assert.throws(() => f.store.putPrivate(result.backupId, 'overwrite'));
  assert.equal(f.state.updates, 0);
});
test('new .gs update sends full collection and preserves every original byte', async t => {
  const f = fixture(t); const original = files(); const base = await f.editor().read(actor);
  const result = await f.editor().edit(actor, change(base.headHash));
  assert.equal(result.status, 'VERIFIED'); assert.equal(result.providerDeploymentVerified, false); assert.equal(f.state.updates, 1);
  assert.deepEqual(f.state.files.slice(0, original.length), original);
  assert.equal(f.state.files.at(-1).name, 'SyntheticProbe'); assert.equal(f.state.files.length, 6);
});
test('rollback also privately backs up the complete current state and restores all files', async t => {
  const f = fixture(t); const base = await f.editor().read(actor); const edited = await f.editor().edit(actor, change(base.headHash));
  const restored = await f.editor().rollback(actor, { operationId: crypto.randomUUID(), expectedBaseHash: edited.headHash, backupId: edited.backupId });
  assert.equal(restored.status, 'VERIFIED'); assert.equal(restored.headHash, base.headHash); assert.deepEqual(f.state.files, files());
  const saved = await cipher().open(f.store.getPrivate(restored.backupId), 'script-backup:' + projectId + ':' + restored.backupId);
  assert.equal(saved.files.length, 6); assert.equal(f.state.updates, 2);
});
test('default-disabled writes and unverified exclusive-writer lease perform zero updates', async t => {
  const f = fixture(t); const base = await f.editor().read(actor);
  f.policy.liveWritesEnabled = false;
  await assert.rejects(f.editor().edit(actor, change(base.headHash)), rejected('LIVE_WRITE_PREFLIGHT_INCOMPLETE'));
  f.policy.liveWritesEnabled = true; f.ports.assertExclusiveWriter = async () => ({ verified: false });
  await assert.rejects(f.editor().edit(actor, change(base.headHash)), rejected('EXTERNAL_WRITER_EXCLUSION_UNVERIFIED'));
  assert.equal(f.state.updates, 0);
});
test('wrong Admin, missing granted scope and unverified executor are denied before read', async t => {
  const f = fixture(t);
  for (const invalid of [{ ...actor, email: 'other@example.invalid' }, { ...actor, verified: false }, { ...actor, emailVerified: false }, { ...actor, grantedScopes: [] }, { ...actor, rights: [] }]) await assert.rejects(f.editor().read(invalid), rejected('ADMIN_SCOPE_OR_EXECUTOR_AUTHORIZATION_REQUIRED'));
  assert.equal(f.state.reads, 0);
});
test('stale base refuses PUT and preserves original', async t => {
  const f = fixture(t); await assert.rejects(f.editor().edit(actor, change('b'.repeat(64))), rejected('STALE_PROJECT_HASH')); assert.equal(f.state.updates, 0);
});
test('identity mismatch or incomplete collection never writes', async t => {
  const f = fixture(t); const base = await f.editor().read(actor);
  f.provider.metadata = async () => ({ scriptId: 'foreign', title: 'foreign' });
  await assert.rejects(f.editor().edit(actor, change(base.headHash)), rejected('PROJECT_IDENTITY_MISMATCH'));
  f.provider.metadata = async () => ({ scriptId: projectId, title: 'Synthetic museum fixture' }); f.state.files = files().filter(file => file.name !== 'Code');
  await assert.rejects(f.editor().edit(actor, change(base.headHash)), rejected('PROTECTED_PROJECT_FILES_MISSING'));
  assert.equal(f.state.updates, 0);
});
test('change after snapshot is detected by the second complete read', async t => {
  const f = fixture(t); const base = await f.editor().read(actor);
  f.state.onRead = async count => { if (count === 3) f.state.files.push({ name: 'External', type: 'SERVER_JS', source: '// independent edit' }); };
  await assert.rejects(f.editor().edit(actor, change(base.headHash)), rejected('CONCURRENT_PROJECT_CHANGE'));
  assert.equal(f.state.updates, 0); assert.equal(f.state.files.at(-1).name, 'External');
});
test('unavailable or corrupted backup refuses the first PUT', async t => {
  const f = fixture(t); const base = await f.editor().read(actor); f.store.putPrivate = () => { throw new ScriptFault('SYNTHETIC_BACKUP_FAILURE', 503); };
  await assert.rejects(f.editor().edit(actor, change(base.headHash)), rejected('SYNTHETIC_BACKUP_FAILURE')); assert.equal(f.state.updates, 0);
});
test('parallel identical requests and replay create only one logical write', async t => {
  const f = fixture(t); const input = change((await f.editor().read(actor)).headHash);
  const results = await Promise.all([f.editor().edit(actor, input), f.editor().edit(actor, input)]);
  assert.equal(f.state.updates, 1); assert.ok(results.some(r => r.status === 'VERIFIED'));
  const replay = await f.editor().edit(actor, input); assert.equal(replay.status, 'VERIFIED'); assert.equal(f.state.updates, 1);
  await assert.rejects(f.editor().edit(actor, { ...input, changes: [{ ...input.changes[0], source: '// different' }] }), rejected('OPERATION_ID_CONFLICT'));
});
test('parallel different operation IDs serialize the project and never overwrite each other', async t => {
  const f = fixture(t); const hash = (await f.editor().read(actor)).headHash;
  const results = await Promise.allSettled([f.editor().edit(actor, change(hash)), f.editor().edit(actor, change(hash))]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'PROJECT_OPERATION_IN_PROGRESS'); assert.equal(f.state.updates, 1);
});
test('uncertain successful PUT survives SQLite restart; replay cannot send again; reconcile only reads', async t => {
  const f = fixture(t); const input = change((await f.editor().read(actor)).headHash);
  f.state.onUpdate = async next => { f.state.files = structuredClone(next); throw new Error('synthetic timeout; never disclose'); };
  await assert.rejects(f.editor().edit(actor, input), rejected('WRITE_OUTCOME_REQUIRES_RECONCILIATION'));
  f.restart(); const replay = await f.editor().edit(actor, input); assert.equal(replay.status, 'RECONCILIATION_REQUIRED'); assert.equal(f.state.updates, 1);
  await assert.rejects(f.editor().reconcile(actor, input.operationId), rejected('OPERATION_STILL_SETTLING'));
  f.state.clock += 30001;
  const reconciled = await f.editor().reconcile(actor, input.operationId); assert.equal(reconciled.status, 'VERIFIED'); assert.equal(reconciled.reconciled, true); assert.equal(f.state.updates, 1);
});
test('unobserved/foreign outcome keeps durable lock; no automatic retry or unsafe rollback', async t => {
  const f = fixture(t); const hash = (await f.editor().read(actor)).headHash; const input = change(hash);
  f.state.onUpdate = async () => { throw new Error('synthetic uncertain provider outcome'); };
  await assert.rejects(f.editor().edit(actor, input)); f.state.clock += 30001;
  assert.equal((await f.editor().reconcile(actor, input.operationId)).status, 'RECONCILIATION_REQUIRED');
  await assert.rejects(f.editor().edit(actor, change(hash)), rejected('PROJECT_OPERATION_IN_PROGRESS')); assert.equal(f.state.updates, 1);
});
test('trigger changes after update are retained as unresolved, never silently passed', async t => {
  const f = fixture(t); const input = change((await f.editor().read(actor)).headHash);
  f.state.onUpdate = async next => { f.state.files = structuredClone(next); f.state.trigger = 'b'.repeat(64); return { scriptId: projectId, files: next }; };
  await assert.rejects(f.editor().edit(actor, input), rejected('WRITE_OUTCOME_REQUIRES_RECONCILIATION'));
  assert.equal((await f.editor().operation(actor, input.operationId)).result.code, 'TRIGGER_INVENTORY_CHANGED');
});
test('missing trigger observation and rejected review are prewrite failures', async t => {
  const f = fixture(t); const input = change((await f.editor().read(actor)).headHash);
  f.ports.readTriggerInventory = undefined; await assert.rejects(f.editor().edit(actor, input), rejected('TRIGGER_VERIFICATION_UNAVAILABLE'));
  f.ports.readTriggerInventory = async () => ({ verified: true, fingerprint: 'a'.repeat(64) }); f.ports.reviewChange = async () => false;
  await assert.rejects(f.editor().edit(actor, { ...input, operationId: crypto.randomUUID() }), rejected('IMMUTABLE_DIFF_REVIEW_REQUIRED')); assert.equal(f.state.updates, 0);
});
test('manifest/deletion/path traversal/ambiguous creations and oversize content are rejected', () => {
  for (const changes of [[{ name: 'appsscript', source: '{}'}], [{ name: '../Code', source: 'bad' }], [{ name: 'Code', source: '', create: false }], [{ name: 'Code', source: 'bad', delete: true }], [{ name: 'Code.gs', source: 'bad', create: true }]]) assert.throws(() => applyChanges(files(), changes));
  assert.throws(() => normalizeFiles({ files: files().concat(files()[0]) }));
  const large = files(); large[0].source = 'a'.repeat(2 * 1024 * 1024); assert.throws(() => normalizeFiles({ files: large }));
});
test('Google transport uses only bound project metadata/content, full PUT and private Bearer', async () => {
  const requests = [];
  const provider = new GoogleProjects({ projectId, accessToken: async () => 'synthetic-private-access-token', fetchGoogle: async (url, init) => { requests.push({ url, init }); return Response.json({ scriptId: projectId, files: files() }); } });
  await provider.metadata(); await provider.content(); await provider.update(files());
  assert.equal(requests.length, 3); assert.equal(requests[2].init.method, 'PUT'); assert.deepEqual(JSON.parse(requests[2].init.body).files, files());
  for (const r of requests) { assert.ok(r.url.startsWith('https://script.googleapis.com/v1/projects/' + projectId)); assert.ok(!r.url.includes('access_token')); assert.equal(r.init.redirect, 'error'); }
});
test('Google HTTP403 is bounded and never automatically retried', async () => {
  let calls = 0; const provider = new GoogleProjects({ projectId, accessToken: async () => 'synthetic-private-access-token', fetchGoogle: async () => { calls++; return new Response('synthetic credential-like error must not escape', { status: 403 }); } });
  await assert.rejects(provider.content(), rejected('GOOGLE_HTTP_403')); assert.equal(calls, 1);
});

test('private backup quota stops writes without deleting or overwriting existing snapshots', async t => {
  const f = fixture(t);
  for (let i = 0; i < 64; i++) f.store.putPrivate('synthetic-' + i, 'synthetic-opaque-record');
  const base = await f.editor().read(actor);
  await assert.rejects(f.editor().edit(actor, change(base.headHash)), rejected('PRIVATE_BACKUP_CAPACITY_REACHED'));
  assert.equal(f.state.updates, 0); assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM script_private_blobs').get().n, 64);
});
