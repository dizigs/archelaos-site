import { ScriptOAuth } from './oauth.mjs';
import { PrivateCipher, ScriptFault, randomToken, sha256 } from './security.mjs';
import { SqlScriptStore } from './store.mjs';
import { GoogleProjects, ScriptEditor } from './editor.mjs';
import { normalizeFiles } from './files.mjs';
import { SCRIPT_SCOPE } from './security.mjs';
import { appsScriptExtension, isAppsScriptRequest } from './interface.mjs';
import { githubWriter, verifyGithubWriterToken } from './github-writer.mjs';

// Composition for the EXISTING bridge's approved atomic coordinator context.
// It is not a Worker entrypoint, deployment command or secret-copy mechanism.
function initializedExtension({ env, storage, authenticateExecutor, ports = {}, policy = {}, fetchGoogle = fetch, now = Date.now }) {
  const store = new SqlScriptStore(storage, now);
  const cipher = new PrivateCipher(env.OAUTH_STATE_SECRET);
  const oauth = new ScriptOAuth({ config: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, expectedAdminEmail: env.APPS_SCRIPT_ADMIN_EMAIL, origin: 'https://archelaos-automation-bridge.dimitriszgalanis.workers.dev' }, store, cipher, fetchGoogle, now });
  const authorize = async request => {
    if (typeof authenticateExecutor !== 'function') throw new ScriptFault('EXECUTOR_INTERFACE_UNCONFIGURED', 503);
    const actor = await authenticateExecutor(request);
    const grant = await oauth.accessForPrincipal(actor);
    // Granted scopes/principal come from the actual verified Admin grant, not
    // from an engineering-task body or arbitrary ping-key holder's assertion.
    return { ...grant.principal, grantedScopes: grant.grantedScopes, rights: actor.rights };
  };
  const requireGrant = grant => {
    const p = grant?.principal;
    if (p?.verified !== true || p.emailVerified !== true ||
        p.email?.toLowerCase() !== env.APPS_SCRIPT_ADMIN_EMAIL.toLowerCase() ||
        !grant.grantedScopes?.includes(SCRIPT_SCOPE)) throw new ScriptFault('ADMIN_SCOPE_REQUIRED', 403);
    return p;
  };
  return appsScriptExtension({ oauth, authenticateExecutor: authorize,
    // Browser-authenticated status probe. This route does NOT use the executor
    // and cannot return Google tokens or project source. No updates or backups.
    verifyReadOnly: async grant => {
      requireGrant(grant);
      const provider = new GoogleProjects({ projectId: env.APPS_SCRIPT_PROJECT_ID, accessToken: async () => grant.accessToken, fetchGoogle, audit: code => store.audit(crypto.randomUUID(), code) });
      const metadata = await provider.metadata();
      if (metadata?.scriptId !== env.APPS_SCRIPT_PROJECT_ID || metadata.title !== env.APPS_SCRIPT_PROJECT_TITLE) throw new ScriptFault('PROJECT_IDENTITY_MISMATCH', 403);
      const contents = await provider.content();
      if (contents?.scriptId !== env.APPS_SCRIPT_PROJECT_ID) throw new ScriptFault('CONTENT_PROJECT_IDENTITY_MISMATCH', 403);
      const files = normalizeFiles(contents);
      store.audit(crypto.randomUUID(), 'ADMIN_PROJECT_READ_VERIFIED');
      return { status: 'ADMIN_PROJECT_READ_VERIFIED', projectIdentityVerified: true, completeFilesVerified: true, fileCount: files.length, readOnly: true };
    },
    issueBackupConfirmation: async grant => {
      requireGrant(grant);
      const nonce = randomToken();
      store.registerBackupConfirmation(await sha256(nonce), now() + 300000);
      return nonce;
    },
    createVerifiedBackup: async (grant, nonce) => {
      const principal = requireGrant(grant);
      store.consumeBackupConfirmation(await sha256(nonce));
      const actor = { ...principal, grantedScopes: grant.grantedScopes, rights: ['apps-script:read'] };
      const provider = new GoogleProjects({
        projectId: env.APPS_SCRIPT_PROJECT_ID,
        accessToken: async () => grant.accessToken,
        fetchGoogle,
        audit: code => store.audit(crypto.randomUUID(), code)
      });
      const editor = new ScriptEditor({
        projectId: env.APPS_SCRIPT_PROJECT_ID,
        projectTitle: env.APPS_SCRIPT_PROJECT_TITLE,
        expectedAdminEmail: env.APPS_SCRIPT_ADMIN_EMAIL,
        store, provider, cipher,
        policy: { liveWritesEnabled: false }, now
      });
      const result = await editor.backup(actor);
      store.audit(crypto.randomUUID(), 'BROWSER_ENCRYPTED_BACKUP_VERIFIED');
      return { status: result.status, fileCount: result.fileCount, encrypted: true, readbackVerified: true };
    },
    editorFor: async actor => {
    const provider = new GoogleProjects({ projectId: env.APPS_SCRIPT_PROJECT_ID, accessToken: async () => (await oauth.accessForPrincipal(actor)).accessToken, fetchGoogle, audit: code => store.audit(crypto.randomUUID(), code) });
    return new ScriptEditor({ projectId: env.APPS_SCRIPT_PROJECT_ID, projectTitle: env.APPS_SCRIPT_PROJECT_TITLE, expectedAdminEmail: env.APPS_SCRIPT_ADMIN_EMAIL, store, provider, cipher, ports, policy, now });
  } });
}

