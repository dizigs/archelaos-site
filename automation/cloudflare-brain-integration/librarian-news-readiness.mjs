/**
 * Source-only Librarian -> Canonical Brain "news" event preflight.
 *
 * This pure check does NOT install a Service Binding, validate actual provider
 * provenance, or authorize the Librarian to import published news to Notebook.
 * Evidence flags must be independently attested by trusted reviewers; they are
 * not accepted from HTTP request JSON as authorization.
 */
const SHA = /^[a-f0-9]{40}$/;
const TARGET = 'archelaos-brain-staging';
const NAME = 'BRAIN_PRIVATE';
const SOURCE = 'news';
const EVENT_TYPE = 'news.search.completed';
const EXPECTED = Object.freeze({type:'service',name:NAME,service:TARGET});
const hasOne = (bindings, name, type, extra = {}) =>
  bindings.filter(b => b && b.name === name && b.type === type &&
    Object.entries(extra).every(([k,v])=>b[k]===v)).length === 1 &&
  bindings.filter(b => b && b.name === name).length === 1;

export function assessLibrarianNewsReadiness(input = {}) {
  const blockers = [];
  const current = Array.isArray(input.librarianBindings) ? input.librarianBindings : null;
  const brain = Array.isArray(input.brainBindings) ? input.brainBindings : null;

  if (!current || !brain) blockers.push('BINDING_INVENTORY_UNAVAILABLE');
  if (current) {
    if (!hasOne(current,'LEDGER','durable_object_namespace',{class_name:'LibrarianLedger'}))
      blockers.push('EXISTING_LIBRARIAN_LEDGER_NOT_PRESERVED');
    if (!hasOne(current,NAME,'service',{service:TARGET}) ||
        current.some(b=>b?.type==='service' && b.service===TARGET && b.name!==NAME))
      blockers.push('PRIVATE_BRAIN_SERVICE_BINDING_UNVERIFIED');
    if (!hasOne(current,'BRAIN_NEWS_INTAKE_KEY','secret_text'))
      blockers.push('LIBRARIAN_NEWS_PRINCIPAL_KEY_ABSENT');
    if (!hasOne(current,'BRAIN_CAPABILITY_RECEIPT_KEY','secret_text'))
      blockers.push('LIBRARIAN_RECEIPT_VERIFIER_ABSENT');
    // This phase is review-only. Source-event reporting must never turn on
    // Notebook imports, OCR or private Drive URL probing.
    for (const flag of ['NEWS_IMPORT_ENABLED','ARCHIVE_IMPORT_ENABLED','DRIVE_LINK_PROBE_ENABLED']) {
      if (!hasOne(current,flag,'plain_text',{text:'false'}))
        blockers.push(flag + '_MUST_STAY_DISABLED');
    }
  }
  if (brain) {
    if (!hasOne(brain,'BRAIN','durable_object_namespace',{class_name:'BrainCoordinator'}))
      blockers.push('CANONICAL_BRAIN_DO_MISSING');
    if (!hasOne(brain,'BRAIN_NEWS_INTAKE_KEY','secret_text'))
      blockers.push('BRAIN_NEWS_PRINCIPAL_KEY_ABSENT');
    if (!hasOne(brain,'BRAIN_CAPABILITY_RECEIPT_KEY','secret_text'))
      blockers.push('BRAIN_RECEIPT_SIGNER_ABSENT');
  }
  if (!SHA.test(input.observedBrainSha||'') ||
      !SHA.test(input.approvedBrainSha||'') ||
      input.observedBrainSha !== input.approvedBrainSha ||
      input.executableBytesIndependentlyAttested !== true)
    blockers.push('BRAIN_EXACT_DEPLOYED_VERSION_UNVERIFIED');
  const now = input.nowMs, expires = input.stagingExpiresAt;
  if (!Number.isSafeInteger(now) || typeof expires !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(expires) ||
      !Number.isFinite(Date.parse(expires)) ||
      Date.parse(expires)<=now || Date.parse(expires)>now+3600000)
    blockers.push('PRIVATE_STAGING_EXPIRED_OR_UNBOUNDED');

  // Independent, trusted proofs — NOT just a presence of env bindings or
  // an API response reflecting a caller-controlled "verified" Boolean.
  if (input.currentLibrarianSourceMounted !== true)
    blockers.push('LIBRARIAN_SOURCE_CONTRACT_NOT_MOUNTED');
  if (input.authenticatedNewsSourceAttested !== true ||
      input.newsEventContract !== EVENT_TYPE ||
      input.sourcePrincipal !== SOURCE+'-v1')
    blockers.push('NEWS_SOURCE_EVENT_PROVENANCE_UNVERIFIED');
  if (input.librarianDurableAuditAttested !== true)
    blockers.push('LIBRARIAN_DURABLE_AUDIT_UNVERIFIED');
  if (input.brainSignedReceiptAndReadbackAttested !== true)
    blockers.push('BRAIN_SIGNED_NEWS_READBACK_UNVERIFIED');
  if (input.requestAndReceiptKeysDistinctAttested !== true)
    blockers.push('HMAC_TRUST_DOMAINS_UNVERIFIED');
  if (input.noPublicFallbackAttested !== true)
    blockers.push('PRIVATE_TRANSPORT_ONLY_NOT_ATTESTED');
  if (input.noProviderWritesOrNotebookImportsAttested !== true)
    blockers.push('REVIEW_ONLY_SIDE_EFFECTS_NOT_ATTESTED');
  if (input.librarianOwnerApproved !== true || input.brainOwnerApproved !== true ||
      input.releaseOperatorApproved !== true)
    blockers.push('RELEASE_APPROVAL_MISSING');

  return Object.freeze({
    status: blockers.length ? 'BLOCKED' : 'READY_FOR_OWNER_STAGING_REVIEW',
    blockers: Object.freeze(blockers),
    scope: Object.freeze({caller:'archelaos-librarian-staging',source:SOURCE,eventType:EVENT_TYPE}),
    proposedBinding: EXPECTED,
    connected: false,
    authenticatedE2EVerified: false,
    privatePdfReadAuthorized: false,
    notebookWriteAuthorized: false,
    liveImportEnabled: false
  });
}
