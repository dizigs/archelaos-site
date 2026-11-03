import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Miniflare } from 'miniflare';
import { runGuardedAi } from '../src/ai_gateway.mjs';
let mf, directory;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'brain-ai-guard-')); mf = new Miniflare({ name: 'brain-ai-guard', modules: true, scriptPath: resolve('src/worker.mjs'), compatibilityDate: '2026-07-30', durableObjects: { BRAIN: { className: 'BrainCoordinator', useSQLite: true } }, durableObjectsPersist: directory, bindings: { TEST_BUDGET: 'true' } }); });
afterEach(async () => { await mf.dispose(); await rm(directory, { recursive: true, force: true }); });
async function fixture(amount = 1000000) {
  const ns = await mf.getDurableObjectNamespace('BRAIN'); const stub = ns.get(ns.idFromName('ledger'));
  const post = async (path, input) => { const r = await stub.fetch('https://internal/internal/budget/' + path, { method: 'POST', body: JSON.stringify(input) }); if (!r.ok) throw new Error('Synthetic ledger denial'); return r.json(); };
  const state = { calls: 0, stop: false, failAlert: false, failProvider: false };
  const request = { sourceType: 'staging', privateDataApproved: true, charge: { reservationId: 'a'.repeat(64), eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', sourceRevision: 'b'.repeat(64), operation: 'classify', model: 'synthetic-classifier', provider: 'cloudflare', maxInputTokens: 1000000, maxOutputTokens: 1 } };
  const costConfig = { coverageConfirmed: true, capMicroEur: 20000000, prices: { cloudflare: { verified: true, boundedBillingVerified: true, model: 'synthetic-classifier', currency: 'EUR', evidenceSha256: 'c'.repeat(64), sourceUrl: 'https://synthetic.invalid/pricing', expiresAt: '2027-01-01T00:00:00Z', inputMicroCurrencyPerMillion: amount - 1, outputMicroCurrencyPerMillion: 1, fxNumerator: 1, fxDenominator: 1 } } };
  const ports = { readControls: async () => ({ globalPaused: false, aiPaused: state.stop, sourcePaused: {} }), ledger: { reserve: (charge, config) => post('reserve', { request: charge, config, now: Date.parse('2026-11-03T00:00:00Z') }), claim: id => post('claim', { id }), settle: (id, actualMicroEur) => post('settle', { id, actualMicroEur }) }, alerts: { deliverOnce: async () => { if (state.failAlert) throw new Error('Synthetic alert sink offline'); } }, provider: { syntheticOnly: true, invokeSynthetic: async () => { state.calls++; if (state.failProvider) throw new Error('Synthetic timeout'); return { output: 'Synthetic private classification', billingEvidenceVerified: true, actualMicroEur: amount }; } } };
  return { state, request, ports, policy: { enabled: true, accountCoverageVerified: true, executionMode: 'synthetic-test-double', costConfig } };
}
test('default pause, missing account coverage and live mode make zero provider calls', async () => {
  const f = await fixture(); f.state.stop = true;
  await runGuardedAi(f.request, f.ports, f.policy); f.state.stop = false;
  await runGuardedAi(f.request, f.ports, { ...f.policy, accountCoverageVerified: false });
  await runGuardedAi(f.request, f.ports, { ...f.policy, executionMode: 'live' }); assert.equal(f.state.calls, 0);
});
test('real SQLite reservation precedes one synthetic call and replay cannot call again', async () => {
  const f = await fixture(); const first = await runGuardedAi(f.request, f.ports, f.policy);
  assert.equal(first.status, 'SYNTHETIC_OUTPUT_REQUIRES_PRIVATE_REVIEW'); assert.equal(first.externalProviderCalls, 0);
  await runGuardedAi(f.request, f.ports, f.policy); assert.equal(f.state.calls, 1);
});
test('alert delivery failure retains reservation and prevents the provider request', async () => {
  const f = await fixture(15000000); f.state.failAlert = true;
  assert.equal((await runGuardedAi(f.request, f.ports, f.policy)).reason, 'BUDGET_ALERT_SINK_UNAVAILABLE_RESERVATION_HELD');
  assert.equal(f.state.calls, 0);
});
test('unknown provider outcome is not retried or refunded on replay', async () => {
  const f = await fixture(); f.state.failProvider = true;
  assert.equal((await runGuardedAi(f.request, f.ports, f.policy)).reason, 'PROVIDER_OUTCOME_UNKNOWN_RESERVATION_HELD');
  await runGuardedAi(f.request, f.ports, f.policy); assert.equal(f.state.calls, 1);
});
test('ledger unavailable or insufficient balance denies before any provider invocation', async () => {
  const f = await fixture(); f.ports.ledger.reserve = async () => { throw new Error('Synthetic unavailable storage'); };
  await runGuardedAi(f.request, f.ports, f.policy); assert.equal(f.state.calls, 0);
});
