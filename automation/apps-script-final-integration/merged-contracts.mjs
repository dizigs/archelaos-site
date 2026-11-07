/**
 * Offline composition of the EXISTING merged #218 handoff and #201 relay.
 * Not a Worker route, trigger, Google API adapter, or permission to write.
 * Only a privileged coordinator may construct trusted server-side ports.
 */
import { prepareAppsScriptReceipt } from '../apps-script-brain-handoff/handoff.mjs';
import { relayAppsScriptReceipt } from '../apps-script-brain-relay/src/relay.mjs';
import { IntegrationBlocked, sendReadOnlyReceipt } from './integration.mjs';

const required = ['checkPrivateBinding', 'readBrainReceipt', 'audit'];
const exactInput = input => input && typeof input === 'object' &&
  !Array.isArray(input) && Object.keys(input).length === 2 &&
  Object.hasOwn(input, 'operationId') && Object.hasOwn(input, 'phase');

/**
 * Strict read/backup-only composition; ownership stays with merged #124,
 * #218 and #201. The current Cloudflare bridge has NOT mounted this function.
 * These ports are private, authoritative implementations, NEVER request JSON.
 */
export async function composeMergedReadOnlyHandoff(input, trusted) {
  if (!exactInput(input) || !['read', 'backup'].includes(input.phase)) {
    throw new IntegrationBlocked('READ_ONLY_COMMAND_REQUIRED');
  }
  if (!trusted || required.some(name => typeof trusted[name] !== 'function') ||
      typeof trusted.now !== 'function' || !trusted.editor ||
      !trusted.handoffPorts || !trusted.relayPorts) {
    throw new IntegrationBlocked('MERGED_PRIVATE_PORTS_REQUIRED');
  }
  return sendReadOnlyReceipt(input, {
    isAuthenticatedPrivateBinding: trusted.checkPrivateBinding,
    prepareReceipt: ({ operationId, phase }) => prepareAppsScriptReceipt({
      operationId, phase,
      actor: trusted.actor,
      editor: trusted.editor,
      ports: trusted.handoffPorts,
      now: trusted.now
    }),
    relayReceipt: ({ operationId }) => relayAppsScriptReceipt(
      { operationId }, trusted.relayPorts, trusted.now()
    ),
    readBrainReceipt: trusted.readBrainReceipt,
    audit: trusted.audit
  });
}
