// Source-only, unmounted transport for the official OpenAI Agents API.
// NO scheduled trigger, Worker handler, GitHub writer or production import.
import { validateTask, validateTrustedBrainClaim, buildSessionRequest } from './policy.mjs';

const ENDPOINT = 'https://api.openai.com/v1/agents/sessions';
const blocked = code => ({ status: 'BLOCKED', reason: code, providerCallMade: false });
const unknown = code => ({ status: 'UNKNOWN_RECONCILE_REQUIRED', reason: code,
  providerCallMayHaveOccurred: true, safeToRetry: false });

// This transport must only be wired by the existing Brain authority after
// authenticating and consuming its separate signed claim. Injected callbacks
// are deliberately mandatory; none is implemented by this source-only adapter.
export async function submitAuthorizedReview({
  task, activation = 'OFF', readBackClaim, beginExclusiveAttempt, settleSubmission,
  apiKey, fetchImpl, now = () => Date.now(),
}) {
  if (activation !== 'STAGING_EXPLICIT_APPROVAL') return blocked('PROVIDER_DISABLED');
  let safeTask;
  try { safeTask = validateTask(task); }
  catch { return blocked('INVALID_TASK'); }
  if (typeof readBackClaim !== 'function' ||
      typeof beginExclusiveAttempt !== 'function' ||
      typeof settleSubmission !== 'function')
    return blocked('BRAIN_PORTS_UNWIRED');
  if (typeof apiKey !== 'string' || !/^sk-/.test(apiKey) ||
      apiKey.length > 4096 || typeof fetchImpl !== 'function')
    return blocked('PROVIDER_CREDENTIAL_OR_TRANSPORT_UNAVAILABLE');

  let claim;
  try {
    claim = validateTrustedBrainClaim(safeTask,
      await readBackClaim(safeTask.taskId), now());
  } catch { return blocked('BRAIN_CLAIM_NOT_VERIFIED'); }

  let begin;
  try {
    begin = await beginExclusiveAttempt({
      taskId: safeTask.taskId,
      reservationId: claim.reservationId,
      dispatchAttemptId: claim.dispatchAttemptId,
      commitSha: safeTask.commitSha,
    });
  } catch { return blocked('BRAIN_BEGIN_FAILED'); }
  if (begin?.state !== 'BEGUN' ||
      begin.dispatchAttemptId !== claim.dispatchAttemptId)
    return blocked('BRAIN_BEGIN_NOT_ATTESTED');

  // At this point a durable Brain ledger says the ONE external call may begin.
  // On any ambiguous failure keep locks and reserved funds for reconciliation.
  const controller = new AbortController();
  let timer;
  try {
    timer = setTimeout(() => controller.abort(), 25000);
    const body = buildSessionRequest(safeTask, claim);
    const response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'OpenAI-Beta': 'agents=v1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      redirect: 'error',
    });
    if (response.status !== 201 && response.status !== 200)
      return unknown('PROVIDER_HTTP_NON_SUCCESS');
    const contentType = response.headers?.get?.('content-type') || '';
    if (!contentType.includes('application/json'))
      return unknown('PROVIDER_RESPONSE_UNEXPECTED_TYPE');
    const data = await response.json();
    if (data?.object !== 'agent.session' ||
        typeof data.id !== 'string' || !/^sess_[a-zA-Z0-9_-]{4,128}$/.test(data.id) ||
        data.spend_control?.limit !== claim.maxUsdCents ||
        data.metadata?.task_id !== safeTask.taskId)
      return unknown('PROVIDER_READBACK_MISMATCH');
    let receipt;
    try {
      receipt = await settleSubmission({
        taskId: safeTask.taskId,
        dispatchAttemptId: claim.dispatchAttemptId,
        providerSessionId: data.id,
        providerStatus: data.status,
        providerSpendLimitUsdCents: data.spend_control.limit,
      });
    } catch { return unknown('BRAIN_SETTLEMENT_UNKNOWN'); }
    if (receipt?.state !== 'ACKNOWLEDGED' ||
        receipt.providerSessionId !== data.id)
      return unknown('BRAIN_SETTLEMENT_NOT_ATTESTED');
    return {
      status: 'SESSION_SUBMITTED_NOT_TURN_VERIFIED',
      providerSessionId: data.id,
      providerStatus: typeof data.status === 'string' ? data.status : 'UNKNOWN',
      providerCallMade: true,
      safeToRetry: false,
    };
  } catch {
    return unknown('PROVIDER_TRANSPORT_OUTCOME_UNKNOWN');
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
