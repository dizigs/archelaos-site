/**
 * Read-only adapter for the ONE canonical Brain claim/ledger.
 * There is no second dispatcher, coordinator, ledger, provider call or GitHub writer.
 */
import { IntegrationBlocked, REPOSITORY, normalizeIntent, confirmBrainReceipt,
  verifySignedBrainEnvelope, evaluateTestingGate } from './index.mjs';
import { normalizeNativeProposal } from './compat.mjs';

const HEX = /^[0-9a-f]{64}$/;
const fail = (ok, code) => { if (!ok) throw new IntegrationBlocked(code); };
const blocked = code => Object.freeze({ status:'BLOCKED', code, providerCalls:0,
  ledgerWrites:0, draftPrCreated:false, mergeAllowed:false, deployAllowed:false });

function strictJson(raw) {
  fail(typeof raw === 'string' && raw.length > 1 && raw.length <= 100000, 'INVALID_NATIVE_JSON');
  let v;
  try { v = JSON.parse(raw); } catch { throw new IntegrationBlocked('INVALID_NATIVE_JSON'); }
  fail(v && typeof v === 'object' && !Array.isArray(v), 'INVALID_NATIVE_JSON');
  function inspect(o, depth) {
    fail(depth <= 12 && Object.keys(o).length <= 50, 'INVALID_NATIVE_JSON');
    for (const [k, val] of Object.entries(o)) {
      fail(!['__proto__','constructor','prototype'].includes(k), 'INVALID_NATIVE_JSON');
      if (val && typeof val === 'object') inspect(val, depth+1);
      else fail(val === null || ['string','number','boolean'].includes(typeof val), 'INVALID_NATIVE_JSON');
    }
  }
  inspect(v, 0);
  return v;
}

/**
 * Inert proposal/readback gateway. Every privileged method MUST be a trusted,
 * authenticated private Brain/GitHub port. Caller-supplied approval has no role.
 * The live executor/budget callback contract is intentionally absent: native
 * #214 / #211 billing callbacks may not create a second reservation.
 */
export async function reviewCanonicalTask(taskInput, ports, options = {}) {
  if (options.mode !== 'synthetic-review' || options.enableInference === true ||
      options.enableGitHubWrites === true) return blocked('REVIEW_ONLY_MODE_REQUIRED');
  try {
    const task = normalizeIntent(taskInput);
    fail(typeof options.signingKey === 'string' &&
      typeof ports?.brain?.readSignedReceipt === 'function' &&
      typeof ports.brain.readClaim === 'function' &&
      typeof ports.brain.readControls === 'function', 'BRAIN_READBACK_PORT_REQUIRED');
    const envelope = await ports.brain.readSignedReceipt(task.taskId);
    const receipt = await verifySignedBrainEnvelope(envelope, options.signingKey);
    confirmBrainReceipt(task, receipt);
    fail(HEX.test(receipt.scopeDigest || '') &&
      receipt.allowedPaths.length === task.paths.length &&
      [...receipt.allowedPaths].sort((a,b) => a.localeCompare(b))
        .every((p,i)=>p===task.paths[i]), 'IMMUTABLE_SCOPE_MISMATCH');
    const controls = await ports.brain.readControls();
    fail(controls?.globalPaused === false &&
      (task.type !== 'build' || controls.aiPaused === false), 'BRAIN_PAUSED');
    const prior = await ports.brain.readClaim(task.taskId);
    fail(prior?.taskId === task.taskId && prior.status === 'CLAIMED' &&
      prior.baseCommit === task.commitSha &&
      prior.scopeDigest === receipt.scopeDigest &&
      prior.type === (task.type === 'testing' ? 'TESTING' : 'BUILD_'+task.lane) &&
      prior.productionAllowed === false && prior.autoMergeAllowed === false,
      'CANONICAL_CLAIM_UNVERIFIED');
    if (task.type === 'build') {
      fail(HEX.test(prior.budgetReservationId || '') &&
        prior.executor === (task.lane==='A' ? 'gemini' : 'gemma'),
        'CANONICAL_LEDGER_RESERVATION_UNVERIFIED');
      fail(options.nativeOutputJSON !== undefined, 'NATIVE_PROPOSAL_NOT_PROVEN');
      // No provider/ledger invocation: this only validates an UNTRUSTED
      // provider-shaped result against the durable Brain scope.
      const proposal = normalizeNativeProposal(task, receipt, strictJson(options.nativeOutputJSON));
      const latest = await ports.brain.readClaim(task.taskId);
      fail(latest?.status === 'CLAIMED' &&
        latest.scopeDigest === prior.scopeDigest &&
        latest.budgetReservationId === prior.budgetReservationId,
        'UNKNOWN_OR_CHANGED_BRAIN_CLAIM');
      return Object.freeze({ ...proposal, status:'PROPOSAL_REVIEW_ONLY',
        centralLedgerReservationId:prior.budgetReservationId,
        centralLedgerReadback:true, financialSettlementVerified:false,
        providerProvenanceVerified:false, providerCalls:0, ledgerWrites:0 });
    }
    fail(prior.budgetReservationId === null &&
      typeof ports?.checks?.readVerified === 'function',
      'TESTING_GITHUB_PROOF_REQUIRED');
    const checks = await ports.checks.readVerified({
      repository:REPOSITORY, commitSha:task.commitSha
    });
    const gate = evaluateTestingGate(task.commitSha, checks);
    const latest = await ports.brain.readClaim(task.taskId);
    fail(latest?.status === 'CLAIMED' && latest.scopeDigest === prior.scopeDigest,
      'UNKNOWN_OR_CHANGED_BRAIN_CLAIM');
    return Object.freeze({ status:gate.passed ? 'TESTING_PASSED_REVIEW_ONLY' :
      'TESTING_FAILED_CLOSED', gate, providerCalls:0, ledgerWrites:0,
      draftPrCreated:false, mergeAllowed:false, deployAllowed:false });
  } catch (e) {
    return blocked(e instanceof IntegrationBlocked ? e.code : 'TRUSTED_READBACK_UNAVAILABLE');
  }
}
