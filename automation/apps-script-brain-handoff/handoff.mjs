/**
 * Isolated private receipt adapter for the EXISTING PR #124 ScriptEditor.
 * No Worker entrypoint, no Google write and no Brain call is defined here.
 * A privileged coordinator must supply the real ScriptEditor, durable SQLite
 * receipt ports, authenticated actor and HMAC-derived project fingerprint.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEX = /^[0-9a-f]{64}$/;
const PHASES = Object.freeze({ read: 'SOURCE_READ_VERIFIED', backup: 'BACKUP_VERIFIED' });
const allowedTransient = new Set(['GOOGLE_HTTP_429', 'GOOGLE_HTTP_502', 'GOOGLE_HTTP_503', 'GOOGLE_HTTP_504', 'GOOGLE_PROJECT_TRANSPORT_UNCERTAIN']);

export class HandoffFault extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = code => { throw new HandoffFault(code); };
const sha256 = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function requirePorts(ports) {
  for (const method of ['readControls', 'claim', 'get', 'complete', 'hold', 'audit', 'fingerprintProject']) {
    if (typeof ports?.[method] !== 'function') fail('PRIVATE_DURABLE_PORTS_REQUIRED');
  }
}
function verifyReceipt(record, id, phase) {
  if (!record || record.operationId !== id || record.phase !== phase ||
      record.status !== 'PROVIDER_VERIFIED' || !HEX.test(record.sourceFingerprint) ||
      !HEX.test(record.sourceRevision) || !HEX.test(record.evidenceDigest) ||
      !Number.isFinite(Date.parse(record.observedAt))) fail('IMMUTABLE_RECEIPT_READBACK_INVALID');
}

/**
 * Only trusted server code may call this, with a ScriptEditor from the existing
 * project-scoped coordinator. operationId is a task UUID, NOT a Google ID.
 * Durable claim/complete/hold ports MUST be atomic across concurrent calls.
 * This adapter never grants edit rights or modifies Apps Script code/triggers.
 */
export async function prepareAppsScriptReceipt({ operationId, phase = 'read', actor, editor, ports, now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  if (!UUID.test(operationId ?? '') || !Object.hasOwn(PHASES, phase)) fail('HANDOFF_COMMAND_INVALID');
  requirePorts(ports);
  if (!editor || typeof editor.read !== 'function' || typeof editor.backup !== 'function' ||
      typeof editor.projectId !== 'string' || !editor.projectId) fail('PR124_EDITOR_REQUIRED');
  const controls = await ports.readControls();
  if (!controls || controls.paused !== false || controls.readEnabled !== true) fail('HANDOFF_DISABLED_OR_PAUSED');
  const claimed = await ports.claim(operationId, PHASES[phase]);
  if (claimed?.status === 'COMPLETED') {
    const old = await ports.get(operationId);
    verifyReceipt(old, operationId, PHASES[phase]);
    return { status: 'ALREADY_VERIFIED', operationId, sourceRevision: old.sourceRevision };
  }
  if (claimed?.status !== 'CLAIMED') fail('HANDOFF_IN_PROGRESS_OR_RECONCILIATION_REQUIRED');
  let stage = 'PREPARING';
  try {
    const projectFingerprint = await ports.fingerprintProject(editor.projectId);
    if (!HEX.test(projectFingerprint ?? '')) fail('PRIVATE_PROJECT_FINGERPRINT_REQUIRED');
    let view;
    if (phase === 'read') {
      // Retry only an idempotent GET; never retry backup, edit or rollback.
      for (let attempt = 0; attempt < 2; attempt++) {
        try { view = await editor.read(actor); break; }
        catch (error) {
          if (attempt !== 0 || !allowedTransient.has(error?.code)) throw error;
          await sleep(100);
        }
      }
    } else {
      stage = 'BACKUP_REQUESTED';
      const backed = await editor.backup(actor); // encrypted private readback in PR #124
      if (backed?.status !== 'PRIVATE_BACKUP_VERIFIED' || !UUID.test(backed.backupId ?? '') ||
          !HEX.test(backed.headHash ?? '') || !Number.isInteger(backed.fileCount)) fail('PR124_BACKUP_UNVERIFIED');
      stage = 'BACKUP_VERIFIED';
      view = await editor.read(actor); // independent current Google source readback
      if (view.headHash !== backed.headHash || view.files?.length !== backed.fileCount) fail('SOURCE_DRIFT_AFTER_BACKUP');
    }
    if (view?.status !== 'PRIVATE_CONTENT_READ' || !HEX.test(view.headHash ?? '') ||
        view.projectIdentityVerified !== true || !Array.isArray(view.files) ||
        view.files.length < 4 || view.files.length > 200) fail('PR124_SOURCE_READ_UNVERIFIED');
    // Neither project ID, filenames, source, OAuth grant nor backup ID leaves this scope.
    const fingerprint = projectFingerprint;
    const evidenceDigest = await sha256(JSON.stringify({ v: 1, operationId, phase: PHASES[phase], fingerprint, headHash: view.headHash, count: view.files.length }));
    const receipt = { operationId, phase: PHASES[phase], sourceFingerprint: fingerprint,
      sourceRevision: view.headHash, evidenceDigest,
      observedAt: new Date(now()).toISOString(), status: 'PROVIDER_VERIFIED' };
    stage = 'COMMITTING';
    await ports.complete(operationId, receipt);
    const saved = await ports.get(operationId);
    verifyReceipt(saved, operationId, PHASES[phase]);
    if (!same(saved, receipt)) fail('IMMUTABLE_RECEIPT_MISMATCH');
    await ports.audit({ operationId, phase: PHASES[phase], outcome: 'PRIVATE_RECEIPT_VERIFIED', sourceRevision: receipt.sourceRevision });
    return { status: 'PRIVATE_RECEIPT_VERIFIED', operationId, sourceRevision: receipt.sourceRevision };
  } catch (error) {
    // Unclear outcomes require operator reconciliation; never blind retries.
    try { await ports.hold(operationId, stage === 'COMMITTING' ? 'RECEIPT_COMMIT_UNCERTAIN' : 'HANDOFF_RECONCILIATION_REQUIRED'); }
    catch { fail('DURABLE_HOLD_NOT_CONFIRMED'); }
    throw error;
  }
}

/** Read-only readiness gate for future PR #201 relay Service Binding. */
export async function verifyBrainHandoffReadiness({ readCapabilities, bindingVerified }) {
  if (bindingVerified !== true || typeof readCapabilities !== 'function') fail('PRIVATE_SERVICE_BINDING_NOT_VERIFIED');
  const cap = await readCapabilities();
  if (cap?.schemaVersion !== 1 || cap.source !== 'apps_script' ||
      cap.transport !== 'PRIVATE_SERVICE_BINDING' || cap.status !== 'ACCEPTING' ||
      !HEX.test(cap.deploymentDigest ?? '')) fail('BRAIN_APPSSCRIPT_SOURCE_NOT_READY');
  return { status: 'BRAIN_APPS_SCRIPT_INTAKE_CAPABILITY_VERIFIED' };
}
