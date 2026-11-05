/**
 * Regression tests for the canonical-Brain-only integration boundary.
 * This module no longer owns SQLite, concurrency, file leases or a ledger.
 * Positive durable admission proof belongs to the actual Brain staging E2E.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (!process.env.ACCEPTANCE_SOURCE_DIR) throw Error('Missing pinned sources');
const file = resolve(process.env.ACCEPTANCE_SOURCE_DIR, 'integration',
  'automation/brain-worker-executors/integration/index.mjs');
const integration = await import(pathToFileURL(file).href);
const SHA = 'c'.repeat(40);
const id = n => '22222222-2222-4222-8222-' + String(n).padStart(12, '0');

test('no competing local dispatcher, coordinator or billable ledger is exported', () => {
  assert.equal('SqlCoordinator' in integration, false);
  assert.equal('LocalLedger' in integration, false);
  let calls = 0;
  const ports = {
    brain: { ledger: { reserve: () => { calls++; } } },
    builders: { A: { execute: () => { calls++; } } }
  };
  const result = integration.runIntegration({}, ports, { enabled: true,
    executionMode: 'staging-approved', centralLedgerConfirmed: true });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.code, 'CANONICAL_BRAIN_ONLY');
  assert.equal(result.providerCalls, 0);
  assert.equal(result.mergeAllowed, false);
  assert.equal(result.deployAllowed, false);
  assert.equal(calls, 0);
});

test('immutable task scope cannot be silently widened or duplicated', () => {
  const input = { taskId: id(1), receiptId: id(901), commitSha: SHA,
    type: 'build', lane: 'A', paths: ['automation/scope-a.mjs'] };
  const normalized = integration.normalizeIntent(input);
  assert.equal(Object.isFrozen(normalized), true);
  assert.equal(Object.isFrozen(normalized.paths), true);
  assert.throws(() => normalized.paths.push('automation/second.mjs'), TypeError);
  assert.throws(() => integration.normalizeIntent({
    ...input, paths: ['automation/scope-a.mjs', 'automation/scope-a.mjs']
  }), { code: 'INVALID_FILE_SCOPE' });
  assert.throws(() => integration.normalizeIntent({
    ...input, production: true
  }), { code: 'FORBIDDEN_MUTATION' });
  assert.equal(integration.overlaps('automation/scopes/', 'automation/scopes/file.mjs'), true);
  assert.equal(integration.overlaps('automation/a.mjs', 'automation/b.mjs'), false);
});

test('EUR20 policy constant does not itself authorize a charge', () => {
  assert.equal(integration.MONTHLY_CAP_MICRO_EUR, 20_000_000);
  assert.equal(integration.runIntegration().code, 'CANONICAL_BRAIN_ONLY');
  assert.equal(integration.evaluateTestingGate(SHA, []).passed, false);
  assert.equal(integration.evaluateTestingGate(SHA, [{
    workflow: 'rebuild-check.yml', headSha: SHA,
    repository: integration.REPOSITORY, runId: 5, runAttempt: 1,
    status: 'completed', conclusion: 'success',
    provenanceVerified: false, jobs: []
  }]).passed, false);
});
