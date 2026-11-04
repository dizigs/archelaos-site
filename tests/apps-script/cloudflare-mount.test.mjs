import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures.mjs';
import { withAppsScriptCoordinator, MuseumScriptCoordinator } from '../../automation/apps-script/cloudflare-mount.mjs';

const req = path => new Request('https://archelaos-automation-bridge.example' + path);
const old = { fetch: async request => new Response('legacy:' + new URL(request.url).pathname, { status: 202 }) };

test('same Worker retains legacy health, ping, regular OAuth and callback', async () => {
  const bridge = withAppsScriptCoordinator(old);
  for (const path of ['/health', '/api/ping', '/auth/start', '/oauth/callback?state=old']) {
    const response = await bridge.fetch(req(path), {}, {});
    assert.equal(response.status, 202);
    assert.equal(await response.text(), 'legacy:' + new URL(req(path).url).pathname);
  }
});

test('new OAuth and Apps Script endpoints fail closed without private config', async () => {
  const bridge = withAppsScriptCoordinator(old);
  for (const path of ['/auth/start?purpose=apps-script', '/api/apps-script/content']) {
    const response = await bridge.fetch(req(path), {}, {});
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { code: 'SCRIPT_PRIVATE_CONFIGURATION_REQUIRED' });
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});

test('a normal KV binding does not substitute for atomic SQLite coordinator', async () => {
  const bridge = withAppsScriptCoordinator(old);
  const response = await bridge.fetch(req('/api/apps-script/content'), {
    APPS_SCRIPT_PROJECT_ID: 'test-project', APPS_SCRIPT_ADMIN_EMAIL: 'admin@example.invalid',
    AUTH_KV: { get: async () => null, put: async () => {} },
  }, {});
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: 'ATOMIC_PRIVATE_STORE_REQUIRED' });
});

test('new routes alone forward to project-scoped coordinator', async () => {
  const routed = [];
  const namespace = {
    idFromName: name => { routed.push('id:' + name); return 'synthetic-id'; },
    get: id => ({
      fetch: async request => {
        routed.push('fetch:' + id + ':' + new URL(request.url).pathname);
        return new Response('synthetic-do', { status: 203 });
      },
    }),
  };
  const bridge = withAppsScriptCoordinator(old);
  const env = {
    APPS_SCRIPT_PROJECT_ID: 'test-project', APPS_SCRIPT_ADMIN_EMAIL: 'admin@example.invalid',
    APPS_SCRIPT_COORDINATOR: namespace,
  };
  const script = await bridge.fetch(req('/api/apps-script/content'), env, {});
  assert.equal(script.status, 203);
  assert.equal(await script.text(), 'synthetic-do');
  const legacy = await bridge.fetch(req('/auth/start'), env, {});
  assert.equal(legacy.status, 202);
  assert.deepEqual(routed, ['id:test-project', 'fetch:synthetic-id:/api/apps-script/content']);
});

test('coordinator faults do not disclose private error details', async () => {
  const bridge = withAppsScriptCoordinator(old);
  const env = {
    APPS_SCRIPT_PROJECT_ID: 'p', APPS_SCRIPT_ADMIN_EMAIL: 'admin@example.invalid',
    APPS_SCRIPT_COORDINATOR: {
      idFromName: () => 'id',
      get: () => ({ fetch: async () => { throw Error('SENSITIVE_PROVIDER_DETAIL'); } }),
    },
  };
  const response = await bridge.fetch(req('/auth/start?purpose=apps-script'), env, {});
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: 'SCRIPT_COORDINATOR_UNAVAILABLE' });
});

test('Durable Object denies unrelated routes and missing SQLite store', async () => {
  const obj = new MuseumScriptCoordinator({ storage: {} }, {});
  assert.equal((await obj.fetch(req('/health'))).status, 404);
  const response = await obj.fetch(req('/api/apps-script/content'));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: 'ATOMIC_PRIVATE_STORE_REQUIRED' });
});

test('mount refuses absent existing Worker handler', () => {
  assert.throws(() => withAppsScriptCoordinator({}), /EXISTING_WORKER_FETCH_REQUIRED/);
});

