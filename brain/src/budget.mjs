import { Rejected, HEX, UUID } from './contract.mjs';
export const MAX_MONTHLY_MICRO_EUR = 20000000;
export function budgetMonth(at) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit' }).formatToParts(new Date(at));
  return parts.find(p => p.type === 'year').value + '-' + parts.find(p => p.type === 'month').value;
}
export function estimateMicroEur(request, price, now) {
  if (!price || price.verified !== true || price.boundedBillingVerified !== true || typeof request.model !== 'string' || request.model !== price.model || !['EUR', 'USD'].includes(price.currency) || !HEX.test(price.evidenceSha256) || !/^https:\/\/[a-z0-9.-]+\/[^\s]*$/.test(price.sourceUrl) || !Number.isFinite(Date.parse(price.effectiveAt)) || Date.parse(price.effectiveAt) > now || !Number.isFinite(Date.parse(price.expiresAt)) || Date.parse(price.expiresAt) <= now) throw new Rejected('PRICING_UNVERIFIED', 409);
  if (price.currency !== 'EUR' && (price.fxVerified !== true || !HEX.test(price.fxEvidenceSha256) || !/^https:\/\/[a-z0-9.-]+\/[^\s]*$/.test(price.fxSourceUrl) || !Number.isFinite(Date.parse(price.fxEffectiveAt)) || Date.parse(price.fxEffectiveAt) > now || !Number.isFinite(Date.parse(price.fxExpiresAt)) || Date.parse(price.fxExpiresAt) <= now)) throw new Rejected('FX_UNVERIFIED', 409);
  const values = [request.maxInputTokens, request.maxOutputTokens, price.inputMicroCurrencyPerMillion, price.outputMicroCurrencyPerMillion, price.fxNumerator, price.fxDenominator];
  if (values.some(value => !Number.isSafeInteger(value) || value <= 0 || value > 1000000000)) throw new Rejected('INVALID_COST_BOUND', 422);
  if (!Number.isSafeInteger(price.fixedMicroCurrency) || price.fixedMicroCurrency < 0 || price.fixedMicroCurrency > 1000000000) throw new Rejected('UNVERIFIED_FIXED_FEES', 422);
  if (price.currency === 'EUR' && price.fxNumerator !== price.fxDenominator) throw new Rejected('INVALID_EUR_CONVERSION', 422);
  // BigInt avoids under-reserving through fractional currency/rounding errors.
  const numerator = (BigInt(request.maxInputTokens) * BigInt(price.inputMicroCurrencyPerMillion) + BigInt(request.maxOutputTokens) * BigInt(price.outputMicroCurrencyPerMillion) + BigInt(price.fixedMicroCurrency) * 1000000n) * BigInt(price.fxNumerator);
  const denominator = 1000000n * BigInt(price.fxDenominator);
  const cost = (numerator + denominator - 1n) / denominator;
  if (cost < 1n || cost > BigInt(MAX_MONTHLY_MICRO_EUR)) throw new Rejected('BUDGET_INSUFFICIENT', 402);
  return Number(cost);
}
export function reserveBudget(sql, request, config, now) {
  if (config.coverageConfirmed !== true) throw new Rejected('PROJECT_AI_COVERAGE_UNVERIFIED', 409);
  if (!request || !HEX.test(request.reservationId) || !UUID.test(request.eventId) || !HEX.test(request.sourceRevision) || !['classify', 'extract', 'review'].includes(request.operation) || !['cloudflare', 'azure', 'openai'].includes(request.provider)) throw new Rejected('INVALID_RESERVATION', 422);
  const amount = estimateMicroEur(request, config.prices?.[request.provider], now);
  const cap = config.capMicroEur ?? MAX_MONTHLY_MICRO_EUR;
  if (!Number.isSafeInteger(cap) || cap < 1 || cap > MAX_MONTHLY_MICRO_EUR) throw new Rejected('INVALID_BUDGET_CAP', 422);
  const month = budgetMonth(now);
  const old = [...sql.exec('SELECT * FROM ai_reservations WHERE id=?', request.reservationId)][0];
  if (old) {
    if (old.amount !== amount || old.provider !== request.provider || old.month !== month || old.event_id !== request.eventId || old.source_revision !== request.sourceRevision || old.operation !== request.operation || old.model !== request.model || old.price_hash !== config.prices[request.provider].evidenceSha256) throw new Rejected('RESERVATION_CONFLICT', 409);
    return { reservationId: old.id, amountMicroEur: old.amount, duplicate: true, month };
  }
  if ([...sql.exec('SELECT id FROM ai_reservations WHERE event_id=? AND source_revision=? AND operation=?', request.eventId, request.sourceRevision, request.operation)].length) throw new Rejected('EVENT_CHARGE_ATTEMPT_ALREADY_EXISTS', 409);
  sql.exec('INSERT OR IGNORE INTO ai_months(month,spent,reserved) VALUES(?,0,0)', month);
  const ledger = [...sql.exec('SELECT * FROM ai_months WHERE month=?', month)][0];
  // Never clear old-month rows/reservations. New months have an independent cap;
  // delayed settlements are attributed to the original, immutable charge month.
  const used = ledger.spent + ledger.reserved;
  if (used + amount > cap) throw new Rejected('BUDGET_INSUFFICIENT', 402);
  const price = config.prices[request.provider];
  sql.exec('INSERT INTO ai_reservations(id,month,provider,model,event_id,source_revision,operation,amount,status,price_hash,currency,fx_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', request.reservationId, month, request.provider, request.model, request.eventId, request.sourceRevision, request.operation, amount, 'RESERVED', price.evidenceSha256, price.currency, price.currency === 'EUR' ? null : price.fxEvidenceSha256);
  sql.exec('UPDATE ai_months SET reserved=reserved+? WHERE month=?', amount, month);
  const alerts = [];
  for (const threshold of [75, 90]) if ((used + amount) * 100 >= cap * threshold) {
    const exists = [...sql.exec('SELECT threshold FROM ai_alerts WHERE month=? AND threshold=?', month, threshold)].length;
    if (!exists) { sql.exec('INSERT INTO ai_alerts(month,threshold) VALUES(?,?)', month, threshold); alerts.push(threshold); }
  }
  return { reservationId: request.reservationId, amountMicroEur: amount, month, alerts, remainingMicroEur: cap - used - amount, duplicate: false };
}
export function settleBudget(sql, id, actualMicroEur) {
  const reservation = [...sql.exec('SELECT * FROM ai_reservations WHERE id=?', id)][0];
  if (!reservation || !Number.isSafeInteger(actualMicroEur) || actualMicroEur < 0 || actualMicroEur > reservation.amount) throw new Rejected('USAGE_RECONCILIATION_REQUIRED', 409);
  if (reservation.status === 'SETTLED') {
    if (reservation.actual !== actualMicroEur) throw new Rejected('USAGE_CONFLICT', 409);
    return { duplicate: true };
  }
  sql.exec('UPDATE ai_months SET reserved=reserved-?,spent=spent+? WHERE month=?', reservation.amount, actualMicroEur, reservation.month);
  sql.exec('UPDATE ai_reservations SET status=?,actual=? WHERE id=?', 'SETTLED', actualMicroEur, id);
  return { duplicate: false };
}
export function claimBudgetCall(sql, id) {
  if (!HEX.test(id)) throw new Rejected('INVALID_RESERVATION', 422);
  const row = [...sql.exec('SELECT status,call_claimed FROM ai_reservations WHERE id=?', id)][0];
  if (!row || row.status !== 'RESERVED' || row.call_claimed) return { authorized: false };
  sql.exec('UPDATE ai_reservations SET call_claimed=1 WHERE id=?', id);
  return { authorized: true };
}
