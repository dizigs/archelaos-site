import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, webcrypto} from 'node:crypto';
import {serviceAccountJsonToken} from '../src/service-account-json.mjs';
import {adsAccessToken} from '../src/google-ads-api.mjs';

const project = 'archelaos-synthetic-project';
const email = 'ads-automation@' + project + '.iam.gserviceaccount.com';
const pair = generateKeyPairSync('rsa', {modulusLength: 2048});
const key = pair.privateKey.export({type: 'pkcs8', format: 'pem'});
const json = JSON.stringify({
  type: 'service_account', project_id: project, client_email: email,
  private_key: key, token_uri: 'https://oauth2.googleapis.com/token'
});
const env = {
  ADS_OAUTH_MODE: 'SERVICE_ACCOUNT_JSON', ADS_SERVICE_ACCOUNT_JSON: json,
  ADS_SERVICE_ACCOUNT_PROJECT_ID: project,
  ADS_SERVICE_ACCOUNT_CLIENT_EMAIL: email
};
const jwtPart = value => JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
test('JSON-secret path preserves #225 RS256 JWT signature, scope and expiry', async () => {
  let count = 0;
  const now = () => Date.parse('2026-11-05T18:00:00Z');
  const fetcher = async (url, opts) => {
    count++;
    assert.equal(url, 'https://oauth2.googleapis.com/token');
    assert.equal(opts.method, 'POST');
    assert.equal(opts.body.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    assert(!String(opts.body).includes('PRIVATE KEY'));
    const [header, claims, signature] = opts.body.get('assertion').split('.');
    assert.deepEqual(jwtPart(header), {alg: 'RS256', typ: 'JWT'});
    const claim = jwtPart(claims);
    assert.equal(claim.iss, email);
    assert.equal(claim.scope, 'https://www.googleapis.com/auth/adwords');
    assert.equal(claim.aud, url);
    assert.equal(claim.exp - claim.iat, 3300);
    if (count === 1) assert.equal(claim.iat, Math.floor(now() / 1000));
    else assert.ok(Math.abs(claim.iat - Math.floor(Date.now() / 1000)) < 5);
    const pub = await webcrypto.subtle.importKey('spki',
      pair.publicKey.export({type: 'spki', format: 'der'}),
      {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['verify']);
    assert.equal(await webcrypto.subtle.verify('RSASSA-PKCS1-v1_5', pub,
      Buffer.from(signature, 'base64url'), new TextEncoder().encode(header + '.' + claims)), true);
    return {ok: true, json: async () => ({access_token: 'synthetic-token', token_type: 'Bearer'})};
  };
  assert.equal(await serviceAccountJsonToken(env, {fetcher, cryptoImpl: webcrypto, now}),
    'synthetic-token');
  assert.equal(count, 1);
  assert.equal(await adsAccessToken(env, fetcher), 'synthetic-token');
});
test('no unpinned project, mismatched service identity or unsupported key is accepted', async () => {
  const never = async () => {throw Error('NETWORK_MUST_NOT_BE_CALLED');};
  for (const bad of [
    {...env, ADS_SERVICE_ACCOUNT_PROJECT_ID: 'different-project'},
    {...env, ADS_SERVICE_ACCOUNT_CLIENT_EMAIL: 'other@' + project + '.iam.gserviceaccount.com'},
    {...env, ADS_SERVICE_ACCOUNT_JSON: '{not-json'},
    {...env, ADS_SERVICE_ACCOUNT_JSON: JSON.stringify({...JSON.parse(json), token_uri: 'https://evil.invalid'})},
    {...env, ADS_SERVICE_ACCOUNT_JSON: JSON.stringify({...JSON.parse(json), private_key: 'not-a-key'})},
    {...env, ADS_SERVICE_ACCOUNT_JSON: undefined}
  ]) {
    await assert.rejects(() => serviceAccountJsonToken(bad, {fetcher: never, cryptoImpl: webcrypto}),
      /ADS_SERVICE_ACCOUNT_/);
  }
});
test('both #229 PEM mode and #225 JSON mode require explicit selection; no fallback', async () => {
  const never = async () => {throw Error('NETWORK_MUST_NOT_BE_CALLED');};
  for (const mode of ['UNCONFIGURED', 'disabled', undefined, 'service_account']) {
    await assert.rejects(() => adsAccessToken({...env, ADS_OAUTH_MODE: mode}, never),
      /ADS_AUTH_MODE_NOT_APPROVED/);
  }
  assert.equal(env.ADS_LIVE_ENABLED, undefined);
  assert.equal(env.ADS_KILL_SWITCH, undefined);
});
test('token endpoint rejection and untyped token fail closed without leaking response', async () => {
  await assert.rejects(() => serviceAccountJsonToken(env, {
    cryptoImpl: webcrypto, fetcher: async () => ({ok: false, status: 403})
  }), /ADS_SERVICE_ACCOUNT_OAUTH_REJECTED/);
  await assert.rejects(() => serviceAccountJsonToken(env, {
    cryptoImpl: webcrypto, fetcher: async () => ({
      ok: true, json: async () => ({access_token: 'synthetic-token', error_description: json})
    })
  }), /ADS_SERVICE_ACCOUNT_ACCESS_TOKEN_INVALID/);
});
