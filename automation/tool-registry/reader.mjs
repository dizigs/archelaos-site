// Private, metadata-only Google Docs -> Cloudflare service-binding reader.
// Must be exported as a *named* WorkerEntrypoint by the existing bridge.
// This module never grants access to the tools described by the registry.
const START = 'ARCHELAOS_WORKER_REGISTRY_V1_BEGIN';
const END = 'ARCHELAOS_WORKER_REGISTRY_V1_END';
const DOC_SCOPE = 'https://www.googleapis.com/auth/documents.readonly';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const DOCS_PREFIX = 'https://docs.googleapis.com/v1/documents/';
const ALLOWED_STATES = new Set(['verified', 'available', 'reported', 'planned', 'disabled']);
const ALLOWED_ACCESS = new Set(['admin_verified', 'write_verified', 'read_verified', 'read_reported', 'write_reported', 'available_unchecked', 'none', 'unknown']);
const ALLOWED_FAMILIES = new Set(['chatgpt', 'cloudflare', 'github_app', 'google', 'service', 'security', 'analytics', 'automation']);

export class RegistryFault extends Error {
  constructor(code) { super(code); this.name = 'RegistryFault'; }
}
function reject(code) { throw new RegistryFault(code); }
function base64url(bytes) {
  let s = '';
  for (const c of bytes) s += String.fromCharCode(c);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function utf8(s) { return new TextEncoder().encode(s); }
function stringField(v, max = 160) {
  return typeof v === 'string' && v.length > 0 && v.length <= max &&
    !/[\r\n\x00-\x1f]/.test(v) && !/\b(?:secret|password|private.key|bearer)\s*[:=]/i.test(v);
}

/** Strictly parse a designated machine-readable block, never the private free-form history. */
export function parseWorkerFeed(text) {
  if (typeof text !== 'string' || text.length > 512_000) reject('REGISTRY_DOCUMENT_SIZE_INVALID');
  const start = text.indexOf(START), end = text.indexOf(END);
  if (start < 0 || end < 0 || end <= start || text.lastIndexOf(START) !== start || text.lastIndexOf(END) !== end) reject('REGISTRY_FEED_MARKERS_INVALID');
  const fragment = text.slice(start + START.length, end).trim();
  if (!fragment || fragment.length > 60_000) reject('REGISTRY_FEED_SIZE_INVALID');
  let parsed;
  try { parsed = JSON.parse(fragment); } catch { reject('REGISTRY_FEED_JSON_INVALID'); }
  if (!parsed || Array.isArray(parsed) || parsed.schema_version !== 1 ||
      !/^20\d\d-\d\d-\d\d$/.test(parsed.updated_at) ||
      !Array.isArray(parsed.tools) || !parsed.tools.length || parsed.tools.length > 150 ||
      Object.keys(parsed).sort().join(',') !== 'schema_version,tools,updated_at') reject('REGISTRY_SCHEMA_INVALID');
  const seen = new Set();
  const tools = parsed.tools.map(t => {
    if (!t || typeof t !== 'object' || Array.isArray(t) ||
        Object.keys(t).sort().join(',') !== 'access,family,id,name,state,use_when' ||
        typeof t.id !== 'string' || !/^[a-z][a-z0-9-]{1,59}$/.test(t.id) || seen.has(t.id) ||
        !stringField(t.name, 100) || !stringField(t.use_when, 220) ||
        !ALLOWED_STATES.has(t.state) || !ALLOWED_ACCESS.has(t.access) || !ALLOWED_FAMILIES.has(t.family) ||
        (t.state === 'disabled' && t.access !== 'none')) reject('REGISTRY_ENTRY_INVALID');
    seen.add(t.id);
    // This is metadata, never authorization or source of credentials.
    return Object.freeze({ id: t.id, name: t.name, family: t.family, state: t.state, access: t.access, use_when: t.use_when });
  });
  return Object.freeze({ schema_version: 1, updated_at: parsed.updated_at, authorization: 'metadata_only', tools });
}
function paragraphText(body) {
  if (!body || !Array.isArray(body.content)) return '';
  return body.content.map(c => (c.paragraph?.elements || []).map(e => e.textRun?.content || '').join('')).join('');
}
export function textFromDocsResponse(doc) {
  if (!doc || typeof doc !== 'object') reject('REGISTRY_DOCS_PAYLOAD_INVALID');
  if (!Array.isArray(doc.tabs) || !doc.tabs.length) return paragraphText(doc.body);
  const flatten = tabs => tabs.map(tab => paragraphText(tab.documentTab?.body) + flatten(tab.childTabs || [])).join('');
  return flatten(doc.tabs);
}

/** OAuth service account, granted Viewer on only the registry Doc. No domain-wide delegation. */
export async function makeSignedAssertion(credentials, now = Date.now(), subtle = crypto.subtle) {
  if (!credentials || typeof credentials.client_email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(credentials.client_email) ||
      typeof credentials.private_key !== 'string' ||
      !credentials.private_key.includes('BEGIN PRIVATE KEY')) reject('REGISTRY_SERVICE_ACCOUNT_INVALID');
  const pem = credentials.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  let key;
  try {
    const der = Uint8Array.from(atob(pem), ch => ch.charCodeAt(0));
    key = await subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  } catch { reject('REGISTRY_PRIVATE_KEY_INVALID'); }
  const iat = Math.floor(now / 1000);
  const header = base64url(utf8(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claim = base64url(utf8(JSON.stringify({ iss: credentials.client_email, scope: DOC_SCOPE, aud: TOKEN_ENDPOINT, iat, exp: iat + 3600 })));
  const message = `${header}.${claim}`;
  const sig = new Uint8Array(await subtle.sign('RSASSA-PKCS1-v1_5', key, utf8(message)));
  return `${message}.${base64url(sig)}`;
}

export function createRegistryReader({ request = fetch, now = () => Date.now() } = {}) {
  let cachedToken = null;
  let inflightToken = null;
  async function token(credentials) {
    if (cachedToken && cachedToken.until > now() + 60_000 && cachedToken.email === credentials.client_email) return cachedToken.value;
    if (inflightToken) return inflightToken;
    inflightToken = (async () => {
      const assertion = await makeSignedAssertion(credentials, now());
      const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion });
      const res = await request(TOKEN_ENDPOINT, { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
      if (!res.ok) reject('REGISTRY_GOOGLE_AUTH_FAILED');
      const payload = await res.json();
      if (!payload || typeof payload.access_token !== 'string' || payload.access_token.length < 12 ||
          !Number.isFinite(Number(payload.expires_in))) reject('REGISTRY_GOOGLE_AUTH_INVALID');
      cachedToken = { email: credentials.client_email, value: payload.access_token, until: now() + Math.min(3600, Number(payload.expires_in)) * 1000 };
      return cachedToken.value;
    })();
    try { return await inflightToken; } finally { inflightToken = null; }
  }
  return async function readRegistry(env) {
    if (!env || !/^[A-Za-z0-9_-]{25,100}$/.test(env.REGISTRY_DOCUMENT_ID || '')) reject('REGISTRY_DOC_ID_MISSING');
    let credentials;
    try { credentials = JSON.parse(env.REGISTRY_GOOGLE_SERVICE_ACCOUNT || ''); }
    catch { reject('REGISTRY_SERVICE_ACCOUNT_MISSING'); }
    const accessToken = await token(credentials);
    const res = await request(`${DOCS_PREFIX}${env.REGISTRY_DOCUMENT_ID}?includeTabsContent=true`, {
      method: 'GET', headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
    });
    if (!res.ok) reject('REGISTRY_DOCS_READ_FAILED');
    if (Number(res.headers?.get?.('content-length') || 0) > 1_000_000) reject('REGISTRY_DOCS_SIZE_INVALID');
    const body = await res.text();
    if (body.length > 1_000_000) reject('REGISTRY_DOCS_SIZE_INVALID');
    let doc;
    try { doc = JSON.parse(body); } catch { reject('REGISTRY_DOCS_PAYLOAD_INVALID'); }
    return parseWorkerFeed(textFromDocsResponse(doc));
  };
}
