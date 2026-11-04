import { boundedJson, constantEqual, ScriptFault } from './security.mjs';
const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
const json = (data, status = 200) => Response.json(data, { status, headers });

// Chat and email links may attach harmless marketing parameters. They must
// never become input to authorization or Google API calls. Only the read-only
// verification route tolerates a small, strictly bounded tracking allowlist.
function allowedVerificationTracking(url) {
  if (!url.search) return true;
  if (url.search.length > 320) return false;
  const entries = [...url.searchParams];
  if (entries.length < 1 || entries.length > 5) return false;
  const seen = new Set();
  return entries.every(([key, value]) => {
    if (!/^utm_(?:source|medium|campaign|content|term)$/.test(key) || seen.has(key) || !/^[A-Za-z0-9._-]{1,128}$/.test(value)) return false;
    seen.add(key);
    return true;
  });
}

// Mount inside the EXISTING Worker. Returning null delegates every original
// route untouched. No second Worker or unauthenticated edit endpoint is made.
export function isAppsScriptRequest(request) {
  const url = new URL(request.url);
  return (request.method === 'GET' && url.pathname === '/auth/start' && url.searchParams.get('purpose') === 'apps-script')
    || (request.method === 'GET' && url.pathname === '/oauth/callback' && /^as_[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('state') || ''))
    || url.pathname.startsWith('/api/apps-script/');
}
const confirmationCookie = '__Host-archelaos-script-backup-confirm';
const expectedOrigin = 'https://archelaos-automation-bridge.dimitriszgalanis.workers.dev';
function backupConfirmationCookie(header) {
  if (typeof header !== 'string' || header.length > 8192) throw new ScriptFault('BACKUP_CONFIRMATION_REQUIRED', 403);
  const found = header.split(';').map(v => v.trim()).filter(v => v.startsWith(confirmationCookie + '='));
  if (found.length !== 1) throw new ScriptFault('BACKUP_CONFIRMATION_REQUIRED', 403);
  const nonce = found[0].slice(confirmationCookie.length + 1);
  if (!/^[A-Za-z0-9_-]{43}$/.test(nonce)) throw new ScriptFault('BACKUP_CONFIRMATION_REQUIRED', 403);
  return nonce;
}
async function readConfirmationForm(request) {
  const type = request.headers.get('content-type') || '';
  if (!/^application\/x-www-form-urlencoded(?:;\s*charset=utf-8)?$/i.test(type)) throw new ScriptFault('BACKUP_CONFIRMATION_FORM_REQUIRED', 415);
  const announced = Number(request.headers.get('content-length') || 0);
  if (!Number.isFinite(announced) || announced > 512) throw new ScriptFault('BACKUP_FORM_TOO_LARGE', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ScriptFault('BACKUP_CONFIRMATION_FORM_REQUIRED', 415);
  let bytesRead = 0;
  let body = '';
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > 512) throw new ScriptFault('BACKUP_FORM_TOO_LARGE', 413);
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally { await reader.cancel().catch(() => {}); }
  const params = new URLSearchParams(body);
  const values = params.getAll('confirmation');
  if ([...params.keys()].length !== 1 || values.length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(values[0])) throw new ScriptFault('BACKUP_CONFIRMATION_REQUIRED', 403);
  return values[0];
}
function backupConfirmationPage(nonce) {
  const html = '<!doctype html><html lang="el"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ασφαλές αντίγραφο Apps Script</title><main><h1>Ασφαλές αντίγραφο Apps Script</h1><p>Θα δημιουργηθεί κρυπτογραφημένο αντίγραφο στο Cloudflare χωρίς αλλαγές στον κώδικα Google.</p><form method="post" action="/api/apps-script/private-backup"><input type="hidden" name="confirmation" value="' + nonce + '"><button type="submit">Δημιουργία αντιγράφου</button></form></main></html>';
  return new Response(html, { status: 200, headers: {
    ...headers,
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    'x-frame-options': 'DENY',
    'set-cookie': confirmationCookie + '=' + nonce + '; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=300'
  } });
}
export function appsScriptExtension({ oauth, authenticateExecutor, editorFor, verifyReadOnly, issueBackupConfirmation, createVerifiedBackup }) {
  return async request => {
    const url = new URL(request.url);
    const scriptStart = request.method === 'GET' && url.pathname === '/auth/start' && url.searchParams.get('purpose') === 'apps-script';
    const scriptCallback = request.method === 'GET' && url.pathname === '/oauth/callback' && /^as_[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('state') || '');
    const api = url.pathname.startsWith('/api/apps-script/');
    if (!scriptStart && !scriptCallback && !api) return null;
    try {
      if (scriptStart) {
        const begun = await oauth.begin();
        return new Response(null, { status: 302, headers: { ...headers, location: begun.location, 'set-cookie': begun.cookie } });
      }
      if (scriptCallback) {
        const result = await oauth.callback({ state: url.searchParams.get('state'), code: url.searchParams.get('code'), cookieHeader: request.headers.get('cookie') });
        const response = json({ status: result.status, grantedScopes: result.grantedScopes });
        response.headers.append('set-cookie', result.cookie); response.headers.append('set-cookie', result.clearStateCookie); return response;
      }
      // A verified browser session may read only a sanitized project status. It
      // NEVER grants access to editor operations or returns Google source/tokens.
      if (request.method === 'GET' && url.pathname === '/api/apps-script/verify') {
        if (!allowedVerificationTracking(url)) throw new ScriptFault('UNSUPPORTED_SCRIPT_QUERY', 404);
        if (typeof oauth?.access !== 'function' || typeof verifyReadOnly !== 'function') throw new ScriptFault('PRIVATE_READ_VERIFIER_UNCONFIGURED', 503);
        return json(await verifyReadOnly(await oauth.access(request.headers.get('cookie'))));
      }
      // A browser cookie or global ping key alone does NOT grant edit rights.
      // The existing bridge must supply a verified, project-scoped executor port.
      if (typeof authenticateExecutor !== 'function' || typeof editorFor !== 'function') throw new ScriptFault('EXECUTOR_INTERFACE_UNCONFIGURED', 503);
      const actor = await authenticateExecutor(request.clone());
      const editor = await editorFor(actor);
      if (url.search) throw new ScriptFault('UNSUPPORTED_SCRIPT_QUERY', 404);
      if (request.method === 'GET' && url.pathname === '/api/apps-script/content') return json(await editor.read(actor));
      if (request.method === 'GET' && url.pathname.startsWith('/api/apps-script/operations/')) return json(await editor.operation(actor, url.pathname.slice('/api/apps-script/operations/'.length)));
      if (request.method !== 'POST' || !['/api/apps-script/backup', '/api/apps-script/changes', '/api/apps-script/rollback', '/api/apps-script/reconcile'].includes(url.pathname)) throw new ScriptFault('SCRIPT_ROUTE_NOT_FOUND', 404);
      if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || '')) throw new ScriptFault('JSON_REQUIRED', 415);
      const input = await boundedJson(new Response(request.body), 2 * 1024 * 1024);
      if (url.pathname.endsWith('/reconcile')) {
        if (!input || Object.keys(input).length !== 1) throw new ScriptFault('INVALID_RECONCILE_REQUEST', 422);
        return json(await editor.reconcile(actor, input.operationId));
      }
      if (url.pathname.endsWith('/backup')) {
        if (!input || Object.keys(input).length) throw new ScriptFault('EMPTY_BACKUP_REQUEST_REQUIRED', 422);
        return json(await editor.backup(actor));
      }
      return json(url.pathname.endsWith('/rollback') ? await editor.rollback(actor, input) : await editor.edit(actor, input));
    } catch (error) {
      return json({ code: error instanceof ScriptFault ? error.code : 'SCRIPT_INTERFACE_FAILURE' }, error instanceof ScriptFault ? error.status : 503);
    }
  };
}
