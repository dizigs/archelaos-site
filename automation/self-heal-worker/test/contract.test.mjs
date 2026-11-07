import assert from 'node:assert/strict';
import { test } from 'node:test';
import { webcrypto } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { verifySignedRecoveryEvent } from '../src/contract.mjs';
import { RecoveryLedger } from '../src/recovery.mjs';

const NOW = Date.parse('2026-11-05T21:00:00Z');
const SECRET = 'test-only-long-HMAC-key-123456789012345678901234567890';
const finding = { schemaVersion: 1, source: 'github_actions', repository: 'dizigs/archelaos-site',
  code: 'CI_FAILURE', resource: '/ci', commit: 'a'.repeat(40),
  observedAt: new Date(NOW).toISOString(), evidenceId: 'actions:42022399427' };
function ledger() {
  const db = new DatabaseSync(':memory:');
  const storage = { sql: { exec(sql, ...args) {
    const q = db.prepare(sql);
    return /^\s*SELECT\b/i.test(sql) ? q.all(...args) : (q.run(...args), []);
  } }, transactionSync(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (err) { db.exec('ROLLBACK'); throw err; }
  } };
  return { db, recovery: new RecoveryLedger(storage) };
}
async function sign({ payload = JSON.stringify(finding), nonce = 'b'.repeat(32),
  issuedAtMs = NOW, scope = 'selfheal.recover', issuer = 'canonical-brain' } = {}) {
  const message = [scope, issuer, String(issuedAtMs), nonce, payload].join('\n');
  const key = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const data = new Uint8Array(await webcrypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
  return { schemaVersion: 1, scope, issuer, issuedAtMs, nonce, payload,
    signature: [...data].map(byte => byte.toString(16).padStart(2, '0')).join('') };
}
test('private signed event validates actual bytes and single-use durable nonce', async () => {
  const { db, recovery } = ledger(), event = await sign();
  const nonces = { claim: (...args) => recovery.claimEventNonce(...args) };
  assert.deepEqual(await verifySignedRecoveryEvent(event, SECRET, nonces, NOW), finding);
  await assert.rejects(() => verifySignedRecoveryEvent(event, SECRET, nonces, NOW),
    e => e.code === 'RECOVERY_REPLAY_DETECTED');
  // Same SQLite store after logical restart; no in-memory replay window.
  const restarted = new RecoveryLedger(recovery.storage);
  await assert.rejects(() => verifySignedRecoveryEvent(event, SECRET,
    { claim: (...args) => restarted.claimEventNonce(...args) }, NOW),
  e => e.code === 'RECOVERY_REPLAY_DETECTED');
  db.close();
});
test('future-dated signature nonce remains reserved for its full valid replay window', async () => {
  const { db, recovery } = ledger();
  const event = await sign({ issuedAtMs: NOW + 300_000, nonce: 'c'.repeat(32) });
  const nonces = { claim: (...args) => recovery.claimEventNonce(...args) };
  assert.deepEqual(await verifySignedRecoveryEvent(event, SECRET, nonces, NOW), finding);
  // A 5-minute nonce TTL based on *receipt time* would incorrectly accept this replay.
  await assert.rejects(() => verifySignedRecoveryEvent(event, SECRET, nonces, NOW + 300_002),
    e => e.code === 'RECOVERY_REPLAY_DETECTED');
  await assert.rejects(() => verifySignedRecoveryEvent(event, SECRET, nonces, NOW + 600_001),
    e => e.code === 'INVALID_RECOVERY_ENVELOPE');
  db.close();
});
test('unsigned raw finding, altered signed fields, stale and forged events are denied', async () => {
  const { db, recovery } = ledger(), nonces = { claim: (...args) => recovery.claimEventNonce(...args) };
  const signed = await sign();
  const cases = [finding, { ...signed, payload: signed.payload + ' ' },
    { ...signed, scope: 'selfheal.deploy' }, { ...signed, issuer: 'outside-brain' },
    { ...signed, issuedAtMs: NOW - 300_001 }, { ...signed, extra: 'ignored' },
    { ...signed, signature: '0'.repeat(64) }];
  for (const event of cases)
    await assert.rejects(() => verifySignedRecoveryEvent(event, SECRET, nonces, NOW));
  await assert.rejects(() => verifySignedRecoveryEvent(signed, '', nonces, NOW),
    e => e.code === 'RECOVERY_AUTH_UNAVAILABLE');
  await assert.rejects(() => verifySignedRecoveryEvent(signed, SECRET,
    { claim: () => { throw Error('storage down'); } }, NOW),
  e => e.code === 'RECOVERY_NONCE_STORE_UNAVAILABLE');
  const malformed = await sign({ payload: JSON.stringify({ ...finding, rawLog: 'injected' }) });
  await assert.rejects(() => verifySignedRecoveryEvent(malformed, SECRET, nonces, NOW),
    e => e.code === 'INVALID_SIGNED_FINDING');
  db.close();
});
test('nonce capacity and expiry fail closed without accepting unverified writers', () => {
  const { db, recovery } = ledger();
  assert.equal(recovery.claimEventNonce('canonical-brain:selfheal.recover', 'a'.repeat(32), NOW+300001, NOW), true);
  assert.equal(recovery.claimEventNonce('canonical-brain:selfheal.recover', 'a'.repeat(32), NOW+300001, NOW), false);
  assert.throws(() => recovery.claimEventNonce('canonical-brain:selfheal.recover', 'a'.repeat(32), NOW+300001, NOW+300002));
  assert.throws(() => recovery.claimEventNonce('invalid', 'b'.repeat(32), NOW+300001, NOW));
  db.close();
});
