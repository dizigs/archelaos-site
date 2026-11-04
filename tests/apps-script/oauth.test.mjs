import assert from 'node:assert/strict';
import { test } from 'node:test';
import { actor, admin, cipher, fixture, projectId, projectTitle } from './fixtures.mjs';
import { configureExistingBridgeScripts } from '../../automation/apps-script/configure.mjs';
import { ScriptOAuth, SESSION_COOKIE } from '../../automation/apps-script/oauth.mjs';
import { base64url, bytes, PrivateCipher, SCRIPT_SCOPE } from '../../automation/apps-script/security.mjs';
const keyPair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const publicKey = { ...await crypto.subtle.exportKey('jwk', keyPair.publicKey), kid: 'synthetic-kid', alg: 'RS256', use: 'sig' };
async function jwt(claims, header = {}) {
  const body = base64url(bytes(JSON.stringify({ alg: 'RS256', kid: publicKey.kid, ...header }))) + '.' + base64url(bytes(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyPair.privateKey, bytes(body));
  return body + '.' + base64url(new Uint8Array(signature));
}
async function loginFixture(t, options = {}) {
  const f = fixture(t); const config = { clientId: 'synthetic-client', clientSecret: 'synthetic-private-client-secret', expectedAdminEmail: admin, origin: 'https://archelaos-automation-bridge.dimitriszgalanis.workers.dev' };
  const state = { exchanges: 0, refreshes: 0, refreshError: false, ...options };
  let start;
  const fetchGoogle = async (url, init) => {
    if (url === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [publicKey] });
    if (url === 'https://openidconnect.googleapis.com/v1/userinfo') return Response.json({ sub: state.foreignRefresh ? 'different-sub' : actor.sub, email: admin, email_verified: true });
    assert.equal(url, 'https://oauth2.googleapis.com/token'); assert.equal(init.redirect, 'manual');
    const body = new URLSearchParams(init.body); assert.equal(body.get('client_id'), config.clientId); assert.equal(body.get('client_secret'), config.clientSecret);
    if (body.get('grant_type') === 'refresh_token') {
      state.refreshes++; if (state.refreshError) throw new Error('synthetic uncertain refresh');
      return Response.json({ access_token: 'synthetic-new-private-access-token', token_type: 'Bearer', expires_in: 3600, ...(state.narrowRefresh ? { scope: 'openid email' } : {}) });
    }
    state.exchanges++;
    const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes(body.get('code_verifier')))));
    assert.equal(challenge, new URL(start.location).searchParams.get('code_challenge'));
    const claims = { iss: 'https://accounts.google.com', aud: config.clientId, sub: actor.sub, email: admin, email_verified: true, iat: Math.floor(f.state.clock / 1000), exp: Math.floor(f.state.clock / 1000) + 3600, nonce: new URL(start.location).searchParams.get('nonce'), ...state.claims };
    return Response.json({ access_token: 'synthetic-initial-private-access-token', refresh_token: 'synthetic-private-refresh-token', token_type: 'Bearer', expires_in: 3600, scope: state.scope || 'openid email ' + SCRIPT_SCOPE, id_token: state.badSignature ? (await jwt(claims)).slice(0, -8) + 'AAAAAAAA' : await jwt(claims, state.header) });
  };
  const oauth = new ScriptOAuth({ config, store: f.store, cipher: cipher(), fetchGoogle, now: () => f.state.clock });
  start = await oauth.begin();
  const callback = () => oauth.callback({ state: new URL(start.location).searchParams.get('state'), code: 'synthetic-authorization-code', cookieHeader: start.cookie.split(';')[0] });
  return { ...f, oauth, config, start, callback, oauthState: state, fetchGoogle };
}

