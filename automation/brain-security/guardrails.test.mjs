import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createMonitor, verifySignedTask, admitTask, claimAuthorizedCall,
  settleVerifiedCall, recordFailedCall, GuardDenied } from './guardrails.mjs';
import { createSqlSecurityStore } from './sql-security-store.mjs';
import { createBrainLedgerAdapter } from './brain-ledger-adapter.mjs';

const SECRET = 'synthetic-secret-not-for-use-123456789012345678901';
const ID = '123e4567-e89b-42d3-a456-426614174000';
const HEX = 'a'.repeat(64);
const DATE = 1793900000000;
const keyring = { resolve: async id => id === 'test-v1'
  ? { secret: SECRET, permissions: ['ai.invoke'], sources: ['github'] } : null };
const nonces = () => {
  const used = new Set();
  return { claim: async (key, nonce) => {
    const id = key + nonce;
    if (used.has(id)) return false;
    used.add(id); return true;
  } };
};
async function signed(sourceType = 'github') {
  const data = { schemaVersion: 1, sourceType, correlationId: ID,
    charge: { reservationId: HEX, provider: 'cloudflare' } };
  const raw = JSON.stringify(data), nonce = 'b'.repeat(32), timestamp = '1793900000';
  const url = 'https://brain.invalid/internal/ai?x=1';
  const message = ['POST', '/internal/ai?x=1', timestamp, nonce, raw].join('\n');
  const secret = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await webcrypto.subtle.sign('HMAC', secret, new TextEncoder().encode(message)));
  const signature = [...bytes].map(x => x.toString(16).padStart(2, '0')).join('');
  const request = new Request(url, { method: 'POST', headers: {
    'x-archelaos-timestamp': timestamp, 'x-archelaos-nonce': nonce,
    'x-archelaos-signature': signature, 'x-archelaos-key-id': 'test-v1'
  } });
  return { request, raw };
}
async function context() {
  const s = await signed();
  return verifySignedTask(s.request, s.raw, keyring, nonces(), DATE);
}
function fake(overrides = {}) {
  const alerts = [], settlements = [], claims = [], logs = [], failures = [];
  let paused = false;
  const ports = {
    monitor: createMonitor(s => logs.push(s), () => DATE),
    readControls: async () => ({ globalPaused: paused, aiPaused: false, sourcePaused: { github: false } }),
    rate: { consume: async () => true },
    breaker: { before: async () => true, record: async (...args) => { failures.push(args); } },
    ledger: {
      reserve: async () => ({ amountMicroEur: 100000, month: '2026-11', alerts: [75, 90], providerAlerts: [] }),
      claim: async id => { claims.push(id); return { authorized: claims.length === 1 }; },
      settle: async (...args) => { settlements.push(args); return { duplicate: false }; }
    },
    alerts: { deliverOnce: async (id, threshold) => { alerts.push([id, threshold]); return true; } }
  };
  Object.assign(ports, overrides);
  return { ports, alerts, settlements, claims, logs, failures, pause: () => { paused = true; } };
}
const policy = { enabled: true, coverageConfirmed: true, mode: 'guarded', monthlyMicroEur: 20000000 };

