import { Rejected, HEX } from './contract.mjs';
export const MAX_MONTHLY_MICRO_EUR = 20000000;
export function budgetMonth(at) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit' }).formatToParts(new Date(at));
  return parts.find(p => p.type === 'year').value + '-' + parts.find(p => p.type === 'month').value;
}
export function estimateMicroEur(request, price, now) {
  if (!price || price.verified !== true || !['EUR', 'USD'].includes(price.currency) || !HEX.test(price.evidenceSha256) || !/^https:\/\/[a-z0-9.-]+\/[^\s]*$/.test(price.sourceUrl) || !Number.isFinite(Date.parse(price.expiresAt)) || Date.parse(price.expiresAt) <= now) throw new Rejected('PRICING_UNVERIFIED', 409);
  const values = [request.maxInputTokens, request.maxOutputTokens, price.inputMicroCurrencyPerMillion, price.outputMicroCurrencyPerMillion, price.fxNumerator, price.fxDenominator];
  if (values.some(value => !Number.isSafeInteger(value) || value <= 0 || value > 1000000000)) throw new Rejected('INVALID_COST_BOUND', 422);
  if (price.currency === 'EUR' && price.fxNumerator !== price.fxDenominator) throw new Rejected('INVALID_EUR_CONVERSION', 422);
  // BigInt avoids under-reserving through fractional currency/rounding errors.
  const numerator = (BigInt(request.maxInputTokens) * BigInt(price.inputMicroCurrencyPerMillion) + BigInt(request.maxOutputTokens) * BigInt(price.outputMicroCurrencyPerMillion)) * BigInt(price.fxNumerator);
  const denominator = 1000000n * BigInt(price.fxDenominator);
  const cost = (numerator + denominator - 1n) / denominator;
  if (cost < 1n || cost > BigInt(MAX_MONTHLY_MICRO_EUR)) throw new Rejected('BUDGET_INSUFFICIENT', 402);
  return Number(cost);
}
export function reserveBudget(sql, request, config, now) {
  if (config.coverageConfirmed !== true) throw new Rejected('PROJECT_AI_COVERAGE_UNVERIFIED', 409);
  if (!request || !HEX.test(request.reservationId) || !['cloudflare', 'azure', 'openai'].includes(request.provider)) throw new Rejected('INVALID_RESERVATION', 422);
  const amount = estimateMicroEur(request, config.prices?.[request.provider], now);
  const cap = config.capMicroEur ?? MAX_MONTHLY_MICRO_EUR;
  if (!Number.isSafeInteger(cap) || cap < 1 || cap > MAX_MONTHLY_MICRO_EUR) throw new Rejected('INVALID_BUDGET_CAP', 422);
  const month = budgetMonth(now);
  const old = [...sql.exec('SELECT * FROM ai_reservations WHERE id=?', request.reservationId)][0];
  if (old) {
    if (old.amount !== amount || old.provider !== request.provider || old.month !== month) throw new Rejected('RESERVATION_CONFLICT', 409);
    return { reservationId: old.id, amountMicroEur: old.amount, duplicate: true, month };
  }
  sql.exec('INSERT OR IGNORE INTO ai_months(month,spent,reserved) VALUES(?,0,0)', month);
  const ledger = [...sql.exec('SELECT * FROM ai_months WHERE month=?', month)][0];
  // Outstanding reservations from earlier months stay charged against available
  // balance until reconciled; a timeout/month rollover cannot silently free money.
  const unresolved = [...sql.exec('SELECT COALESCE(SUM(amount),0) AS amount FROM ai_reservations WHERE month<>? AND status=?', month, 'RESERVED')][0].amount;
  const used = ledger.spent + ledger.reserved + unresolved;
  if (used + amount > cap) throw new Rejected('BUDGET_INSUFFICIENT', 402);
  sql.exec('INSERT INTO ai_reservations(id,month,provider,amount,status) VALUES(?,?,?,?,?)', request.reservationId, month, request.provider, amount, 'RESERVED');
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
