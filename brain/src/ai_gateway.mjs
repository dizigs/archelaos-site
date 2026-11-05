import { digest } from './contract.mjs';

// No provider transport or credentials exist here. Real charging stays disabled;
// the port contract is exercised with explicitly marked synthetic providers.
export async function runGuardedAi(request, ports, policy = {}) {
  const stopped = reason => ({ status: 'PENDING_AI_CONFIGURATION_OR_RECONCILIATION', reason, externalProviderCalls: 0 });
  if (!['staging', 'drive', 'gmail', 'site', 'github', 'news'].includes(request?.sourceType)) return stopped('SOURCE_SCOPE_UNVERIFIED');
  const controls = await ports.readControls();
  if (controls.globalPaused || controls.aiPaused || controls.sourcePaused?.[request.sourceType]) return stopped('AUTOMATION_OR_PAID_AI_PAUSED');
  if (policy.accountCoverageVerified !== true || policy.enabled !== true || request.privateDataApproved !== true) return stopped('COVERAGE_OR_PRIVACY_UNVERIFIED');
  if (policy.executionMode !== 'synthetic-test-double' || ports.provider?.syntheticOnly !== true) return stopped('LIVE_PROVIDER_NOT_CONFIGURED');
  let reservation;
  try { reservation = await ports.ledger.reserve(request.charge, policy.costConfig); }
  catch { return stopped('BUDGET_UNVERIFIABLE_OR_INSUFFICIENT'); }
  if (reservation.duplicate) return stopped('EXISTING_CHARGE_ATTEMPT_REQUIRES_RECONCILIATION');
  try {
    for (const threshold of reservation.alerts || []) await ports.alerts.deliverOnce({ id: reservation.month + ':' + threshold, threshold });
    for (const threshold of reservation.providerAlerts || []) await ports.alerts.deliverOnce({ id: reservation.month + ':openai:' + threshold, provider: 'openai', threshold });
  } catch { return stopped('BUDGET_ALERT_SINK_UNAVAILABLE_RESERVATION_HELD'); }
  const latest = await ports.readControls();
  if (latest.globalPaused || latest.aiPaused || latest.sourcePaused?.[request.sourceType]) return stopped('PAUSED_BEFORE_PROVIDER_RESERVATION_HELD');
  let claim;
  try { claim = await ports.ledger.claim(request.charge.reservationId); }
  catch { return stopped('BUDGET_LEDGER_UNAVAILABLE'); }
  if (claim.authorized !== true) return stopped('CHARGE_ALREADY_CLAIMED');
  let response;
  try { response = await ports.provider.invokeSynthetic({ operation: request.charge.operation, model: request.charge.model }); }
  catch { return stopped('PROVIDER_OUTCOME_UNKNOWN_RESERVATION_HELD'); }
  if (response?.billingEvidenceVerified !== true || !Number.isSafeInteger(response.actualMicroEur) || response.actualMicroEur < 0 || response.actualMicroEur > reservation.amountMicroEur || typeof response.output !== 'string' || response.output.length > 10000) return stopped('USAGE_RECONCILIATION_REQUIRED');
  try { await ports.ledger.settle(request.charge.reservationId, response.actualMicroEur); }
  catch { return stopped('SETTLEMENT_RECONCILIATION_REQUIRED'); }
  // Only a digest crosses this interface. Model output is never evidence for
  // public facts; the independently verified content pipeline remains required.
  return { status: 'SYNTHETIC_OUTPUT_REQUIRES_PRIVATE_REVIEW', outputSha256: await digest(response.output), externalProviderCalls: 0, syntheticInvocations: 1 };
}
