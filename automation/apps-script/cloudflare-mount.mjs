import { configureExistingBridgeScripts } from './configure.mjs';
import { isAppsScriptRequest } from './interface.mjs';
import { ScriptFault } from './security.mjs';

// Inert, fail-closed adapter for the EXISTING Worker. Not a Worker entrypoint,
// migration, deployment, permission grant or invitation to Google consent.
const responseHeaders = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const denied = (code, status = 503) => Response.json({ code }, { status, headers: responseHeaders });

/**
 * Wrap the EXISTING main Worker export, retaining all of its legacy routes.
 * Only explicit Apps Script URLs reach the separately bound SQLite DO.
 * The source maintainer must import this module into the existing Worker
 * and export the wrapped original handler plus MuseumScriptCoordinator.
 * This is not installed or invoked just because this file is in GitHub.
 */
export function withAppsScriptCoordinator(existingWorker) {
  if (typeof existingWorker?.fetch !== 'function') {
    throw new TypeError('EXISTING_WORKER_FETCH_REQUIRED');
  }
  return {
    ...existingWorker,
    async fetch(request, env, ctx) {
      if (!isAppsScriptRequest(request)) {
        return existingWorker.fetch.call(existingWorker, request, env, ctx);
      }
      if (!env?.APPS_SCRIPT_PROJECT_ID || !env?.APPS_SCRIPT_ADMIN_EMAIL) {
        return denied('SCRIPT_PRIVATE_CONFIGURATION_REQUIRED');
      }
      const namespace = env.APPS_SCRIPT_COORDINATOR;
      if (typeof namespace?.idFromName !== 'function' || typeof namespace?.get !== 'function') {
        return denied('ATOMIC_PRIVATE_STORE_REQUIRED');
      }
      try {
        // One project ID -> one SQLite object -> one atomic operation lock.
        const id = namespace.idFromName(env.APPS_SCRIPT_PROJECT_ID);
        const stub = namespace.get(id);
        if (typeof stub?.fetch !== 'function') return denied('ATOMIC_PRIVATE_STORE_REQUIRED');
        return await stub.fetch(request);
      } catch {
        // No underlying Cloudflare/private account error is returned.
        return denied('SCRIPT_COORDINATOR_UNAVAILABLE');
      }
    },
  };
}

/**
 * Optional SQLite-backed DO for that SAME Worker, not another Worker service.
 * The existing bridge must eventually supply a separately verified, signed,
 * narrow executor identity. A global ping/API key is NOT edit authorization.
 * All executor requests fail closed until that reviewed implementation exists.
 * Live Google writes are OFF regardless of request-body claims.
 */
export class MuseumScriptCoordinator {
  constructor(state, env) {
    this.route = configureExistingBridgeScripts({
      env,
      storage: state?.storage,
      authenticateExecutor: async () => {
        throw new ScriptFault('EXECUTOR_INTERFACE_UNCONFIGURED', 503);
      },
      policy: { liveWritesEnabled: false },
    });
  }

  async fetch(request) {
    if (!isAppsScriptRequest(request)) return denied('SCRIPT_ROUTE_NOT_FOUND', 404);
    return (await this.route(request)) ?? denied('SCRIPT_ROUTE_NOT_FOUND', 404);
  }
}
