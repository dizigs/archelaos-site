/**
 * Fail-closed restart / signature regression tests. No synthetic local SQLite
 * coordinator: canonical durable restart must be attested by the Brain owner.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (!process.env.ACCEPTANCE_SOURCE_DIR) throw Error('Missing pinned source');
const m = await import(pathToFileURL(resolve(process.env.ACCEPTANCE_SOURCE_DIR,
  'integration', 'automation/brain-worker-executors/integration/index.mjs')).href);
const sha = 'a'.repeat(40), now = Date.now();
const id = n => '88888888-8888-4888-8888-' + String(n).padStart(12, '0');
const task = n => m.normalizeIntent({
  taskId: id(n), receiptId: id(n + 100), type: 'build',
  lane: 'A', commitSha: sha, paths: ['automation/scope-' + n + '.mjs']
});

test('tampered signed receipt, invalid signature and expired timestamp are denied', async () => {
  const t = task(6), raw = JSON.stringify({ taskId: t.taskId, approved: true }),
    key = 'synthetic-no-real-key-material-more-than-forty-three-bytes',
    enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', k,
    enc.encode(now + '\n' + raw)));
  const signature = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  const signed = { raw, timestampMs: now, signature };
  assert.equal((await m.verifySignedBrainEnvelope(signed, key, now)).taskId, t.taskId);
  await assert.rejects(m.verifySignedBrainEnvelope({ ...signed, raw: raw + ' ' }, key, now),
    { code: 'BRAIN_SIGNATURE_INVALID' });
  await assert.rejects(m.verifySignedBrainEnvelope({ ...signed, signature: '0'.repeat(64) }, key, now),
    { code: 'BRAIN_SIGNATURE_INVALID' });
  await assert.rejects(m.verifySignedBrainEnvelope(signed, key, now + 600000),
    { code: 'BRAIN_SIGNATURE_INVALID' });
});

test('unknown provider outcomes are never promoted by legacy integration', () => {
  let providerCalls = 0, ledgerWrites = 0;
  const ports = {
    builders: { A: { execute: () => { providerCalls++; } } },
    brain: { ledger: { reserve: () => { ledgerWrites++; } } }
  };
  for (const outcome of ['UNKNOWN', 'LOST_ACK', 'RESTARTED']) {
    const result = m.runIntegration(task(7), ports, {
      enabled: true, simulatedProviderOutcome: outcome,
      executionMode: 'staging-approved', centralLedgerConfirmed: true
    });
    assert.equal(result.code, 'CANONICAL_BRAIN_ONLY');
    assert.equal(result.mergeAllowed, false);
    assert.equal(result.deployAllowed, false);
  }
  assert.equal(providerCalls, 0);
  assert.equal(ledgerWrites, 0);
});

test('no synthetic restart fixture can substitute for persistent Brain receipt evidence', () => {
  assert.equal('SqlCoordinator' in m, false);
  assert.equal(m.evaluateTestingGate(sha, []).passed, false);
  assert.equal(m.runIntegration(task(8), {}, { enabled: true }).status, 'BLOCKED');
});
