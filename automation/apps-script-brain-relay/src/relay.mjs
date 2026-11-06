/**
 * Private Apps Script -> central Brain adapter contract.
 * Not an HTTP route, deployed Worker, Google writer, OAuth adapter or task trigger.
 * All ports MUST be constructed in trusted Worker code (never request JSON).
 * OFF until independently verified Brain intake, source policy, durable ledger
 * and private Service Binding are integrated.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEX = /^[0-9a-f]{64}$/;
const PHASES = Object.freeze({
  SOURCE_READ_VERIFIED: 'apps_script.source.read',
  BACKUP_VERIFIED: 'apps_script.backup.verified',
  SMOKE_ROLLBACK_VERIFIED: 'apps_script.rollback.verified',
});
const KEYS = ['operationId', 'phase', 'sourceFingerprint', 'sourceRevision',
  'evidenceDigest', 'observedAt', 'status'];

export class RelayFault extends Error {
  constructor(code) { super(code); this.code = code; }
}

function exact(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every(key => Object.hasOwn(value, key));
}

function fail(code) { throw new RelayFault(code); }
function checkUuid(value) { return typeof value === 'string' && UUID.test(value); }
function checkTime(value, now) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) return false;
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString().replace('.000Z', 'Z') !==
    value.replace('.000Z', 'Z')) return false;
  return time <= now + 300000 && time >= now - 7 * 86400000;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    byte => byte.toString(16).padStart(2, '0')).join('');
}
function uuidFromSha(hex) {
  // Stable, version-5-shaped opaque identifier derived from SHA-256.
  const variant = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-5' +
    hex.slice(13, 16) + '-' + variant + hex.slice(17, 20) + '-' + hex.slice(20, 32);
}

/**
 * The verifiedReceipt must come from a private, authoritative Durable Object
 * journal after actual Google/provider readback; fields from HTTP are NOT proof.
 * Only opaque hashes and an operation UUID may leave this module.
 */
export async function buildVerifiedAppsScriptEvent(verifiedReceipt, now = Date.now()) {
  if (!exact(verifiedReceipt, KEYS)) fail('PRIVATE_RECEIPT_SHAPE_INVALID');
  const r = verifiedReceipt;
  if (!checkUuid(r.operationId) || !Object.hasOwn(PHASES, r.phase) ||
      r.status !== 'PROVIDER_VERIFIED' ||
      !HEX.test(r.sourceFingerprint) || !HEX.test(r.sourceRevision) ||
      !HEX.test(r.evidenceDigest) || !checkTime(r.observedAt, now)) {
    fail('PRIVATE_PROVIDER_EVIDENCE_NOT_VERIFIED');
  }
  const digest = await sha256(
    'archelaos|apps-script|v1|' + r.operationId + '|' + r.phase + '|' +
    r.sourceFingerprint + '|' + r.sourceRevision + '|' + r.evidenceDigest
  );
  return {
    schemaVersion: 1,
    eventId: uuidFromSha(digest),
    source: 'apps_script',
    type: PHASES[r.phase],
    sourceRevision: r.sourceRevision,
    observedAt: r.observedAt,
    correlationId: r.operationId,
    metadata: {
      sourceFingerprint: r.sourceFingerprint,
      evidenceDigest: r.evidenceDigest,
      privacy: 'OPAQUE_AUDIT_ONLY'
    }
  };
}

function assertPorts(ports) {
  const needed = ['readControls', 'readTrustedReceipt', 'readBrainCapabilities',
    'claimDelivery', 'submitToBrain', 'finalizeDelivery'];
  if (!ports || needed.some(key => typeof ports[key] !== 'function')) fail('TRUSTED_PORTS_UNAVAILABLE');
}

function assertCapabilities(cap) {
  // Existing draft Brain #111 DOES NOT currently support apps_script source.
  // This is a hard acceptance gate, not a client-provided "verified" flag.
  if (!exact(cap, ['schemaVersion', 'source', 'transport', 'status', 'deploymentDigest']) ||
      cap.schemaVersion !== 1 || cap.source !== 'apps_script' ||
      cap.transport !== 'PRIVATE_SERVICE_BINDING' || cap.status !== 'ACCEPTING' ||
      !HEX.test(cap.deploymentDigest)) fail('BRAIN_APPSSCRIPT_SOURCE_NOT_READY');
}

/**
 * Contract for future trusted composition, not a deployed dispatcher.
 * Caller supplies only operationId. No source, proof, project ID, tokens, code,
 * trigger, URL, or authorization flag is accepted from a request.
 *
 * A durable claim MUST be written before sending. Uncertain network or audit
 * results remain reconciliation holds and MUST NOT be blindly retried.
 */
export async function relayAppsScriptReceipt(input, ports, now = Date.now()) {
  if (!exact(input, ['operationId']) || !checkUuid(input.operationId))
    fail('INVALID_RELAY_COMMAND');
  assertPorts(ports);
  const controls = await ports.readControls();
  if (!exact(controls, ['paused', 'bridgeEnabled']) ||
      typeof controls.paused !== 'boolean' || typeof controls.bridgeEnabled !== 'boolean')
    fail('TRUSTED_CONTROLS_UNAVAILABLE');
  if (controls.paused) return { status: 'PAUSED', sent: false };
  if (!controls.bridgeEnabled) return { status: 'RELAY_DISABLED', sent: false };
  const receipt = await ports.readTrustedReceipt(input.operationId);
  if (!receipt || receipt.operationId !== input.operationId)
    fail('RECEIPT_IDENTITY_MISMATCH');
  const event = await buildVerifiedAppsScriptEvent(receipt, now);
  assertCapabilities(await ports.readBrainCapabilities());
  const claim = await ports.claimDelivery(event.eventId);
  if (!exact(claim, ['status']) || !['CLAIMED', 'DUPLICATE_CONFIRMED', 'RECONCILE_REQUIRED'].includes(claim.status))
    fail('DURABLE_CLAIM_UNAVAILABLE');
  if (claim.status !== 'CLAIMED')
    return { status: claim.status, sent: false, eventId: event.eventId };
  let upstream;
  try { upstream = await ports.submitToBrain(event); }
  catch { upstream = null; }
  const accepted = upstream && exact(upstream,
    ['receiptId', 'correlationId', 'status', 'durable', 'duplicate']) &&
    checkUuid(upstream.receiptId) && upstream.correlationId === event.correlationId &&
    ['QUEUED', 'WAITING_REVIEW'].includes(upstream.status) &&
    upstream.durable === true && typeof upstream.duplicate === 'boolean';
  const status = accepted ? 'DURABLE_BRAIN_RECEIPT' : 'RECONCILE_REQUIRED';
  try {
    await ports.finalizeDelivery(event.eventId, {
      status, brainReceiptId: accepted ? upstream.receiptId : null
    });
  } catch { fail('DURABLE_AUDIT_NOT_CONFIRMED'); }
  return { status, sent: Boolean(accepted), eventId: event.eventId };
}
