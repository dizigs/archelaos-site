/**
 * Private Brain return-value schema for the Ads Worker.
 * This module does not send a network request, commit a Brain receipt or reserve
 * AI spend. The Brain service-binding owner must authenticate and persist delivery.
 */
const requireSafe = (ok, code) => { if (!ok) throw Error(code); };
const MONEY = /^(0|[1-9]\d{0,4})\.\d{2}$/;
const CORRELATION = /^[a-zA-Z0-9_-]{8,64}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const METRICS = new Set(['clicks', 'impressions', 'key_events', 'engaged_sessions']);

export function makeBrainReviewHandoff(mode, correlationId, receipt) {
  requireSafe(CORRELATION.test(correlationId || ''), 'ADS_HANDOFF_CORRELATION_INVALID');
  requireSafe(receipt && typeof receipt === 'object' && !Array.isArray(receipt),
    'ADS_HANDOFF_RECEIPT_INVALID');
  let payload;
  if (mode === 'analytics_preview') {
    requireSafe(['ga4', 'gsc', 'clarity'].includes(receipt.source) &&
      DIGEST.test(receipt.artifactDigest || '') &&
      receipt.autoChange === false &&
      Array.isArray(receipt.hints) && receipt.hints.length <= 300,
    'ADS_HANDOFF_ANALYTICS_UNVERIFIED');
    const hints = receipt.hints.map(h => {
      requireSafe(h && typeof h === 'object' &&
        /^\/[a-zA-Z0-9/_\-.]{0,180}$/.test(h.page || '') &&
        METRICS.has(h.metric) &&
        Number.isFinite(h.count) && h.count >= 0 &&
        h.action === 'REVIEW_ONLY_NO_CAUSAL_INFERENCE',
      'ADS_HANDOFF_ANALYTICS_UNVERIFIED');
      return {pagePath: h.page, metric: h.metric, value: h.count};
    });
    payload = {producer: receipt.source, reportDigest: receipt.artifactDigest, hints};
  } else if (mode === 'budget_audit_read') {
    requireSafe(receipt.source === 'GOOGLE_ADS_API_GAQL' &&
      receipt.currency === 'USD' && receipt.actualSpendObserved === true &&
      receipt.aiBudgetLedger === 'SEPARATE_EUR_20' &&
      ['accountDailyBudgetUsd', 'todaySpendUsd', 'thisMonthSpendUsd',
        'conservativeDailyLimitUsd', 'grantMonthlyLimitUsd']
        .every(k => MONEY.test(receipt[k] || '')),
    'ADS_HANDOFF_BUDGET_UNVERIFIED');
    payload = {
      currency: 'USD', accountDailyBudgetUsd: receipt.accountDailyBudgetUsd,
      todaySpendUsd: receipt.todaySpendUsd,
      thisMonthSpendUsd: receipt.thisMonthSpendUsd,
      conservativeDailyLimitUsd: receipt.conservativeDailyLimitUsd,
      grantMonthlyLimitUsd: receipt.grantMonthlyLimitUsd,
      actualSpendObserved: true, ledger: 'AD_GRANTS_USD_NOT_AI_EUR'
    };
  } else {
    throw Error('ADS_HANDOFF_MODE_NOT_ALLOWED');
  }
  // The result contains no customer ID, private token, keys, raw analytics
  // sessions or personal data. It is an RPC response, NOT a delivery receipt.
  return {
    schemaVersion: 1,
    capability: 'google_ads',
    producer: 'archelaos-google-ads',
    handoffMode: mode,
    correlationId,
    channel: 'PRIVATE_BRAIN_RPC_ONLY',
    deliveryStatus: 'NOT_SENT_BY_WORKER',
    reviewOnly: true,
    customerIdIncluded: false,
    adsMutation: false,
    aiCostEur: 0,
    payload
  };
}
