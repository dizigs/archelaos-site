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
test('legacy opaque OAuth state sharing a short prefix is not intercepted by the new flow', async () => {
  const route = appsScriptExtension({});
  const legacyState = 'as_' + 'a'.repeat(40);
  assert.equal(await route(new Request(origin + '/oauth/callback?state=' + legacyState)), null);
});

test('Admin browser-only verification is narrowly gated and does not unlock editor endpoints', async () => {
  const calls = [];
  const route = appsScriptExtension({
    oauth: { access: async cookie => { calls.push(cookie); if (cookie !== '__Host-archelaos-script-session=synthetic') throw Object.assign(new Error('unauthorized'), { code: 'ADMIN_SESSION_REQUIRED', status: 401 }); return { principal: actor, accessToken: 'synthetic-private-token', grantedScopes: actor.grantedScopes }; } },
    verifyReadOnly: async grant => {
      assert.equal(grant.accessToken, 'synthetic-private-token');
      return { status: 'ADMIN_PROJECT_READ_VERIFIED', projectIdentityVerified: true, fileCount: 5, readOnly: true };
    },
  });
  const req = new Request(origin + '/api/apps-script/verify', { headers: { cookie: '__Host-archelaos-script-session=synthetic' } });
  const response = await route(req);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'ADMIN_PROJECT_READ_VERIFIED');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(body.accessToken, undefined);
  assert.equal(body.files, undefined);
  const tracked = await route(new Request(origin + '/api/apps-script/verify?utm_source=chatgpt.com', { headers: { cookie: '__Host-archelaos-script-session=synthetic' } }));
  assert.equal(tracked.status, 200);
  assert.equal((await tracked.json()).status, 'ADMIN_PROJECT_READ_VERIFIED');
  for (const query of ['leak=1', 'code=do-not-copy', 'utm_source=chatgpt.com&utm_source=duplicate', 'utm_source=x'.concat('x'.repeat(180))]) {
    const refused = await route(new Request(origin + '/api/apps-script/verify?' + query, { headers: { cookie: '__Host-archelaos-script-session=synthetic' } }));
    assert.equal(refused.status, 404);
    assert.equal((await refused.json()).code, 'UNSUPPORTED_SCRIPT_QUERY');
  }
  assert.equal((await route(new Request(origin + '/api/apps-script/content?utm_source=chatgpt.com', { headers: { cookie: '__Host-archelaos-script-session=synthetic' } }))).status, 503);
  assert.equal((await route(new Request(origin + '/api/apps-script/content', { headers: { cookie: '__Host-archelaos-script-session=synthetic' } }))).status, 503);
  assert.deepEqual(calls, ['__Host-archelaos-script-session=synthetic', '__Host-archelaos-script-session=synthetic']);
});

test('browser-confirmed encrypted backup requires Admin session, same-origin POST and single-use nonce', async () => {
  let created = 0;
  let active = null;
  const route = appsScriptExtension({
    oauth: { access: async cookie => {
      assert.ok(cookie?.includes('__Host-archelaos-script-session=synthetic'));
      return { principal: actor, grantedScopes: actor.grantedScopes, accessToken: 'synthetic-internal' };
    } },
    issueBackupConfirmation: async () => { active = 'a'.repeat(43); return active; },
    createVerifiedBackup: async (grant, nonce) => {
      assert.equal(grant.principal.email, actor.email);
      assert.equal(nonce, active);
      if (!active) throw new Error('already used');
      active = null; created++;
      return { status: 'PRIVATE_BACKUP_VERIFIED', fileCount: 4, encrypted: true, readbackVerified: true };
    },
  });
  const session = '__Host-archelaos-script-session=synthetic';
  const open = await route(new Request(origin + '/api/apps-script/private-backup?utm_source=chatgpt.com', { headers: { cookie: session } }));
  assert.equal(open.status, 200);
  assert.ok((await open.text()).includes('Δημιουργία αντιγράφου'));
  assert.equal(open.headers.get('cache-control'), 'no-store');
  assert.ok(open.headers.get('content-security-policy').includes("form-action 'self'"));
  const csrf = open.headers.get('set-cookie').split(';')[0];
  const body = 'confirmation=' + 'a'.repeat(43);
  const post = async (h = {}, data = body) => route(new Request(origin + '/api/apps-script/private-backup', {
    method: 'POST', headers: { cookie: session + '; ' + csrf, origin, 'sec-fetch-site':'same-origin',
      'content-type': 'application/x-www-form-urlencoded', ...h }, body: data
  }));
  const rejected = await post({origin:'https://example.invalid'});
  assert.equal(rejected.status, 403);
  assert.equal(created, 0);
  const accepted = await post();
  assert.equal(accepted.status, 200, await accepted.clone().text());
  assert.equal((await accepted.json()).status, 'PRIVATE_BACKUP_VERIFIED');
  assert.equal(created, 1);
  const replay = await post();
  assert.equal(replay.status, 503);
  assert.equal(created, 1);
  assert.equal((await post({}, 'confirmation=bogus')).status, 403);
  assert.equal((await route(new Request(origin + '/api/apps-script/private-backup?code=not-allowed', {headers:{cookie:session}}))).status, 404);
});
