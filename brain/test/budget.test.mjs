import assert from 'node:assert/strict';
import { test } from 'node:test';
import { budgetMonth, estimateMicroEur } from '../src/budget.mjs';
const now = Date.parse('2026-11-03T00:00:00Z');
const price = { verified: true, boundedBillingVerified: true, fixedMicroCurrency: 0, effectiveAt: '2026-01-01T00:00:00Z', model: 'synthetic-classifier', currency: 'USD', evidenceSha256: 'a'.repeat(64), sourceUrl: 'https://example.org/synthetic-only', expiresAt: '2026-12-01T00:00:00Z', inputMicroCurrencyPerMillion: 1, outputMicroCurrencyPerMillion: 1, fxNumerator: 91, fxDenominator: 100, fxVerified: true, fxSourceUrl: 'https://example.org/synthetic-fx', fxEvidenceSha256: 'b'.repeat(64), fxEffectiveAt: '2026-11-02T00:00:00Z', fxExpiresAt: '2026-11-04T00:00:00Z' };
const bound = { model: 'synthetic-classifier', maxInputTokens: 1, maxOutputTokens: 1 };
test('fractional USD conversion always rounds upward, never below one microEUR', () => {
  assert.equal(estimateMicroEur(bound, price, now), 1);
  assert.equal(estimateMicroEur({ ...bound, maxInputTokens: 1000000, maxOutputTokens: 1000000 }, price, now), 2);
});
test('unknown currency, unverifiable quote, invalid token bounds fail before reservation', () => {
  for (const invalid of [{ ...price, currency: 'GBP' }, { ...price, verified: false }, { ...price, evidenceSha256: '' }, { ...price, fxDenominator: 0 }, { ...price, currency: 'EUR' }, { ...price, fxExpiresAt: '2026-11-01T00:00:00Z' }, { ...price, model: 'unrecognized' }]) assert.throws(() => estimateMicroEur(bound, invalid, now));
  for (const value of [0, -1, 0.5, Infinity, Number.MAX_SAFE_INTEGER]) assert.throws(() => estimateMicroEur({ ...bound, maxInputTokens: value }, price, now));
});
test('calendar month uses Europe/Athens at winter and daylight-saving boundaries', () => {
  assert.equal(budgetMonth(Date.parse('2026-11-30T21:59:59Z')), '2026-11');
  assert.equal(budgetMonth(Date.parse('2026-11-30T22:00:00Z')), '2026-12');
  assert.equal(budgetMonth(Date.parse('2026-07-31T21:00:00Z')), '2026-08');
});
test('fixed request fees are reserved with tokens and missing/future fee quotes are denied', () => {
  assert.equal(estimateMicroEur({ ...bound, maxInputTokens: 1000000, maxOutputTokens: 1000000 }, { ...price, fixedMicroCurrency: 2 }, now), 4);
  for (const invalid of [{ ...price, fixedMicroCurrency: undefined }, { ...price, effectiveAt: '2027-01-01T00:00:00Z' }, { ...price, fxSourceUrl: undefined }]) assert.throws(() => estimateMicroEur(bound, invalid, now));
});
