/**
 * Fail-closed read-only Apps Script -> Brain integration seam.
 * NOT an HTTP route, Worker, scheduler, Google writer or approval.
 * After merging #218 and #201, trusted runtime code may inject their
 * existing handoff/relay functions. Never accept ports from request JSON.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEX = /^[0-9a-f]{64}$/;
const BRAIN_READBACK_FIELDS = ['eventId', 'correlationId', 'receiptId', 'source',
  'sourceRevision', 'transport', 'status', 'durable'];
const REQUIRED_SCOPE = 'https://www.googleapis.com/auth/script.projects';
const ENTRIES = ['readControls', 'readGrantProof', 'readSourceProof', 'readBackupProof',
  'readTriggerProof', 'readWriterProof', 'readAuthorizationProof',
  'readRollbackProof', 'readBrainProof'];

export class IntegrationBlocked extends Error {
  constructor(code) { super(code); this.code = code; }
}
const stop = code => { throw new IntegrationBlocked(code); };
const verified = x => x?.verified === true && x?.origin === 'TRUSTED_PRIVATE_STORE';
const sameProject = (x, projectFingerprint) => x?.projectFingerprint === projectFingerprint;
const digest = x => typeof x === 'string' && HEX.test(x);
const fresh = (x, now, safetyMs = 0) => Number.isSafeInteger(x?.expiresAt) && x.expiresAt > now + safetyMs;
// Every runtime observation used for readiness must be recent, not a stale CI fixture.
const observed = (x, now, maxAgeMs = 300000) => Number.isSafeInteger(x?.observedAtMs) &&
  x.observedAtMs <= now && x.observedAtMs >= now - maxAgeMs;

/** Read-only status evidence. Never emits source code, IDs, tokens, URLs or approval signatures. */
export async function inspectIntegration({ projectFingerprint, now = Date.now() }, ports) {
  if (!digest(projectFingerprint) || !Number.isSafeInteger(now) || !ports ||
      ENTRIES.some(k => typeof ports[k] !== 'function'))
    stop('PRIVATE_PROJECT_OR_PROBES_REQUIRED');
  let evidence;
  try {
    // Fail closed if ANY trusted private probe fails. No mutation ports accepted.
    evidence = await Promise.all(ENTRIES.map(k => ports[k]()));
  } catch { return { status: 'BLOCKED', read: 'NOT_VERIFIED', write: 'BLOCKED', brain: 'BLOCKED', blockers: ['PRIVATE_PROBE_UNAVAILABLE'] }; }
  const [control, grant, source, backup, trigger, writer, auth, rollback, brain] = evidence;
  const blockers = [];
  if (!verified(control) || !sameProject(control, projectFingerprint) || !observed(control, now) || control.paused !== false ||
    control.liveWritesEnabled !== false) blockers.push('CONTROLS_NOT_SAFE');
  if (!verified(grant) || !sameProject(grant, projectFingerprint) || !Array.isArray(grant.scopes) ||
    !grant.scopes.includes(REQUIRED_SCOPE) || grant.adminIdentityVerified !== true ||
    !observed(grant, now) || !fresh(grant, now))
    blockers.push('ADMIN_SCOPE_NOT_VERIFIED');
  if (!verified(source) || !sameProject(source, projectFingerprint) ||
    !digest(source.sourceHash) || !Number.isInteger(source.fileCount) || source.fileCount < 1 ||
    source.metadataVerified !== true || !observed(source, now)) blockers.push('SOURCE_NOT_VERIFIED');
  const read = blockers.length === 0 ? 'READ_VERIFIED' : 'NOT_VERIFIED';
  if (!verified(backup) || !sameProject(backup, projectFingerprint) ||
    backup.encrypted !== true || backup.readbackVerified !== true ||
    backup.immutable !== true || !digest(backup.sourceHash) || backup.sourceHash !== source?.sourceHash ||
    !observed(backup, now))
    blockers.push('BACKUP_NOT_VERIFIED');
  // Google's Projects API cannot prove installable triggers across accounts.
  if (!verified(trigger) || !sameProject(trigger, projectFingerprint) ||
    trigger.completeAcrossAccounts !== true || !digest(trigger.fingerprint) || !observed(trigger, now))
    blockers.push('TRIGGERS_NOT_VERIFIED');
  // Google updateContent is not CAS; advisory SQLite locking is insufficient.
  if (!verified(writer) || !sameProject(writer, projectFingerprint) ||
    writer.coversExternalIdeAndApiWriters !== true || !observed(writer, now) ||
    !fresh(writer, now, 30000))
    blockers.push('EXTERNAL_WRITERS_NOT_EXCLUDED');
  if (!verified(auth) || !sameProject(auth, projectFingerprint) ||
    auth.independentApproval !== true || auth.projectScoped !== true ||
    auth.signedCommandDigestVerified !== true || auth.selfApproved === true ||
    !digest(auth.baseSourceHash) || auth.baseSourceHash !== source?.sourceHash ||
    !observed(auth, now) || !fresh(auth, now))
    blockers.push('SIGNED_SCOPED_AUTH_NOT_VERIFIED');
  if (!verified(rollback) || !sameProject(rollback, projectFingerprint) ||
    rollback.readbackVerified !== true || rollback.fullManifestPreserved !== true ||
    rollback.triggerFingerprint !== trigger?.fingerprint ||
    rollback.writeOutcome !== 'RESTORED_AND_VERIFIED' ||
    !digest(rollback.restoredSourceHash) || rollback.restoredSourceHash !== source?.sourceHash ||
    !observed(rollback, now) || !fresh(rollback, now))
    blockers.push('ROLLBACK_NOT_VERIFIED');
  if (!verified(brain) || !sameProject(brain, projectFingerprint) ||
    brain.transport !== 'PRIVATE_SERVICE_BINDING' ||
    brain.source !== 'apps_script' || brain.status !== 'ACCEPTING' ||
    brain.authenticated !== true || !digest(brain.deploymentDigest) || !observed(brain, now))
    blockers.push('BRAIN_PRIVATE_INTAKE_NOT_VERIFIED');
  const write = blockers.length === 0 ? 'WRITE_READY_NOT_AUTHORIZED' : 'BLOCKED';
  return { status: blockers.length ? 'BLOCKED' : 'ALL_PREFLIGHT_EVIDENCE_PRESENT',
    read, write, brain: blockers.includes('BRAIN_PRIVATE_INTAKE_NOT_VERIFIED') ? 'BLOCKED' : 'CONTRACT_VERIFIED', blockers };
}

