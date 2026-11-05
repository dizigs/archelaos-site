/**
 * Read-only, deterministic eligibility check for a *proposed* native Cloudflare
 * Service Binding. Never calls Cloudflare, changes state, or enables delivery.
 */
const TARGET = 'archelaos-brain-staging';
const NAME = 'BRAIN_PRIVATE';
const CALLERS = Object.freeze({
  'archelaos-automation-bridge': Object.freeze(['drive', 'gmail']),
  'archelaos-librarian-staging': Object.freeze(['drive', 'news'])
});
const SHA = /^[a-f0-9]{40}$/;
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;

export function assessBinding({
  caller, callerBindings, brainBindings, deployedBrainSha, approvedBrainSha,
  stagingExpiresAt, now, scopedIdentityApproved = false,
  provenanceApproved = false, durableAuditApproved = false,
  ownerApproved = false
}) {
  if (!Object.hasOwn(CALLERS, caller)) {
    return Object.freeze({ caller, status: 'BLOCKED', blockers: Object.freeze(['CALLER_NOT_APPROVED']), proposedBinding: null });
  }
  const blockers = [];
  const current = Array.isArray(callerBindings) ? callerBindings : null;
  const brain = Array.isArray(brainBindings) ? brainBindings : null;
  if (!current || !brain) blockers.push('INVENTORY_MISSING');
  if (current) {
    const conflicting = current.filter(b => b && b.name === NAME);
    if (conflicting.length && (conflicting.length !== 1 || conflicting[0].type !== 'service' || conflicting[0].service !== TARGET)) {
      blockers.push('BINDING_NAME_CONFLICT');
    }
    if (current.some(b => b?.type === 'service' && b?.service === TARGET && b?.name !== NAME)) {
      blockers.push('UNREVIEWED_EXISTING_BRAIN_BINDING');
    }
  }
  if (!SHA.test(deployedBrainSha || '') || !SHA.test(approvedBrainSha || '') || deployedBrainSha !== approvedBrainSha) {
    blockers.push('BRAIN_SHA_NOT_PINNED');
  }
  if (!ISO.test(stagingExpiresAt || '') || !Number.isFinite(Date.parse(stagingExpiresAt)) ||
      !Number.isFinite(now) || Date.parse(stagingExpiresAt) <= now) {
    blockers.push('STAGING_EXPIRED');
  }
  if (Number.isFinite(now) && Number.isFinite(Date.parse(stagingExpiresAt || '')) &&
      Date.parse(stagingExpiresAt) > now + 60 * 60 * 1000) {
    blockers.push('STAGING_WINDOW_TOO_LONG');
  }
  if (brain && !brain.some(b => b?.name === 'BRAIN' && b?.type === 'durable_object_namespace' && b?.class_name === 'BrainCoordinator')) {
    blockers.push('CANONICAL_DO_MISSING');
  }
  if (brain && !brain.some(b => b?.name === 'STAGING_INTAKE_KEY' && b?.type === 'secret_text')) {
    blockers.push('BRAIN_INTAKE_SECRET_ABSENT');
  }
  if (scopedIdentityApproved !== true) blockers.push('SOURCE_IDENTITY_CONTRACT_UNAPPROVED');
  if (provenanceApproved !== true) blockers.push('SOURCE_PROVENANCE_UNVERIFIED');
  if (durableAuditApproved !== true) blockers.push('DURABLE_AUDIT_UNVERIFIED');
  if (ownerApproved !== true) blockers.push('EXPLICIT_OWNER_APPROVAL_MISSING');
  const present = current?.some(b => b?.name === NAME && b?.type === 'service' && b?.service === TARGET) || false;
  return Object.freeze({
    caller,
    status: blockers.length ? 'BLOCKED' : 'READY_FOR_OWNER_REVIEW',
    // This describes the intended future config only; never a live connection.
    proposedBinding: Object.freeze({ type: 'service', name: NAME, service: TARGET }),
    bindingObserved: present,
    approvedSources: CALLERS[caller],
    blockers: Object.freeze(blockers)
  });
}