test('Cloudflare-admin queued operator probe runs once without exposing source or permitting editor writes', t => {
  const f = fixture(t);
  const obj = new MuseumScriptCoordinator({ storage: f.storage }, {});
  const id = crypto.randomUUID();
  f.storage.sql.exec("INSERT INTO script_admin_grants(actor,session) VALUES(?,?)", 'synthetic-admin-hash', 'synthetic-session-hash');
  f.storage.sql.exec("INSERT INTO script_private_blobs(id,cipher) VALUES(?,?)", crypto.randomUUID(), 'synthetic-private-cipher');
  f.store.audit(crypto.randomUUID(), 'BROWSER_ENCRYPTED_BACKUP_VERIFIED');
  f.storage.sql.exec('INSERT INTO script_operator_probes(id,status,expires,updated) VALUES(?,?,?,?)', id, 'QUEUED', f.state.clock + 60000, f.state.clock);
  return (async () => {
    const request = () => req('/api/apps-script/operator-probe');
    const result = await obj.fetch(request());
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { status: 'OPERATOR_PROBE_ACCEPTED', readOnly: true });
    const row = f.db.prepare('SELECT status,result FROM script_operator_probes WHERE id=?').get(id);
    assert.equal(row.status, 'DONE');
    const receipt = JSON.parse(row.result);
    assert.equal(receipt.status, 'OPERATOR_READONLY_PROBE_VERIFIED');
    assert.equal(receipt.encryptedBackupPresent, true);
    assert.equal(receipt.editOperations, 0);
    assert.equal(receipt.googlePutPerformed, false);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM script_operations').get().n, 0);
    const replay = await obj.fetch(request());
    assert.equal((await replay.json()).status, 'OPERATOR_QUEUE_EMPTY');
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM script_audit WHERE code='OPERATOR_READONLY_PROBE_VERIFIED'").get().n, 1);
    assert.equal((await obj.fetch(req('/api/apps-script/operator-probe?code=unexpected'))).status, 404);
  })();
});

test('operator SQL task rejects expired work without retries or Google operations', async t => {
  const f = fixture(t);
  const obj = new MuseumScriptCoordinator({ storage: f.storage }, {});
  const id = crypto.randomUUID();
  f.storage.sql.exec('INSERT INTO script_operator_probes(id,status,expires,updated) VALUES(?,?,?,?)', id, 'QUEUED', f.state.clock - 1, f.state.clock);
  const response = await obj.fetch(req('/api/apps-script/operator-probe'));
  assert.equal((await response.json()).status, 'OPERATOR_QUEUE_EMPTY');
  assert.equal(f.db.prepare('SELECT status FROM script_operator_probes WHERE id=?').get(id).status, 'REJECTED');
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM script_operations').get().n, 0);
});

test('GitHub OIDC read-only run accepted once, replay blocked, Google edits stay disabled', async t => {
  const f = fixture(t);
  const obj = new MuseumScriptCoordinator({ storage: f.storage }, {}, {
    verifyGithubIdentity: async () => ({
      runKey: '1234567:1', tokenHash: 'a'.repeat(64), sourceCommit: 'b'.repeat(40)
    })
  });
  f.storage.sql.exec('INSERT INTO script_admin_grants(actor,session) VALUES(?,?)', 'a', 'b');
  f.storage.sql.exec('INSERT INTO script_private_blobs(id,cipher) VALUES(?,?)', crypto.randomUUID(), 'test-cipher');
  f.store.audit(crypto.randomUUID(), 'BROWSER_ENCRYPTED_BACKUP_VERIFIED');
  const request = () => new Request('https://archelaos-automation-bridge.example/api/apps-script/github-oidc-probe', {
    method:'POST', headers:{ authorization:'Bearer ' + 'x'.repeat(210) }
  });
  const first = await obj.fetch(request());
  assert.equal(first.status, 200);
  const data = await first.json();
  assert.equal(data.status, 'GITHUB_OIDC_READONLY_PROBE_VERIFIED');
  assert.equal(data.googleEditsPerformed, false);
  assert.equal(data.editorEnabled, false);
  assert.equal(data.encryptedBackupPresent, true);
  assert.equal(f.state.updates, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM script_operations').get().n, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM script_signed_probes').get().n, 1);
  const again = await obj.fetch(request());
  assert.equal(again.status, 409);
  assert.deepEqual(await again.json(), { code:'GITHUB_OIDC_RUN_ALREADY_CONSUMED' });
  const notSigned = await obj.fetch(new Request('https://archelaos-automation-bridge.example/api/apps-script/github-oidc-probe', { method:'POST' }));
  assert.equal(notSigned.status, 401);
});
