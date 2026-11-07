// Source-only operator preflight for the EXISTING Automation Bridge → Brain
// Apps Script receipt path. Pure/side-effect-free; never configures Cloudflare,
// authorizes a Google write, or claims a live authenticated connection.
const SHA = /^[a-f0-9]{40}$/;
const SOURCE_SCOPE = 'https://www.googleapis.com/auth/script.projects';
const BINDING = Object.freeze({type:'service',name:'BRAIN_PRIVATE',service:'archelaos-brain-staging'});
const secret = (bindings, name) =>
  bindings.some(b => b?.name === name && b?.type === 'secret_text');

export function assessAppsScriptBridgeReadiness(evidence = {}) {
  const failures = [];
  const source = Array.isArray(evidence.bridgeBindings) ? evidence.bridgeBindings : null;
  const target = Array.isArray(evidence.brainBindings) ? evidence.brainBindings : null;
  if (!source || !target) failures.push('CURRENT_BINDING_INVENTORY_MISSING');
  if (source) {
    const links = source.filter(b => b?.name === BINDING.name);
    if (links.length !== 1 || links[0]?.type !== BINDING.type ||
        links[0]?.service !== BINDING.service)
      failures.push('PRIVATE_BRAIN_SERVICE_BINDING_NOT_VERIFIED');
    if (source.some(b => b?.type === 'service' &&
        b?.service === BINDING.service && b?.name !== BINDING.name))
      failures.push('UNREVIEWED_BRAIN_BINDING_ALIAS');
    if (!secret(source,'BRAIN_APPS_SCRIPT_INTAKE_KEY'))
      failures.push('CALLER_APPS_SCRIPT_KEY_MISSING');
    if (!secret(source,'BRAIN_CAPABILITY_RECEIPT_KEY'))
      failures.push('CALLER_RECEIPT_VERIFIER_MISSING');
    // Existing deployed Durable Object / KV / other secret names must survive.
    if (!source.some(b => b?.name === 'APPS_SCRIPT_COORDINATOR' && b?.type === 'durable_object_namespace') ||
        !source.some(b => b?.name === 'AUTH_KV' && b?.type === 'kv_namespace'))
      failures.push('EXISTING_BRIDGE_RESOURCES_NOT_PRESERVED');
  }
  if (target) {
    if (!target.some(b => b?.name === 'BRAIN' && b?.type === 'durable_object_namespace' &&
        b.class_name === 'BrainCoordinator'))
      failures.push('CANONICAL_BRAIN_DO_MISSING');
    if (!secret(target,'BRAIN_APPS_SCRIPT_INTAKE_KEY'))
      failures.push('BRAIN_APPS_SCRIPT_KEY_MISSING');
    if (!secret(target,'BRAIN_CAPABILITY_RECEIPT_KEY'))
      failures.push('BRAIN_RECEIPT_SIGNING_KEY_MISSING');
  }
  if (!SHA.test(evidence.observedBrainConfiguredSha||'') ||
      !SHA.test(evidence.approvedBrainExecutableSha||'') ||
      evidence.observedBrainConfiguredSha !== evidence.approvedBrainExecutableSha ||
      evidence.independentExecutableShaAttested !== true)
    failures.push('BRAIN_EXACT_EXECUTABLE_NOT_ATTESTED');
  const now = evidence.nowMs;
  const expiry = evidence.stagingExpiresAt;
  if (!Number.isSafeInteger(now) || typeof expiry !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(expiry) ||
      !Number.isFinite(Date.parse(expiry)) || Date.parse(expiry) <= now ||
      Date.parse(expiry) > now + 60*60*1000)
    failures.push('STAGING_NOT_TIME_BOUNDED');
  // A literal OAuth scope in deployed source is NOT proof of an active Google grant.
  if (!Array.isArray(evidence.oauthGrantedScopes) ||
      !evidence.oauthGrantedScopes.includes(SOURCE_SCOPE) ||
      evidence.runtimeOAuthGrantVerified !== true)
    failures.push('GOOGLE_RUNTIME_SCOPE_NOT_VERIFIED');
  if (evidence.bridgeSourceMountVerified !== true)
    failures.push('BRIDGE_BRAIN_ADAPTER_NOT_MOUNTED');
  if (evidence.googleProviderReadbackVerified !== true)
    failures.push('APPS_SCRIPT_PROVIDER_PROVENANCE_NOT_VERIFIED');
  if (evidence.durableAuditVerified !== true)
    failures.push('DURABLE_AUDIT_NOT_VERIFIED');
  if (evidence.keysIndependentVerified !== true)
    failures.push('REQUEST_RECEIPT_TRUST_SEPARATION_NOT_VERIFIED');
  if (evidence.brainCapabilityContractAttested !== true)
    failures.push('BRAIN_CAPABILITY_RUNTIME_NOT_ATTESTED');
  if (evidence.liveGoogleWritesDisabledVerified !== true)
    failures.push('GOOGLE_WRITE_LOCK_NOT_ATTESTED');
  if (evidence.bridgeOwnerApproved !== true || evidence.brainOwnerApproved !== true)
    failures.push('OWNERS_APPROVAL_MISSING');
  if (evidence.operatorApproved !== true)
    failures.push('OPERATOR_APPROVAL_MISSING');
  return Object.freeze({
    status: failures.length ? 'BLOCKED' : 'READY_FOR_PRIVATE_STAGING_REVIEW',
    blockers: Object.freeze(failures),
    proposedBinding: BINDING,
    approvalIsNotConnection: true,
    liveConnectionVerified: false,
    liveGoogleWritesAuthorized: false
  });
}
