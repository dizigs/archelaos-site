/**
 * Optional JSON-secret OAuth adapter preserved from #225 alongside #229's
 * project-pinned PEM adapter. Explicit mode only; never an automatic fallback.
 * The full service-account JSON is a Cloudflare secret, never a repository file.
 */
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ADS_SCOPE = 'https://www.googleapis.com/auth/adwords';
const requireSafe = (value, code) => { if (!value) throw Error(code); };
function base64url(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
function parsePinnedKey(env) {
  const raw = env?.ADS_SERVICE_ACCOUNT_JSON;
  requireSafe(typeof raw === 'string' && raw.length >= 100 && raw.length <= 20000,
    'ADS_SERVICE_ACCOUNT_JSON_INVALID');
  let value;
  try { value = JSON.parse(raw); } catch { throw Error('ADS_SERVICE_ACCOUNT_JSON_INVALID'); }
  const expectedProject = env?.ADS_SERVICE_ACCOUNT_PROJECT_ID;
  const expectedEmail = env?.ADS_SERVICE_ACCOUNT_CLIENT_EMAIL;
  requireSafe(typeof expectedProject === 'string' && /^[a-z][a-z0-9-]{4,62}$/.test(expectedProject) &&
    typeof expectedEmail === 'string' &&
    /^[a-z0-9][a-z0-9-]*@[a-z][a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(expectedEmail) &&
    expectedEmail.endsWith('@' + expectedProject + '.iam.gserviceaccount.com'),
  'ADS_SERVICE_ACCOUNT_IDENTITY_UNVERIFIED');
  requireSafe(value && value.type === 'service_account' &&
    value.project_id === expectedProject &&
    value.client_email === expectedEmail &&
    value.token_uri === TOKEN_URL &&
    typeof value.private_key === 'string',
  'ADS_SERVICE_ACCOUNT_IDENTITY_MISMATCH');
  const match = value.private_key.match(
    /^-----BEGIN PRIVATE KEY-----\s+([A-Za-z0-9+/\s=]+)-----END PRIVATE KEY-----\s*$/
  );
  requireSafe(match && /^[A-Za-z0-9+/]+={0,2}$/.test(match[1].replace(/\s/g, '')),
    'ADS_SERVICE_ACCOUNT_KEY_INVALID');
  return {email: expectedEmail, der64: match[1].replace(/\s/g, '')};
}
export async function serviceAccountJsonToken(env, {
  fetcher = fetch, cryptoImpl = globalThis.crypto, now = () => Date.now()
} = {}) {
  const {email, der64} = parsePinnedKey(env);
  requireSafe(cryptoImpl?.subtle && typeof fetcher === 'function',
    'ADS_SERVICE_ACCOUNT_CRYPTO_UNAVAILABLE');
  const iat = Math.floor(now() / 1000);
  requireSafe(Number.isSafeInteger(iat) && iat > 0, 'ADS_SERVICE_ACCOUNT_TIME_INVALID');
  let key;
  try {
    const der = Uint8Array.from(atob(der64), c => c.charCodeAt(0));
    key = await cryptoImpl.subtle.importKey('pkcs8', der,
      {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['sign']);
  } catch {
    throw Error('ADS_SERVICE_ACCOUNT_KEY_INVALID');
  }
  const header = base64url(JSON.stringify({alg: 'RS256', typ: 'JWT'}));
  const claims = base64url(JSON.stringify({
    iss: email, scope: ADS_SCOPE, aud: TOKEN_URL, iat, exp: iat + 3300
  }));
  const unsigned = header + '.' + claims;
  let signature;
  try {
    signature = await cryptoImpl.subtle.sign('RSASSA-PKCS1-v1_5', key,
      new TextEncoder().encode(unsigned));
  } catch {
    throw Error('ADS_SERVICE_ACCOUNT_SIGN_FAILED');
  }
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: unsigned + '.' + base64url(signature)
  });
  const response = await fetcher(TOKEN_URL, {
    method: 'POST', headers: {'content-type': 'application/x-www-form-urlencoded'},
    body, signal: AbortSignal.timeout(10000)
  });
  if (!response?.ok) throw Error('ADS_SERVICE_ACCOUNT_OAUTH_REJECTED');
  const token = await response.json();
  requireSafe(typeof token?.access_token === 'string' && token.access_token.length > 0 &&
    token.token_type?.toLowerCase() === 'bearer',
    'ADS_SERVICE_ACCOUNT_ACCESS_TOKEN_INVALID');
  return token.access_token;
}
