import { boundedJson, ScriptFault } from './security.mjs';
const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
const json = (data, status = 200) => Response.json(data, { status, headers });

// Mount inside the EXISTING Worker. Returning null delegates every original
// route untouched. No second Worker or unauthenticated edit endpoint is made.
export function isAppsScriptRequest(request) {
  const url = new URL(request.url);
  return (request.method === 'GET' && url.pathname === '/auth/start' && url.searchParams.get('purpose') === 'apps-script')
    || (request.method === 'GET' && url.pathname === '/oauth/callback' && /^as_[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('state') || ''))
    || url.pathname.startsWith('/api/apps-script/');
}
export function appsScriptExtension({ oauth, authenticateExecutor, editorFor }) {
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