test('HMAC exact body/path/query and durable replay enforcement', async () => {
  const s = await signed(), replay = nonces();
  assert.equal((await verifySignedTask(s.request, s.raw, keyring, replay, DATE)).source, 'github');
  await assert.rejects(() => verifySignedTask(s.request, s.raw, keyring, replay, DATE), e => e.code === 'REPLAY_DETECTED');
  await assert.rejects(() => verifySignedTask(s.request, s.raw + ' ', keyring, nonces(), DATE), e => e.code === 'UNAUTHORIZED');
  const altered = new Request('https://brain.invalid/internal/ai?x=2', { method: 'POST', headers: s.request.headers });
  await assert.rejects(() => verifySignedTask(altered, s.raw, keyring, nonces(), DATE), e => e.code === 'UNAUTHORIZED');
  await assert.rejects(() => verifySignedTask(s.request, s.raw, keyring, nonces(), DATE + 400000), e => e.code === 'UNAUTHORIZED');
});
test('authorization denies absent permissions, source mismatch and unavailable nonce storage', async () => {
  const s = await signed('gmail');
  await assert.rejects(() => verifySignedTask(s.request, s.raw, keyring, nonces(), DATE), e => e.code === 'FORBIDDEN_SCOPE');
  const original = await signed();
  const noRole = { resolve: async () => ({ secret: SECRET, permissions: [], sources: ['github'] }) };
  await assert.rejects(() => verifySignedTask(original.request, original.raw, noRole, nonces(), DATE), e => e.code === 'FORBIDDEN_SCOPE');
  await assert.rejects(() => verifySignedTask(original.request, original.raw, keyring,
    { claim: async () => { throw Error('unavailable'); } }, DATE), e => e.code === 'REPLAY_STORE_UNAVAILABLE');
});
test('fails closed on untrusted identity, disabled AI, controls, rate and breaker', async () => {
  const f = fake();
  assert.equal((await admitTask({ source: 'github' }, f.ports, policy)).code, 'UNTRUSTED_AUTH_CONTEXT');
  const ctx = await context();
  assert.equal((await admitTask(ctx, f.ports, {})).code, 'AI_DISABLED_OR_COVERAGE_UNVERIFIED');
  f.pause();
  assert.equal((await admitTask(ctx, f.ports, policy)).code, 'KILL_SWITCH_OR_CONTROLS_UNAVAILABLE');
  assert.equal((await admitTask(ctx, fake({ rate: { consume: async () => false } }).ports, policy)).code, 'RATE_LIMITED');
  assert.equal((await admitTask(ctx, fake({ breaker: { before: async () => false } }).ports, policy)).code, 'CIRCUIT_OPEN');
  assert.equal((await admitTask(ctx, fake({ readControls: async () => { throw Error('down'); } }).ports, policy)).code, 'KILL_SWITCH_OR_CONTROLS_UNAVAILABLE');
});
test('budget alerts precede claim and verified settlement; no double claim', async () => {
  const ctx = await context(), f = fake();
  assert.equal((await admitTask(ctx, f.ports, policy, () => DATE)).status, 'RESERVED');
  assert.deepEqual(f.alerts, [['ai:2026-11:75', 75], ['ai:2026-11:90', 90]]);
  assert.equal((await claimAuthorizedCall(ctx, f.ports)).authorized, true);
  assert.equal((await claimAuthorizedCall(ctx, f.ports)).authorized, false);
  assert.equal((await settleVerifiedCall(ctx, f.ports, { actualMicroEur: 100 })).settled, false);
  assert.equal((await settleVerifiedCall(ctx, f.ports, {
    billingEvidenceVerified: true, actualMicroEur: 100, latencyMs: 122
  }, () => DATE)).settled, true);
  assert.deepEqual(f.settlements, [[HEX, 100]]);
});
test('denies on missing alert ACK, duplicate charge, kill switch before claim', async () => {
  const ctx = await context();
  const missing = fake({ alerts: { deliverOnce: async () => false } });
  assert.equal((await admitTask(ctx, missing.ports, policy)).code, 'ALERT_DELIVERY_UNCONFIRMED');
  assert.equal((await claimAuthorizedCall(ctx, missing.ports)).authorized, false);
  const dup = fake({ ledger: { reserve: async () => ({ duplicate: true }) } });
  assert.equal((await admitTask(ctx, dup.ports, policy)).code, 'RESERVATION_RECONCILIATION_REQUIRED');
  const f = fake();
  await admitTask(ctx, f.ports, policy);
  f.pause();
  assert.equal((await claimAuthorizedCall(ctx, f.ports)).authorized, false);
});
test('unknown provider outcome holds reservation and reports breaker failure', async () => {
  const ctx = await context(), f = fake();
  await admitTask(ctx, f.ports, policy);
  await claimAuthorizedCall(ctx, f.ports);
  assert.deepEqual(await recordFailedCall(ctx, f.ports, () => DATE), { recorded: true, reservationHeld: true });
  assert.deepEqual(await recordFailedCall(ctx, f.ports, () => DATE), { recorded: false });
  assert.deepEqual(f.failures, [['provider:cloudflare', false, DATE]]);
  assert.equal(f.settlements.length, 0);
});
test('allowlisted structured logs cannot leak credentials, prompts or headers', () => {
  const lines = [], monitor = createMonitor(line => lines.push(line), () => DATE);
  monitor.record({ status: 'FAILED', code: 'PROVIDER_ERROR', correlationId: ID,
    receiptId: HEX, attempt: 2, latencyMs: 500, token: SECRET, prompt: 'private document' });
  assert.equal(lines[0].includes(SECRET), false);
  assert.equal(lines[0].includes('private'), false);
  assert.equal(monitor.snapshot().latencyBuckets.lt1000, 1);
  assert.throws(() => monitor.record({ status: 'FAILED', attempt: 99 }), GuardDenied);
});
function storage() {
  const db = new DatabaseSync(':memory:');
  return { sql: { exec(statement, ...args) {
    const q = db.prepare(statement);
    return /^\s*SELECT\b/i.test(statement) ? q.all(...args) : (q.run(...args), []);
  } }, transactionSync(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (err) { db.exec('ROLLBACK'); throw err; }
  } };
}
test('SQLite anti-replay, minute/day rate and single half-open circuit probe', () => {
  const s = createSqlSecurityStore(storage(), { minuteLimit: 2, dailyLimit: 4, breakerFailures: 2, breakerBackoffMs: 1000 });
  assert.equal(s.claim('test-v1', 'c'.repeat(32), 2000, 1000), true);
  assert.equal(s.claim('test-v1', 'c'.repeat(32), 2000, 1000), false);
  assert.equal(s.claim('test-v1', 'c'.repeat(32), 3000, 2000), true);
  assert.equal(s.consume('ai:github', 1000), true);
  assert.equal(s.consume('ai:github', 1000), true);
  assert.equal(s.consume('ai:github', 1000), false);
  assert.equal(s.record('provider:cloudflare', false, 1000), 'CLOSED');
  assert.equal(s.record('provider:cloudflare', false, 1000), 'OPEN');
  assert.equal(s.before('provider:cloudflare', 1000), false);
  assert.equal(s.before('provider:cloudflare', 2001), true);
  assert.equal(s.before('provider:cloudflare', 2001), false);
  assert.equal(s.record('provider:cloudflare', true, 2002), 'CLOSED');
  assert.equal(s.before('provider:cloudflare', 2003), true);
});
test('canonical ledger adapter rejects missing storage, unverified coverage and cap drift', () => {
  assert.throws(() => createBrainLedgerAdapter(null, {}), /CANONICAL/);
  assert.throws(() => createBrainLedgerAdapter(storage(), { coverageConfirmed: false }), /BUDGET/);
  assert.throws(() => createBrainLedgerAdapter(storage(), { coverageConfirmed: true, capMicroEur: 20000001 }), /BUDGET/);
});

test('missing source kill-switch coverage and duplicate signed admission fail closed', async () => {
  const ctx = await context();
  assert.equal((await admitTask(ctx,
    fake({ readControls: async () => ({ globalPaused: false, aiPaused: false, sourcePaused: {} }) }).ports,
    policy)).code, 'KILL_SWITCH_OR_CONTROLS_UNAVAILABLE');
  // A separate authenticated context demonstrates admission is one-shot even after success.
  const fresh = await context(), f = fake();
  assert.equal((await admitTask(fresh, f.ports, policy, () => DATE)).status, 'RESERVED');
  assert.equal((await admitTask(fresh, f.ports, policy, () => DATE)).code, 'TASK_ADMISSION_REPLAY');
  assert.equal(f.alerts.length, 2);
});
