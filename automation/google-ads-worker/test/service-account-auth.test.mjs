import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, webcrypto} from 'node:crypto';
import {serviceAccountAccessToken} from '../src/service-account-auth.mjs';
import {adsAccessToken} from '../src/google-ads-api.mjs';

const pair = generateKeyPairSync('rsa', {modulusLength: 2048});
const email = 'synthetic-ads@example-project.iam.gserviceaccount.com';
const json = JSON.stringify({
  type: 'service_account', client_email: email,
  private_key: pair.privateKey.export({type: 'pkcs8', format: 'pem'}),
  token_uri: 'https://oauth2.googleapis.com/token'
});
const env = {ADS_AUTH_MODE: 'service_account', ADS_SERVICE_ACCOUNT_JSON: json};
const clock = () => Date.UTC(2026, 10, 5, 18, 0, 0);
const readJwt = value => JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));

test('service account JWT is RS256-signed, bounded, and scoped to adwords', async () => {
  let requests = 0;
  const fetcher = async (url, options) => {
    requests++;
    assert.equal(url, 'https://oauth2.googleapis.com/token');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['content-type'], 'application/x-www-form-urlencoded');
    const form = new URLSearchParams(options.body);
    assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    const [header, payload, signature] = form.get('assertion').split('.');
    assert.deepEqual(readJwt(header), {alg: 'RS256', typ: 'JWT'});
    const claim = readJwt(payload);
    assert.equal(claim.iss, email);
    assert.equal(claim.scope, 'https://www.googleapis.com/auth/adwords');
    assert.equal(claim.aud, url);
    assert.equal(claim.iat, Math.floor(clock() / 1000));
    assert.equal(claim.exp - claim.iat, 3300);
    assert(!String(options.body).includes('PRIVATE KEY'));
    const pub = await webcrypto.subtle.importKey('spki',
      pair.publicKey.export({type: 'spki', format: 'der'}),
      {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['verify']);
    assert(await webcrypto.subtle.verify('RSASSA-PKCS1-v1_5', pub,
      Buffer.from(signature, 'base64url'), new TextEncoder().encode(header + '.' + payload)));
    return {ok: true, status: 200, json: async () => ({access_token: 'mock-ads-token'})};
  };
  const access = await serviceAccountAccessToken(env, {fetcher, cryptoImpl: webcrypto, now: clock});
  assert.equal(access, 'mock-ads-token');
  assert.equal(requests, 1);
});

test('OAuth entrypoint selects service-account auth explicitly (no silent refresh fallback)', async () => {
  const mockFetch = async () => ({
    ok: true, status: 200, json: async () => ({access_token: 'short-lived-test-token'})
  });
  assert.equal(await adsAccessToken(env, mockFetch), 'short-lived-test-token');
  await assert.rejects(() => adsAccessToken({
    ADS_SERVICE_ACCOUNT_JSON: json, ADS_OAUTH_CLIENT_ID: 'x',
    ADS_OAUTH_CLIENT_SECRET: 'y', ADS_OAUTH_REFRESH_TOKEN: 'z'
  }, mockFetch), /ADS_AUTH_MODE_INVALID/);
  await assert.rejects(() => adsAccessToken({...env, ADS_AUTH_MODE: 'disabled'}, mockFetch),
    /ADS_AUTH_MODE_INVALID/);
  await assert.rejects(() => adsAccessToken({...env, ADS_SERVICE_ACCOUNT_JSON: undefined}, mockFetch),
    /ADS_SERVICE_ACCOUNT_INVALID/);
});

test('invalid key, token URL, malformed JSON, and malformed JWT material fail closed', async () => {
  const noNetwork = async () => {throw Error('NETWORK_MUST_NOT_BE_CALLED');};
  const broken = value => serviceAccountAccessToken(
    {ADS_SERVICE_ACCOUNT_JSON: value}, {fetcher: noNetwork, cryptoImpl: webcrypto});
  await assert.rejects(() => broken('{wrong'), /ADS_SERVICE_ACCOUNT_INVALID/);
  const value = JSON.parse(json);
  await assert.rejects(() => broken(JSON.stringify({...value,
    token_uri: 'https://other.example/token'})), /ADS_SERVICE_ACCOUNT_INVALID/);
  await assert.rejects(() => broken(JSON.stringify({...value,
    private_key: 'NOT_A_PRIVATE_KEY'})), /ADS_SERVICE_ACCOUNT_INVALID/);
  await assert.rejects(() => broken(JSON.stringify({...value,
    private_key: ['-----BEGIN PRIVATE KEY-----', 'ZmFrZQ==', '-----END PRIVATE KEY-----'].join(String.fromCharCode(10))})),
  /ADS_SERVICE_ACCOUNT_KEY_INVALID/);
});

test('OAuth API error and missing token are sanitized; neither reveals secret data', async () => {
  await assert.rejects(() => serviceAccountAccessToken(env, {cryptoImpl: webcrypto,
    fetcher: async () => ({ok: false, status: 403})}), /ADS_OAUTH_FAILURE_403/);
  await assert.rejects(() => serviceAccountAccessToken(env, {cryptoImpl: webcrypto,
    fetcher: async () => ({ok: true, json: async () => ({error_description: json})})}),
  /ADS_ACCESS_TOKEN_MISSING/);
});

test('signed assertions do not override disabled Ads staging and write gates', () => {
  assert.equal(env.ADS_STAGING_ENABLED, undefined);
  assert.equal(env.ADS_LIVE_ENABLED, undefined);
});
