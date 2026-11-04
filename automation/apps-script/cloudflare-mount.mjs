import { configureExistingBridgeScripts, configureGithubWriter } from './configure.mjs';
import { isAppsScriptRequest } from './interface.mjs';
import { ScriptFault } from './security.mjs';
import { SqlScriptStore } from './store.mjs';
import { verifyGithubProbeToken } from './github-oidc.mjs';

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
  constructor(state, env, options = {}) {
    this.storage = state?.storage;
    this.verifyGithubIdentity = options.verifyGithubIdentity || verifyGithubProbeToken;
    // Default has no trusted workflow/digest/safety ports, so remains OFF.
    // These options are maintainer-owned code, never parsed from HTTP/env JSON.
    this.writerRoute = configureGithubWriter({ ...options.writer, env, storage: state?.storage });
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
    const url = new URL(request.url);
    if (url.pathname === '/api/apps-script/github-oidc-write') return this.writerRoute(request);
    if (url.pathname === '/api/apps-script/github-oidc-probe') {
      // Outer Worker -> Durable Object forwarding can materialize an empty
      // POST body stream. The body is never interpreted as a command: signed
      // identity claims provide the only authority for this read-only probe.
      if (request.method !== 'POST' || url.search) {
        return denied('SCRIPT_ROUTE_NOT_FOUND', 404);
      }
      const declaredLength = request.headers.get('content-length');
      if (declaredLength !== null && (!/^\d{1,3}$/.test(declaredLength) || Number(declaredLength) > 128)) {
        return denied('GITHUB_OIDC_BODY_NOT_ACCEPTED', 413);
      }
      try {
        const raw = request.headers.get('authorization') || '';
        if (!/^Bearer [A-Za-z0-9._-]{200,8192}$/.test(raw)) {
          return denied('GITHUB_OIDC_AUTH_REQUIRED', 401);
        }
        const verified = await this.verifyGithubIdentity(raw.slice(7));
        const store = new SqlScriptStore(this.storage);
        const result = store.recordGithubSignedReadiness(verified.runKey, verified.tokenHash, verified.sourceCommit);
        return Response.json(result, { status: 200, headers: responseHeaders });
      } catch (error) {
        return denied(error instanceof ScriptFault ? error.code : 'GITHUB_OIDC_AUTH_REQUIRED',
          error instanceof ScriptFault ? error.status : 401);
      }
    }
    if (url.pathname === '/api/apps-script/operator-probe') {
      if (request.method !== 'GET' || url.search) return denied('SCRIPT_ROUTE_NOT_FOUND', 404);
      try {
        const store = new SqlScriptStore(this.storage);
        const id = store.claimOperatorProbe();
        if (id) store.completeOperatorProbe(id);
        return Response.json({ status: id ? 'OPERATOR_PROBE_ACCEPTED' : 'OPERATOR_QUEUE_EMPTY', readOnly: true }, { headers: responseHeaders });
      } catch {
        // Fail closed, never return SQL, OAuth, ciphertext or private project ID.
        return denied('OPERATOR_READONLY_PROBE_UNAVAILABLE');
      }
    }
    return (await this.route(request)) ?? denied('SCRIPT_ROUTE_NOT_FOUND', 404);
  }
}