/**
 * Trusted read/backup-only receipt composition. Existing #124/#218/#201
 * implementations are provided by the coordinator, never by public callers.
 * No edit, Google PUT, rollback, trigger changes or scheduler.
 */
export async function sendReadOnlyReceipt({ operationId, phase }, ports) {
  if (!UUID.test(operationId ?? '') || !['read', 'backup'].includes(phase)) stop('READ_ONLY_COMMAND_REQUIRED');
  if (!ports || ['isAuthenticatedPrivateBinding', 'prepareReceipt', 'relayReceipt', 'readBrainReceipt', 'audit'].some(k => typeof ports[k] !== 'function'))
    stop('TRUSTED_COMPOSITION_PORTS_REQUIRED');
  const gate = await ports.isAuthenticatedPrivateBinding();
  if (gate?.verified !== true || gate?.source !== 'apps_script' || gate?.scope !== 'metadata-only' ||
      gate?.paused !== false || gate?.enabled !== true) stop('PRIVATE_BRAIN_BINDING_NOT_READY');
  const prepared = await ports.prepareReceipt({ operationId, phase });
  if (!prepared || !['PRIVATE_RECEIPT_VERIFIED', 'ALREADY_VERIFIED'].includes(prepared.status) ||
    prepared.operationId !== operationId || !digest(prepared.sourceRevision))
    stop('PRIVATE_SOURCE_RECEIPT_NOT_VERIFIED');
  // Only the opaque operation ID enters #201. No user-supplied event body.
  let delivered;
  try { delivered = await ports.relayReceipt({ operationId }); }
  catch { delivered = { status: 'RECONCILE_REQUIRED' }; }
  const reconcile = async () => {
    // An uncertain delivery may already exist upstream: hold, never resend.
    try { await ports.audit({ operationId, outcome: 'RECONCILIATION_REQUIRED' }); }
    catch { stop('AUDIT_NOT_DURABLE'); }
    return { status: 'RECONCILIATION_REQUIRED', sent: false, brainReadbackVerified: false };
  };
  if (!delivered || !['DURABLE_BRAIN_RECEIPT', 'DUPLICATE_CONFIRMED'].includes(delivered.status) ||
      !UUID.test(delivered.eventId ?? '')) return reconcile();
  // A relay acknowledgement is not proof of persistence. Query the actual
  // central Brain's private durable journal through a trusted binding port.
  let proof;
  try { proof = await ports.readBrainReceipt({ operationId, eventId: delivered.eventId }); }
  catch { return reconcile(); }
  if (!proof || typeof proof !== 'object' || Array.isArray(proof) ||
      Object.keys(proof).length !== BRAIN_READBACK_FIELDS.length ||
      !BRAIN_READBACK_FIELDS.every(k => Object.hasOwn(proof, k)) ||
      proof.eventId !== delivered.eventId || proof.correlationId !== operationId ||
      !UUID.test(proof.receiptId ?? '') || proof.source !== 'apps_script' ||
      proof.sourceRevision !== prepared.sourceRevision ||
      proof.transport !== 'PRIVATE_SERVICE_BINDING' ||
      !['QUEUED', 'WAITING_REVIEW'].includes(proof.status) ||
      proof.durable !== true) return reconcile();
  try { await ports.audit({ operationId, outcome: delivered.status }); }
  catch { stop('AUDIT_NOT_DURABLE'); }
  return { status: delivered.status, sent: delivered.status === 'DURABLE_BRAIN_RECEIPT',
    brainReadbackVerified: true };
}
