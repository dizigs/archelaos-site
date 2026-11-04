import assert from 'node:assert/strict';
import { test } from 'node:test';
import { actor, fixture } from './fixtures.mjs';
import { appsScriptExtension } from '../../automation/apps-script/interface.mjs';
const origin = 'https://archelaos-automation-bridge.dimitriszgalanis.workers.dev';
test('existing health/ping and original OAuth routes are delegated unchanged', async () => {
  const route = appsScriptExtension({});
  for (const path of ['/health', '/api/ping', '/auth/start', '/oauth/callback?state=old-flow']) assert.equal(await route(new Request(origin + path)), null);
});
test('unconfigured executor cannot make private content public', async () => {
  const route = appsScriptExtension({}); const response = await route(new Request(origin + '/api/apps-script/content'));
  assert.equal(response.status, 503); assert.equal((await response.json()).code, 'EXECUTOR_INTERFACE_UNCONFIGURED'); assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('authorized executor can read, add one harmless file, inspect receipt and roll back without copy-paste', async t => {
  const f = fixture(t); let authCalls = 0;
  const route = appsScriptExtension({ authenticateExecutor: async request => { authCalls++; if (request.method === 'POST') await request.text(); return actor; }, editorFor: async () => f.editor() });
  const get = async path => { const r = await route(new Request(origin + path)); assert.equal(r.status, 200); return r.json(); };
  const post = async (path, data) => { const r = await route(new Request(origin + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })); assert.equal(r.status, 200, await r.clone().text()); return r.json(); };
  const base = await get('/api/apps-script/content');
  const backup = await post('/api/apps-script/backup', {}); assert.equal(backup.fileCount, 5);
  const edited = await post('/api/apps-script/changes', { operationId: crypto.randomUUID(), expectedBaseHash: base.headHash, changes: [{ name: 'Probe.gs', source: '// harmless synthetic fixture only', create: true }] });
  assert.equal((await get('/api/apps-script/operations/' + edited.operationId)).status, 'VERIFIED');
  const restored = await post('/api/apps-script/rollback', { operationId: crypto.randomUUID(), expectedBaseHash: edited.headHash, backupId: edited.backupId });
  assert.equal(restored.headHash, base.headHash); assert.equal(f.state.updates, 2); assert.equal(authCalls, 5);
});
test('body-supplied actor/permission fields and unsupported methods cannot escalate privileges', async t => {
  const f = fixture(t); const route = appsScriptExtension({ authenticateExecutor: async () => ({ ...actor, rights: [] }), editorFor: async () => f.editor() });
  const response = await route(new Request(origin + '/api/apps-script/changes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actor, operationId: crypto.randomUUID(), expectedBaseHash: 'a'.repeat(64), changes: [] }) }));
  assert.equal(response.status, 422); assert.equal(f.state.updates, 0);
  const unauthRead = await route(new Request(origin + '/api/apps-script/content')); assert.equal(unauthRead.status, 403);
});
test('OAuth redirect helper is ready for existing-Worker mount, not claimed deployed/callable', async () => {
  const route = appsScriptExtension({ oauth: { begin: async () => ({ location: 'https://accounts.google.com/synthetic-only', cookie: 'synthetic-private-cookie' }) } });
  const r = await route(new Request(origin + '/auth/start?purpose=apps-script')); assert.equal(r.status, 302); assert.ok(r.headers.has('set-cookie')); assert.equal(r.headers.get('cache-control'), 'no-store');
});
