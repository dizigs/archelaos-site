// Read-only GAS→Brain compatibility gate. No Google API, secrets, writes, or dispatch.
// The canonical Brain currently accepts only six source types and requires a
// nine-field envelope with opaque SHA-256 identifiers and blob metadata.
import { validateEvent, Rejected } from '../../brain/src/contract.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEX = /^[0-9a-f]{64}$/;

export function inspectAppsScriptIntake({ event, proof, now = Date.now() } = {}) {
  // This gate must never grant authorization: only the canonical Brain can.
  if (!proof || proof.provider !== 'google-apps-script' ||
      proof.identityVerified !== true || proof.sourceHashVerified !== true ||
      proof.encryptedBackupVerified !== true || proof.writerExclusionVerified !== true ||
      proof.triggerInventoryVerified !== true || proof.signedApprovalVerified !== true) {
    return { ready: false, reason: 'GAS_PROOF_INCOMPLETE' };
  }
  if (!event || typeof event !== 'object' || Array.isArray(event) ||
      !UUID.test(event.eventId ?? '') || !UUID.test(event.correlationId ?? '') ||
      !HEX.test(event.sourceId ?? '') || !HEX.test(event.sourceRevision ?? '')) {
    return { ready: false, reason: 'INVALID_OPAQUE_IDENTIFIERS' };
  }
  if (event.sourceType !== 'apps_script') {
    return { ready: false, reason: 'SOURCE_MISMATCH' };
  }
  try {
    validateEvent(event, 'apps_script', now);
  } catch (error) {
    if (error instanceof Rejected) return { ready: false, reason: error.code };
    throw error;
  }
  return { ready: false, reason: 'CANONICAL_BRAIN_AUTHORIZATION_REQUIRED' };
}
