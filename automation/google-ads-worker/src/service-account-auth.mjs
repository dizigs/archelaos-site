/** Key material is accepted only as a Cloudflare Secret; this module never logs it. */
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ADS_SCOPE = 'https://www.googleapis.com/auth/adwords';
const requireSafe = (condition, code) => { if (!condition) throw Error(code); };
function toBase64Url(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function parseServiceAccount(json) {
  requireSafe(typeof json === 'string' && json.length > 100 && json.length < 20000,
    'ADS_SERVICE_ACCOUNT_INVALID');
  let account;
  try { account = JSON.parse(json); } catch { throw Error('ADS_SERVICE_ACCOUNT_INVALID'); }
  requireSafe(account && account.type === 'service_account' &&
    typeof account.client_email === 'string' &&
    /^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.iam\.gserviceaccount\.com$/.test(account.client_email) &&
    account.token_uri === TOKEN_URL &&
    typeof account.private_key === 'string', 'ADS_SERVICE_ACCOUNT_INVALID');
  const match = account.private_key.match(/^-----BEGIN PRIVATE KEY-----\s+([A-Za-z0-9+/\s=]+)-----END PRIVATE KEY-----\s*$/);
  requireSafe(match && /^[A-Za-z0-9+/=]+$/.test(match[1].replace(/\s/g, '')),
    'ADS_SERVICE_ACCOUNT_INVALID');
  return {email: account.client_email, pemBase64: match[1].replace(/\s/g, '')};
}
/** Signed OAuth 2 JWT bearer assertion with a 55-minute lifetime; no dependencies. */
export async function serviceAccountAccessToken(env, {
  fetcher = fetch, cryptoImpl = globalThis.crypto, now = () => Date.now()
} = {}) {
  const {email, pemBase64} = parseServiceAccount(env?.ADS_SERVICE_ACCOUNT_JSON);
  requireSafe(cryptoImpl?.subtle && typeof fetcher === 'function', 'ADS_CRYPTO_UNAVAILABLE');
  const iat = Math.floor(now() / 1000);
  requireSafe(Number.isSafeInteger(iat) && iat > 0, 'ADS_CLOCK_INVALID');
  let key;
  try {
    const der = Uint8Array.from(atob(pemBase64), character => character.charCodeAt(0));
    key = await cryptoImpl.subtle.importKey('pkcs8', der,
      {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['sign']);
  } catch {
    throw Error('ADS_SERVICE_ACCOUNT_KEY_INVALID');
  }
  const header = toBase64Url(JSON.stringify({alg: 'RS256', typ: 'JWT'}));
  const claims = toBase64Url(JSON.stringify({
    iss: email, scope: ADS_SCOPE, aud: TOKEN_URL, iat, exp: iat + 3300
  }));
  const data = header + '.' + claims;
  let signature;
  try {
    signature = await cryptoImpl.subtle.sign('RSASSA-PKCS1-v1_5', key,
      new TextEncoder().encode(data));
  } catch {
    throw Error('ADS_SERVICE_ACCOUNT_SIGN_FAILED');
  }
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: data + '.' + toBase64Url(signature)
  });
  const response = await fetcher(TOKEN_URL, {method: 'POST',
    headers: {'content-type': 'application/x-www-form-urlencoded'}, body});
  if (!response.ok) throw Error('ADS_OAUTH_FAILURE_' + response.status);
  const result = await response.json();
  requireSafe(typeof result?.access_token === 'string' && result.access_token.length > 0,
    'ADS_ACCESS_TOKEN_MISSING');
  return result.access_token;
}
