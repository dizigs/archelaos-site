/**
 * Read-only staging gate for the TWO EXISTING Brain ↔ Self-Heal Workers.
 * No Cloudflare requests, secrets, deployment, trigger, or bound RPC execution.
 * READY_FOR_STAGING_REVIEW means only that the supplied METADATA + independent
 * operator attestations passed; it never means CONNECTED or TESTED.
 */
const BRAIN = 'archelaos-brain-staging';
const HEALER = 'archelaos-self-heal';
const SHA = /^[a-f0-9]{40}$/;
const TTL = 60 * 60_000;

export const REQUIRED_PRIVATE_LINKS = Object.freeze({
  selfHealToBrain: Object.freeze({
    name: 'BRAIN_RECOVERY', type: 'service', service: BRAIN,
    entrypoint: 'BrainRecoveryPort'
  }),
  brainToSelfHeal: Object.freeze({
    name: 'HEALER', type: 'service', service: HEALER
  })
});

const strictBinding = (bindings, expected) => {
  const matched = bindings.filter(b => b?.name === expected.name);
  if (matched.length === 0) return 'ABSENT';
  if (matched.length !== 1) return 'CONFLICT';
  const b = matched[0];
  if (b.type !== 'service' || b.service !== expected.service) return 'CONFLICT';
  // Both approved target scripts use their standalone default environment.
  // An explicit environment can redirect the binding to another deployment.
  if (b.environment != null && b.environment !== '') return 'CONFLICT';
  if (Object.hasOwn(expected, 'entrypoint')) {
    if (b.entrypoint !== expected.entrypoint) return 'CONFLICT';
  } else if (b.entrypoint != null && b.entrypoint !== 'default') {
    return 'CONFLICT';
  }
  return 'PRESENT';
};
const one = (items, name, type) => {
  const matched = items.filter(b => b?.name === name);
  return matched.length === 1 && matched[0].type === type;
};
const plain = (items, name) => {
  const found = items.filter(b => b?.name === name);
  return found.length === 1 && found[0]?.type === 'plain_text' ? found[0].text : undefined;
};
const hasSecret = (items, name) => one(items, name, 'secret_text');
const isNonzeroSha = sha => typeof sha === 'string' && SHA.test(sha) && sha !== '0'.repeat(40);

