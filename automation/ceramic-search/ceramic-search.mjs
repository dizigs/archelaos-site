/**
 * Ceramic.ai web search via the existing Cloudflare Workers AI binding.
 * Isolated port for the Archelaos Brain; no endpoint, trigger, credential,
 * deployment or billed request is created by importing this module.
 * https://developers.cloudflare.com/web-search/how-to-use/
 */

const URL_MAX = 2048;
const DESCRIPTION_MAX = 2000;

const failure = code => Object.assign(new Error(code), { code });

function validInput(query, limit, gatewayId, byokAlias) {
  if (typeof query !== 'string' || query.trim().length < 1 || query.length > 1024) throw failure('INVALID_PUBLIC_SEARCH_QUERY');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10) throw failure('INVALID_SEARCH_LIMIT');
  if (typeof gatewayId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(gatewayId)) throw failure('INVALID_GATEWAY_ID');
  if (byokAlias !== undefined && (typeof byokAlias !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(byokAlias))) throw failure('INVALID_BYOK_ALIAS');
}

function cleanItem(item) {
  if (!item || typeof item !== 'object' || typeof item.url !== 'string' || item.url.length > URL_MAX) return null;
  let url;
  try { url = new URL(item.url); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  return {
    url: url.toString(),
    title: typeof item.title === 'string' ? item.title.slice(0, 300) : '',
    description: typeof item.description === 'string' ? item.description.slice(0, DESCRIPTION_MAX) : '',
  };
}

/**
 * The Brain owns privacy review, durable deduplication, price/FX proof,
 * budget reservation and verified settlement. Neither search contents nor
 * the full query are written to audit. In an ambiguous outcome, the Brain
 * must retain the charge reservation and must not blindly retry.
 *
 * @param {object} options
 * @param {object} options.ai - Cloudflare env.AI binding
 * @param {string} options.query - approved PUBLIC search terms only
 * @param {function} options.authorize - must atomically reserve max cost and
 *    claim once, returning { authorized: true, reservationId: string }
 * @param {function} options.audit - durable attempt outcome sink
 * @param {boolean} options.enabled - explicitly true to permit live call
 */
export async function ceramicSearch({ ai, query, limit = 5, gatewayId = 'default', byokAlias, authorize, audit, enabled = false } = {}) {
  if (enabled !== true) return { status: 'CERAMIC_DISABLED', providerCalls: 0, items: [] };
  validInput(query, limit, gatewayId, byokAlias);
  if (typeof ai?.websearch !== 'function' || typeof authorize !== 'function' || typeof audit !== 'function') throw failure('CERAMIC_BRAIN_PORTS_MISSING');
  const reservation = await authorize({ provider: 'ceramic', operation: 'public-web-search', requests: 1, publicOnly: true });
  if (reservation?.authorized !== true || typeof reservation.reservationId !== 'string' || !reservation.reservationId) throw failure('CERAMIC_BUDGET_NOT_AUTHORIZED');

  let attempted = false;
  try {
    const opts = { gatewayId, query: query.trim(), provider: 'ceramic', limit };
    if (byokAlias !== undefined) opts.byokAlias = byokAlias;
    attempted = true;
    const response = await ai.websearch(opts);
    if (!response || response.ok !== true || typeof response.json !== 'function') throw failure('CERAMIC_REMOTE_RESPONSE_FAILED');
    const data = await response.json();
    if (!data || !Array.isArray(data.items)) throw failure('CERAMIC_RESPONSE_SCHEMA_UNVERIFIED');
    const items = data.items.slice(0, limit).map(cleanItem).filter(Boolean);
    await audit({ reservationId: reservation.reservationId, provider: 'ceramic', state: 'SUCCESS_REQUIRES_BILLING_RECONCILIATION', count: items.length });
    return { status: 'REVIEW_REQUIRED', providerCalls: 1, items };
  } catch {
    // No blind retry: an error after dispatch may still be a billable search.
    try { await audit({ reservationId: reservation.reservationId, provider: 'ceramic', state: attempted ? 'OUTCOME_UNKNOWN_RECONCILE' : 'NO_CALL' }); } catch { /* fail closed; parent ledger keeps reservation */ }
    throw failure('CERAMIC_OUTCOME_REQUIRES_RECONCILIATION');
  }
}