// Missing new optional bindings must not break existing health/auth/ping routes.
export function configureExistingBridgeScripts(options) {
  let extension;
  return async request => {
    if (!isAppsScriptRequest(request)) return null;
    try {
      extension ||= initializedExtension(options);
      return await extension(request);
    } catch (error) {
      return Response.json({ code: error instanceof ScriptFault ? error.code : 'SCRIPT_CONFIGURATION_UNAVAILABLE' }, { status: error instanceof ScriptFault ? error.status : 503, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
    }
  };
}

// Separate signed write surface. A valid read-only JWT or global bridge key
// does not select an Admin grant or unlock this port. The approved workflow
// commit and independently reviewed command digest come from server code.
export function configureGithubWriter({ env, storage, approvedWorkflowCommit, ports = {}, policy = {}, fetchGoogle = fetch, now = Date.now }) {
  let route;
  return async request => {
    if (!approvedWorkflowCommit || typeof ports.authorizeCommand !== 'function') {
      return Response.json({ code: 'SIGNED_WRITER_PREREQUISITES_UNCONFIGURED' }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }
    try {
      if (!route) {
        const store = new SqlScriptStore(storage, now);
        const cipher = new PrivateCipher(env.OAUTH_STATE_SECRET);
        const oauth = new ScriptOAuth({ config: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, expectedAdminEmail: env.APPS_SCRIPT_ADMIN_EMAIL, origin: 'https://archelaos-automation-bridge.dimitriszgalanis.workers.dev' }, store, cipher, fetchGoogle, now });
        route = githubWriter({ store, now,
          verifyIdentity: token => verifyGithubWriterToken(token, { approvedWorkflowCommit, now }),
          authorizeCommand: ports.authorizeCommand,
          resolveAdmin: async () => {
            const grant = await oauth.accessId(store.singleAdminSession(), true);
            return { ...grant.principal, grantedScopes: grant.grantedScopes, rights: ['apps-script:read', 'apps-script:edit'] };
          },
          editorFor: async actor => new ScriptEditor({
            projectId: env.APPS_SCRIPT_PROJECT_ID, projectTitle: env.APPS_SCRIPT_PROJECT_TITLE,
            expectedAdminEmail: env.APPS_SCRIPT_ADMIN_EMAIL, store, cipher, ports, policy, now,
            provider: new GoogleProjects({ projectId: env.APPS_SCRIPT_PROJECT_ID,
              accessToken: async () => (await oauth.accessForPrincipal(actor)).accessToken,
              fetchGoogle, audit: code => store.audit(crypto.randomUUID(), code) })
          })
        });
      }
      return await route(request);
    } catch (error) {
      return Response.json({ code: error instanceof ScriptFault ? error.code : 'SIGNED_WRITER_UNAVAILABLE' }, { status: error instanceof ScriptFault ? error.status : 503, headers: { 'cache-control': 'no-store' } });
    }
  };
}