export function assessSelfHealStagingBindings(input) {
  const data = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const blockers = [];
  const deny = code => { if (!blockers.includes(code)) blockers.push(code); };
  const brainBindings = Array.isArray(data.brainBindings) ? data.brainBindings : null;
  const healerBindings = Array.isArray(data.healerBindings) ? data.healerBindings : null;
  if (!brainBindings || !healerBindings) deny('LIVE_BINDING_INVENTORY_REQUIRED');
  const brain = brainBindings || [], healer = healerBindings || [];

  if (!one(brain, 'BRAIN', 'durable_object_namespace') ||
      brain.find(b => b?.name === 'BRAIN')?.class_name !== 'BrainCoordinator')
    deny('CANONICAL_BRAIN_DO_UNVERIFIED');
  if (!one(healer, 'HEALER_MEMORY', 'durable_object_namespace') ||
      healer.find(b => b?.name === 'HEALER_MEMORY')?.class_name !== 'HealerMemory')
    deny('EXISTING_HEALER_DO_UNVERIFIED');

  const forward = strictBinding(brain, REQUIRED_PRIVATE_LINKS.brainToSelfHeal);
  const back = strictBinding(healer, REQUIRED_PRIVATE_LINKS.selfHealToBrain);
  if (forward === 'ABSENT') deny('BRAIN_HEALER_BINDING_MISSING');
  if (forward === 'CONFLICT') deny('BRAIN_HEALER_BINDING_CONFLICT');
  if (back === 'ABSENT') deny('HEALER_BRAIN_RECOVERY_BINDING_MISSING');
  if (back === 'CONFLICT') deny('HEALER_BRAIN_RECOVERY_BINDING_CONFLICT');

  if (!hasSecret(brain, 'HEALER_EVENT_HMAC_KEY') ||
      !hasSecret(healer, 'HEALER_EVENT_HMAC_KEY'))
    deny('SIGNED_DELIVERY_KEY_METADATA_MISSING');
  if (!hasSecret(brain, 'BRAIN_GITHUB_READ_TOKEN'))
    deny('PROVIDER_EVIDENCE_KEY_METADATA_MISSING');
  if (plain(brain, 'BRAIN_SELFHEAL_RECOVERY_ENABLED') !== 'true' ||
      plain(brain, 'BRAIN_SELFHEAL_BINDING_ATTESTED') !== 'true')
    deny('BRAIN_RECOVERY_GATES_DISABLED');
  if (plain(brain, 'ENVIRONMENT') !== 'staging') deny('STAGING_ENVIRONMENT_UNVERIFIED');

  const approved = plain(brain, 'BRAIN_SELFHEAL_APPROVED_SHA');
  const deployed = plain(brain, 'DEPLOY_SHA');
  if (!isNonzeroSha(approved) || approved !== deployed ||
      !isNonzeroSha(data.attestedBrainSha) || approved !== data.attestedBrainSha)
    deny('EXACT_RELEASE_PROVENANCE_UNVERIFIED');

  const now = data.now;
  const expire = plain(brain, 'STAGING_EXPIRES_AT');
  const expiresMs = typeof expire === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(expire)
    ? Date.parse(expire) : Number.NaN;
  if (!Number.isSafeInteger(now) || !Number.isFinite(expiresMs) ||
      expiresMs <= now || expiresMs > now + TTL)
    deny('BOUNDED_STAGING_EXPIRY_UNVERIFIED');

  if (data.brainSourceBytesAttested !== true || data.healerSourceBytesAttested !== true)
    deny('DEPLOYED_EXECUTABLE_BYTES_UNATTESTED');
  if (data.brainOwnerApproved !== true || data.healerOwnerApproved !== true ||
      data.cloudflareOperatorApproved !== true) deny('REQUIRED_OWNERS_NOT_APPROVED');
  if (data.recoveryContractReviewed !== true ||
      data.providerEvidenceScopeReviewed !== true ||
      data.sameSealedHmacVerified !== true) deny('RECOVERY_TRUST_CHAIN_UNVERIFIED');
  if (data.aiDisabledVerified !== true || data.repairWritesDisabledVerified !== true ||
      data.rollbackProved !== true) deny('FAIL_CLOSED_AND_ROLLBACK_UNVERIFIED');
  // "No public routes" alone does NOT prove privacy: Workers.dev, preview
  // URLs and custom Worker domains have independent exposure controls.
  // Unknown/readback-unavailable values also fail closed.
  if (data.brainWorkersDevEnabled !== false || data.healerWorkersDevEnabled !== false ||
      data.brainPreviewUrlsEnabled !== false || data.healerPreviewUrlsEnabled !== false)
    deny('PRIVATE_SUBDOMAIN_AND_PREVIEW_READBACK_UNVERIFIED');
  if (data.brainPublicRoutes !== 0 || data.healerPublicRoutes !== 0 ||
      data.brainWorkerDomains !== 0 || data.healerWorkerDomains !== 0 ||
      data.brainCronTriggers !== 0 || data.healerCronTriggers !== 0)
    deny('PRIVATE_ONLY_NO_SCHEDULE_INVENTORY_UNVERIFIED');

  return Object.freeze({
    status: blockers.length ? 'BLOCKED' : 'READY_FOR_STAGING_REVIEW',
    verifiedConnectivity: false,
    e2eProved: false,
    automationEnabled: false,
    readonlyPlannedBindings: REQUIRED_PRIVATE_LINKS,
    blockers: Object.freeze(blockers)
  });
}