test('actual authorization URL requests only approved scopes, PKCE/nonce/state/offline and existing callback', async t => {
  const f = await loginFixture(t); const url = new URL(f.start.location);
  assert.equal(url.origin, 'https://accounts.google.com'); assert.equal(url.searchParams.get('scope'), 'openid email ' + SCRIPT_SCOPE);
  assert.equal(url.searchParams.get('redirect_uri'), f.config.origin + '/oauth/callback');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256'); assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('include_granted_scopes'), 'false'); assert.equal(url.searchParams.get('login_hint'), admin);
  assert.ok(f.start.cookie.includes('HttpOnly')); assert.ok(f.start.cookie.includes('Secure')); assert.ok(f.start.cookie.includes('SameSite=Lax'));
  const rows = f.db.prepare('SELECT cipher FROM script_oauth_states').all(); assert.ok(!rows[0].cipher.includes('verifier'));
});
test('RSA-verified Admin callback stores only encrypted tokens and returns no bearer/refresh credential', async t => {
  const f = await loginFixture(t); const result = await f.callback();
  assert.equal(result.status, 'ADMIN_SCRIPT_GRANT_VERIFIED'); assert.ok(result.grantedScopes.includes(SCRIPT_SCOPE));
  assert.ok(!JSON.stringify(result).includes('synthetic-private-refresh-token'));
  const cipherText = f.db.prepare('SELECT cipher FROM script_oauth_sessions').get().cipher;
  assert.ok(!cipherText.includes('synthetic-initial-private-access-token')); assert.ok(!cipherText.includes('synthetic-private-refresh-token'));
  const session = await f.oauth.access(result.cookie.split(';')[0]); assert.equal(session.principal.email, admin); assert.equal(session.accessToken, 'synthetic-initial-private-access-token');
});
test('missing script scope, unexpected Gmail scope and wrong/unverified account fail closed', async t => {
  for (const options of [{ scope: 'openid email' }, { scope: 'openid email ' + SCRIPT_SCOPE + ' https://www.googleapis.com/auth/gmail.readonly' }, { claims: { email: 'other@example.invalid' } }, { claims: { email_verified: false } }]) {
    const f = await loginFixture(t, options); await assert.rejects(f.callback()); assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM script_oauth_sessions').get().n, 0);
  }
});
test('issuer, audience, nonce, expiration, alg and signature must all verify cryptographically', async t => {
  for (const options of [{ claims: { iss: 'https://foreign.invalid' } }, { claims: { aud: 'foreign-client' } }, { claims: { nonce: 'foreign-nonce' } }, { claims: { exp: 1 } }, { header: { alg: 'none' } }, { badSignature: true }]) {
    const f = await loginFixture(t, options); await assert.rejects(f.callback(), error => error.code === 'GOOGLE_IDENTITY_PROOF_REJECTED');
  }
});
test('browser binding and expired state deny before any token endpoint call', async t => {
  const f = await loginFixture(t); const state = new URL(f.start.location).searchParams.get('state');
  await assert.rejects(f.oauth.callback({ state, code: 'synthetic', cookieHeader: '' })); assert.equal(f.oauthState.exchanges, 0);
  f.state.clock += 600001; await assert.rejects(f.callback(), error => error.code === 'OAUTH_STATE_EXPIRED_OR_REPLAYED'); assert.equal(f.oauthState.exchanges, 0);
});
test('concurrent callback/replay consumes durable state once', async t => {
  const f = await loginFixture(t); const results = await Promise.allSettled([f.callback(), f.callback()]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(f.oauthState.exchanges, 1);
  await assert.rejects(f.callback(), error => error.code === 'OAUTH_STATE_EXPIRED_OR_REPLAYED'); assert.equal(f.oauthState.exchanges, 1);
});
test('refresh uses encrypted original refresh grant, preserves omitted scope per OAuth standard and binds principal', async t => {
  const f = await loginFixture(t); const result = await f.callback(); f.state.clock += 3600001;
  const refreshed = await f.oauth.access(result.cookie.split(';')[0]); assert.equal(refreshed.accessToken, 'synthetic-new-private-access-token'); assert.ok(refreshed.grantedScopes.includes(SCRIPT_SCOPE)); assert.equal(f.oauthState.refreshes, 1);
  assert.equal((await f.oauth.access(result.cookie.split(';')[0])).accessToken, refreshed.accessToken); assert.equal(f.oauthState.refreshes, 1);
});
test('concurrent refresh is claimed once and uncertain outcome is never blindly retried', async t => {
  const f = await loginFixture(t); const result = await f.callback(); f.state.clock += 3600001; f.oauthState.refreshError = true;
  const attempts = await Promise.allSettled([f.oauth.access(result.cookie), f.oauth.access(result.cookie)]); assert.equal(attempts.filter(r => r.status === 'rejected').length, 2);
  await assert.rejects(f.oauth.access(result.cookie), error => error.code === 'REFRESH_RECONCILIATION_REQUIRED'); assert.equal(f.oauthState.refreshes, 1);
});
test('refresh account substitution or scope reduction cannot replace the approved grant', async t => {
  for (const options of [{ foreignRefresh: true }, { narrowRefresh: true }]) {
    const f = await loginFixture(t, options); const result = await f.callback(); f.state.clock += 3600001;
    await assert.rejects(f.oauth.access(result.cookie)); assert.equal(f.oauthState.refreshes, 1);
  }
});
test('verified executor resolves the Admin grant without copying browser cookies or Google tokens into a task', async t => {
  const f = await loginFixture(t); await f.callback();
  const access = await f.oauth.accessForPrincipal(actor); assert.equal(access.principal.sub, actor.sub);
  await assert.rejects(f.oauth.accessForPrincipal({ ...actor, verified: false })); await assert.rejects(f.oauth.accessForPrincipal({ ...actor, sub: 'foreign' }));
});
test('cipher context binding and authentication prevent cross-project backup/token replay', async () => {
  const c = cipher(); const sealed = await c.seal({ private: 'synthetic-secret' }, 'first');
  await assert.rejects(c.open(sealed, 'second')); await assert.rejects(c.open('{"version":1,"iv":"corrupt","data":"corrupt"}', 'first'));
  assert.throws(() => new PrivateCipher('short'));
});

test('composed HTTP editor uses real verified grant fields, not caller-supplied scopes, with synthetic Google transport', async t => {
  const f = await loginFixture(t); await f.callback();
  let puts = 0;
  const fetchGoogle = async (url, init) => {
    if (url.startsWith('https://script.googleapis.com/v1/projects/')) {
      assert.equal(init.headers.authorization, 'Bearer synthetic-initial-private-access-token');
      if (!url.endsWith('/content')) return Response.json({ scriptId: projectId, title: projectTitle });
      if (init.method === 'PUT') { puts++; f.state.files = JSON.parse(init.body).files; }
      return Response.json({ scriptId: projectId, files: f.state.files });
    }
    return f.fetchGoogle(url, init);
  };
  const route = configureExistingBridgeScripts({ env: { GOOGLE_CLIENT_ID: f.config.clientId, GOOGLE_CLIENT_SECRET: f.config.clientSecret, OAUTH_STATE_SECRET: 'synthetic-private-storage-key-'.repeat(3), APPS_SCRIPT_PROJECT_ID: projectId, APPS_SCRIPT_PROJECT_TITLE: projectTitle, APPS_SCRIPT_ADMIN_EMAIL: admin }, storage: f.storage, authenticateExecutor: async () => ({ ...actor, grantedScopes: [] }), ports: f.ports, policy: f.policy, fetchGoogle, now: () => f.state.clock });
  const origin = f.config.origin;
  const read = await route(new Request(origin + '/api/apps-script/content')); assert.equal(read.status, 200); const base = await read.json();
  const updated = await route(new Request(origin + '/api/apps-script/changes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ operationId: crypto.randomUUID(), expectedBaseHash: base.headHash, changes: [{ name: 'ComposedProbe.gs', source: '// synthetic only', create: true }] }) }));
  assert.equal(updated.status, 200); assert.equal(puts, 1); assert.equal(f.state.files.length, 6);
});
test('unconfigured optional extension leaves all existing bridge routes operational and fails new routes closed', async () => {
  const route = configureExistingBridgeScripts({ env: {} });
  for (const path of ['/health', '/auth/start', '/api/ping']) assert.equal(await route(new Request('https://archelaos-automation-bridge.dimitriszgalanis.workers.dev' + path)), null);
  const denied = await route(new Request('https://archelaos-automation-bridge.dimitriszgalanis.workers.dev/api/apps-script/content'));
  assert.equal(denied.status, 503); assert.equal((await denied.json()).code, 'ATOMIC_PRIVATE_STORE_REQUIRED');
});

test('public consent-start admission is bounded atomically without retaining IP/email rate keys', async t => {
  const f = await loginFixture(t);
  for (let i = 1; i < 30; i++) await f.oauth.begin();
  await assert.rejects(f.oauth.begin(), error => error.code === 'OAUTH_START_RATE_LIMIT');
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM script_oauth_states').get().n, 30);
  f.state.clock += 600001;
  await f.oauth.begin();
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM script_oauth_states').get().n, 1);
});

// Regression: Workers rejects redirect: 'error' and native fetch as a method receiver.
test('Cloudflare-style token fetch uses no instance receiver and refuses redirects', async t => {
  const f = fixture(t);
  const seen = [];
  const fetchGoogle = function(url, init) {
    assert.equal(this, undefined); // Native Workers fetch requires its global receiver.
    assert.equal(init.redirect, 'manual');
    seen.push({ url, method: init.method });
    return Response.redirect('https://example.invalid/never-follow', 302);
  };
  const oauth = new ScriptOAuth({
    config: { clientId: 'synthetic-client', clientSecret: 'synthetic-secret', expectedAdminEmail: admin, origin: 'https://archelaos-automation-bridge.dimitriszgalanis.workers.dev' },
    store: f.store, cipher: cipher(), fetchGoogle,
  });
  await assert.rejects(oauth.exchange({ grant_type: 'authorization_code', code: 'synthetic-only', code_verifier: 'synthetic-verifier', redirect_uri: 'https://archelaos-automation-bridge.dimitriszgalanis.workers.dev/oauth/callback' }), error => error.code === 'GOOGLE_REDIRECT_REJECTED');
  assert.deepEqual(seen, [{ url: 'https://oauth2.googleapis.com/token', method: 'POST' }]);
});

test('new browser-only verification reads real synthetic project metadata/content with grant, not source or writes', async t => {
  const f = await loginFixture(t);
  const grant = await f.callback();
  const cookie = grant.cookie.split(';')[0];
  const seen = [];
  const google = async (url, init) => {
    if (url.startsWith('https://script.googleapis.com/v1/projects/')) {
      seen.push({ url, method: init.method, redirect: init.redirect, bearer: init.headers.authorization });
      if (url.endsWith('/content')) return Response.json({ scriptId: projectId, files: f.state.files });
      return Response.json({ scriptId: projectId, title: projectTitle });
    }
    return f.fetchGoogle(url, init);
  };
  const route = configureExistingBridgeScripts({
    env: { GOOGLE_CLIENT_ID: f.config.clientId, GOOGLE_CLIENT_SECRET: f.config.clientSecret,
      OAUTH_STATE_SECRET: 'synthetic-private-storage-key-'.repeat(3), APPS_SCRIPT_PROJECT_ID: projectId,
      APPS_SCRIPT_PROJECT_TITLE: projectTitle, APPS_SCRIPT_ADMIN_EMAIL: admin },
    storage: f.storage, fetchGoogle: google, now: () => f.state.clock,
  });
  const target = f.config.origin + '/api/apps-script/verify';
  const good = await route(new Request(target, { headers: { cookie } }));
  assert.equal(good.status, 200, await good.clone().text());
  const summary = await good.json();
  assert.deepEqual(summary, { status: 'ADMIN_PROJECT_READ_VERIFIED', projectIdentityVerified: true, completeFilesVerified: true, fileCount: 5, readOnly: true });
  assert.equal(good.headers.get('cache-control'), 'no-store');
  assert.equal((await route(new Request(target))).status, 401);
  const blocked = await route(new Request(f.config.origin + '/api/apps-script/content', { headers: { cookie } }));
  assert.equal(blocked.status, 503); // Signed executor remains unavailable even after Admin consent
  assert.equal((await blocked.json()).code, 'EXECUTOR_INTERFACE_UNCONFIGURED');
  assert.deepEqual(seen.map(x => x.method), ['GET', 'GET']);
  assert.ok(seen.every(x => x.redirect === 'manual' && x.bearer === 'Bearer synthetic-initial-private-access-token'));
  assert.equal(f.state.updates, 0);
});

test('realistic offline four-file encrypted backup verifies readback without Google PUT', async t => {
  const f = await loginFixture(t);
  const grant = await f.callback();
  const session = grant.cookie.split(';')[0];
  const googleCalls = [];
  const fetchGoogle = async (url, init) => {
    if (url.startsWith('https://script.googleapis.com/v1/projects/')) {
      googleCalls.push({ url, method: init.method });
      if (url.endsWith('/content')) return Response.json({ scriptId: projectId, files: f.state.files });
      return Response.json({ scriptId: projectId, title: projectTitle });
    }
    return f.fetchGoogle(url, init);
  };
  const handler = configureExistingBridgeScripts({
    env: {
      GOOGLE_CLIENT_ID: f.config.clientId, GOOGLE_CLIENT_SECRET: f.config.clientSecret,
      OAUTH_STATE_SECRET: 'synthetic-private-storage-key-'.repeat(3),
      APPS_SCRIPT_PROJECT_ID: projectId, APPS_SCRIPT_PROJECT_TITLE: projectTitle,
      APPS_SCRIPT_ADMIN_EMAIL: admin
    }, storage: f.storage, fetchGoogle, now: () => f.state.clock
  });
  const origin = f.config.origin;
  const page = await handler(new Request(origin + '/api/apps-script/private-backup', {headers:{cookie:session}}));
  assert.equal(page.status, 200, await page.clone().text());
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM script_private_blobs').get().n, 0);
  const cookie = page.headers.get('set-cookie').split(';')[0];
  const nonce = cookie.slice(cookie.indexOf('=') + 1);
  const body = 'confirmation=' + nonce;
  const post = () => handler(new Request(origin + '/api/apps-script/private-backup', {
    method:'POST', headers: {
      cookie:session+'; '+cookie, origin, 'sec-fetch-site':'same-origin',
      'content-type':'application/x-www-form-urlencoded'
    }, body
  }));
  const result = await post();
  assert.equal(result.status, 200, await result.clone().text());
  const publicSummary = await result.json();
  assert.deepEqual(publicSummary, {status:'PRIVATE_BACKUP_VERIFIED',fileCount:5,encrypted:true,readbackVerified:true});
  const stored = f.db.prepare('SELECT id,cipher FROM script_private_blobs').get();
  assert.ok(stored && !stored.cipher.includes('PRIVATE_SYNTHETIC_SOURCE'));
  const copy = await cipher().open(stored.cipher, 'script-backup:' + projectId + ':' + stored.id);
  assert.deepEqual(copy.content.files, f.state.files);
  assert.equal(copy.files.length, 5);
  assert.equal(f.state.updates, 0);
  assert.equal(googleCalls.length, 2);
  assert.ok(googleCalls.every(call => call.method === 'GET'));
  assert.equal((await post()).status, 409);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM script_private_blobs').get().n, 1);
  const locked = await handler(new Request(origin + '/api/apps-script/content', {headers:{cookie:session}}));
  assert.equal(locked.status, 503);
});
