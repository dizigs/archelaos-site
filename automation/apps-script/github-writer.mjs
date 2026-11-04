import { verifyGithubActionsIdentity } from './github-oidc.mjs';
import { boundedJson, hex, operationId, ScriptFault, sha256 } from './security.mjs';

export const writerAudience = 'archelaos.club:apps-script:write:v1';
export const smokeFile = Object.freeze({ name: 'ArchelaosBridgeSmoke.gs', create: true,
  source: '// Archelaos bridge verification marker.\n// No executable code, scopes, triggers or configuration.\n' });

export function verifyGithubWriterToken(token, { approvedWorkflowCommit, ...options } = {}) {
  if (typeof approvedWorkflowCommit !== 'string' || !/^[0-9a-f]{40}$/.test(approvedWorkflowCommit)) {
    throw new ScriptFault('REVIEWED_WRITER_WORKFLOW_REQUIRED', 503);
  }
  return verifyGithubActionsIdentity(token, { ...options, approvedWorkflowCommit,
    audience: writerAudience, ref: 'refs/heads/main', eventName: 'workflow_dispatch',
    workflow: 'dizigs/archelaos-site/.github/workflows/apps-script-writer.yml@refs/heads/main' });
}

export function validateWriterCommand(input, sourceCommit, now) {
  const common = ['version', 'operationId', 'action', 'sourceCommit', 'expectedBaseHash', 'expiresAt'];
  const allowed = input?.action === 'rollback-smoke' ? [...common, 'restoreOperationId'] : common;
  if (!input || Array.isArray(input) || Object.keys(input).length !== allowed.length ||
      !allowed.every(key => Object.hasOwn(input, key)) || input.version !== 1 ||
      !['create-smoke', 'rollback-smoke'].includes(input.action) ||
      !operationId.test(input.operationId) || !hex.test(input.expectedBaseHash) ||
      input.sourceCommit !== sourceCommit ||
      !Number.isSafeInteger(input.expiresAt) || input.expiresAt <= now || input.expiresAt > now + 300000 ||
      input.action === 'rollback-smoke' && !operationId.test(input.restoreOperationId)) {
    throw new ScriptFault('BOUNDED_WRITER_COMMAND_REQUIRED', 422);
  }
  // Deterministic closed schema; property order cannot change the review digest.
  return Object.fromEntries(allowed.map(key => [key, input[key]]));
}

/** Bounded executor, not a general code runner. Ports are private server code.
 * authorizeCommand must approve this exact digest/source/operation independently
 * of the request. It never accepts a caller's verified/reviewed/safety flags.
 * The existing editor still requires private backup, review, full inventory,
 * external writer exclusion and default-off live policy before any Google PUT.
 */
export function githubWriter({ store, verifyIdentity, authorizeCommand, resolveAdmin, editorFor, now = Date.now }) {
  return async request => {
    try {
      const url = new URL(request.url);
      if (request.method !== 'POST' || url.search || url.pathname !== '/api/apps-script/github-oidc-write') {
        throw new ScriptFault('SCRIPT_ROUTE_NOT_FOUND', 404);
      }
      if ([store, verifyIdentity, authorizeCommand, resolveAdmin, editorFor].some(port => !port)) {
        throw new ScriptFault('SIGNED_WRITER_PREREQUISITES_UNCONFIGURED', 503);
      }
      const raw = request.headers.get('authorization') || '';
      if (!/^Bearer [A-Za-z0-9._-]{200,8192}$/.test(raw)) throw new ScriptFault('GITHUB_OIDC_AUTH_REQUIRED', 401);
      if (request.headers.get('content-type') !== 'application/json') throw new ScriptFault('JSON_COMMAND_REQUIRED', 415);
      const identity = await verifyIdentity(raw.slice(7));
      const input = await boundedJson(new Response(request.body), 2048);
      const command = validateWriterCommand(input, identity.sourceCommit, now());
      const digest = await sha256(JSON.stringify(command));
      if (await authorizeCommand({ digest, sourceCommit: identity.sourceCommit, operationId: command.operationId, action: command.action }) !== true) {
        throw new ScriptFault('IMMUTABLE_COMMAND_APPROVAL_REQUIRED', 403);
      }
      const actor = await resolveAdmin();
      const editor = await editorFor(actor);
      const claimed = store.claimSignedCommand(identity, command, digest);
      if (!claimed.fresh) return receipt(claimed.result || { operationId: command.operationId, status: 'RECONCILIATION_REQUIRED' });
      try {
        const base = { operationId: command.operationId, expectedBaseHash: command.expectedBaseHash };
        let result;
        if (command.action === 'create-smoke') {
          result = await editor.edit(actor, { ...base, changes: [{ ...smokeFile }] });
        } else {
          const originalCommand = store.signedCommand(command.restoreOperationId);
          if (originalCommand?.action !== 'create-smoke' || originalCommand.status !== 'VERIFIED') {
            throw new ScriptFault('VERIFIED_SMOKE_OPERATION_REQUIRED', 409);
          }
          const original = await editor.operation(actor, command.restoreOperationId);
          if (original.status !== 'VERIFIED' || original.result?.headHash !== command.expectedBaseHash) {
            throw new ScriptFault('SMOKE_ROLLBACK_BASE_MISMATCH', 409);
          }
          result = await editor.rollback(actor, { ...base, backupId: original.backupId });
        }
        store.finishSignedCommand(command.operationId, result);
        return receipt(result);
      } catch (error) {
        const code = error instanceof ScriptFault ? error.code : 'PRIVATE_OPERATION_FAILED';
        store.finishSignedCommand(command.operationId, { operationId: command.operationId,
          status: code === 'WRITE_OUTCOME_REQUIRES_RECONCILIATION' ? 'RECONCILIATION_REQUIRED' : 'FAILED', code });
        throw error;
      }
    } catch (error) {
      return Response.json({ code: error instanceof ScriptFault ? error.code : 'SIGNED_WRITER_UNAVAILABLE' },
        { status: error instanceof ScriptFault ? error.status : 503, headers: noStore });
    }
  };
}
const noStore = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
function receipt(result) {
  const safe = Object.fromEntries(['operationId', 'status', 'code', 'beforeHash', 'headHash', 'fileCount'].filter(k => Object.hasOwn(result, k)).map(k => [k, result[k]]));
  return Response.json(safe, { status: result.status === 'VERIFIED' ? 200 : 409, headers: noStore });
}
