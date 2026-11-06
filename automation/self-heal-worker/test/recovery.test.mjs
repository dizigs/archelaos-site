import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { RecoveryLedger, recover, severityFor, MAX_RECOVERY_ATTEMPTS, RETRY_BACKOFF_MS } from '../src/recovery.mjs';

const NOW = Date.parse('2026-11-05T18:00:00Z');
const RECEIPT_ID = 'b101a6e9-3078-4f7e-8e0a-8bbb74dc99bf';
const finding = (overrides = {}) => ({
  repository: 'dizigs/archelaos-site', source: 'github_actions',
  code: 'CI_FAILURE', resource: '/ci', commit: 'a'.repeat(40),
  evidenceId: 'actions:42022399427', ...overrides
});
const verified = (f, overrides = {}) => ({
  issuer: 'central-brain', verified: true, repository: f.repository,
  code: f.code, resource: f.resource, commit: f.commit, evidenceId: f.evidenceId,
  receiptId: RECEIPT_ID, expiresAtMs: NOW + 120000,
  source: f.source, bindingScope: 'selfheal.recover', provenanceVerified: true,
  killSwitchesVerified: true, incidentAuthorized: true, repairWritesAllowed: false,
  paused: false, builderRoutingAllowed: true, readOnlyProbeAllowed: true,
  requiredCi: f.code === 'CI_FAILURE'
    ? { verdict: 'FAILED', required: true, commit: f.commit,
      evidenceId: f.evidenceId, runAttempt: 1, chainHaltReadback: true } : undefined,
  ...overrides
});
function fixture() {
  const db = new DatabaseSync(':memory:');
  const storage = {
    sql: { exec(query, ...params) {
      const stmt = db.prepare(query);
      if (/^\s*SELECT\b/i.test(query)) return stmt.all(...params);
      stmt.run(...params); return [];
    } },
    transactionSync(fn) { db.exec('BEGIN IMMEDIATE'); try {
      const value = fn(); db.exec('COMMIT'); return value;
    } catch (err) { db.exec('ROLLBACK'); throw err; } }
  };
  return { db, ledger: new RecoveryLedger(storage) };
}
test('severity is deterministic: security P0, required CI P1, known HTML P2', () => {
  assert.equal(severityFor('SONAR_SECURITY_FINDING'), 'P0');
  assert.equal(severityFor('CI_FAILURE'), 'P1');
  assert.equal(severityFor('HTML_ESCAPED_TEXT'), 'P2');
  assert.throws(() => severityFor('MAKE_CHANGES'), /UNRECOGNIZED_INCIDENT/);
  assert.equal(MAX_RECOVERY_ATTEMPTS, 3);
  assert.deepEqual([...RETRY_BACKOFF_MS], [30000, 120000]);
});
test('untrusted/missing Brain authorization never claims or executes', async () => {
  const { ledger, db } = fixture();
  let calls = 0;
  const f = finding();
  const ports = { verifyBrainReceipt: async () => verified(f, { commit: 'b'.repeat(40) }),
    routeBuilderReview: async () => { calls++; } };
  assert.equal((await recover(f, ledger, ports, NOW)).reason, 'BRAIN_PROOF_UNVERIFIED');
  assert.equal((await recover(f, ledger, {}, NOW)).reason, 'BRAIN_PORT_MISSING');
  assert.equal((await recover(finding({ repository: 'evil/repo' }), ledger, ports, NOW)).reason, 'UNTRUSTED_FINDING');
  assert.equal(calls, 0);
  assert.equal(db.prepare('SELECT count(*) as n FROM recoveries').get().n, 0);
  db.close();
});

test('forged or stale Brain receipt never creates an incident or routes a review', async () => {
  const { ledger, db } = fixture();
  const f = finding();
  let routed = 0;
  for (const unsafe of [
    { issuer: 'untrusted-service' }, { verified: false },
    { expiresAtMs: NOW }, { expiresAtMs: NOW - 1 },
    { expiresAtMs: NOW + 300_001 },
    { receiptId: 'untrusted-receipt' },
    { evidenceId: 'actions:999999' },
    { incidentAuthorized: false },
    { requiredCi: { verdict: 'FAILED', required: true,
      commit: f.commit, evidenceId: f.evidenceId, runAttempt: 0,
      chainHaltReadback: true } }
  ]) {
    const result = await recover(f, ledger, {
      verifyBrainReceipt: async () => verified(f, unsafe),
      routeBuilderReview: async () => { routed++; }
    }, NOW);
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.reason, 'BRAIN_PROOF_UNVERIFIED');
    assert.equal(result.chainHalted, true);
  }
  assert.equal(routed, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM recoveries').get().n, 0);
  db.close();
});

test('verified failed CI halts chain and routes exactly one review-only Brain intent', async () => {
  const { ledger, db } = fixture();
  const f = finding();
  let calls = 0;
  const ports = { verifyBrainReceipt: async () => verified(f),
    routeBuilderReview: async t => { calls++; assert.deepEqual({ code: t.code, autoMerge: t.autoMerge, deploy: t.deploy, retryBudget: t.retryBudget, reviewOnly: t.reviewOnly },
      { code: 'CI_FAILURE', autoMerge: false, deploy: false, retryBudget: 0, reviewOnly: true });
      return { accepted: true, receiptId: RECEIPT_ID, reviewOnly: true,
        verifiedReadback: true, ledgerOwner: 'canonical-brain', requiredCiHaltedReadback: true }; } };
  const one = await recover(f, ledger, ports, NOW);
  assert.equal(one.status, 'ROUTED'); assert.equal(one.chainHalted, true);
  assert.equal(one.autoMergeAllowed, false);
  assert.equal((await recover(f, ledger, ports, NOW+10)).status, 'REPLAY_BLOCKED');
  assert.equal(calls, 1);
  db.close();
});
test('read-only transient health checks retry with durable backoff and open circuit after 3', async () => {
  const { ledger, db } = fixture();
  const f = finding({ source: 'site_watch', code: 'LIVE_HEALTH_FAILURE', resource: '/news.html' });
  let probes = 0;
  const ports = { verifyBrainReceipt: async () => verified(f, { expiresAtMs: NOW + 3 * 60_000 }),
    readOnlyProbe: async p => { probes++; assert.equal(p.readOnly, true);
      return { verified: true, readOnly: true, resource: p.resource, health: 'TRANSIENT' }; } };
  const one = await recover(f, ledger, ports, NOW);
  assert.deepEqual([one.status,one.attempt,one.nextAttemptAt], ['WAITING',1,NOW+30000]);
  assert.equal((await recover(f, ledger, ports, NOW+29999)).status, 'BACKOFF');
  const two = await recover(f, ledger, ports, NOW+30000);
  assert.deepEqual([two.status,two.attempt,two.nextAttemptAt], ['WAITING',2,NOW+150000]);
  const three = await recover(f, ledger, ports, NOW+150000);
  assert.equal(three.status, 'CIRCUIT_OPEN'); assert.equal(three.attempt, 3);
  assert.equal((await recover(f, ledger, ports, NOW+151000)).status, 'REPLAY_BLOCKED');
  assert.equal(probes, 3);
  db.close();
});
test('verified recovery proof closes incident without any GitHub mutation', async () => {
  const { ledger, db } = fixture();
  const f = finding({ source:'site_watch', code:'LIVE_HEALTH_FAILURE', resource:'/news.html' });
  const result = await recover(f, ledger, { verifyBrainReceipt: async () => verified(f),
    readOnlyProbe: async () => ({ verified:true, readOnly:true, resource:'/news.html', health:'HEALTHY' }) }, NOW);
  assert.equal(result.status, 'RECOVERED'); assert.equal(result.chainHalted, false);
  assert.equal(result.deployAllowed, false);
  db.close();
});
test('ambiguous timeout is quarantined, never retried automatically', async () => {
  const { ledger, db } = fixture();
  const f = finding({ source:'site_watch',code:'LIVE_HEALTH_FAILURE',resource:'/news.html' });
  let calls = 0;
  const ports = { verifyBrainReceipt: async () => verified(f),
    readOnlyProbe: async () => { calls++; throw new Error('network timeout'); } };
  assert.equal((await recover(f, ledger, ports, NOW)).status, 'UNKNOWN');
  assert.equal((await recover(f, ledger, ports, NOW+60000)).status, 'REPLAY_BLOCKED');
  assert.equal(calls, 1);
  db.close();
});
test('security and unverified deployment require human intervention', async () => {
  const { ledger, db } = fixture();
  let calls=0;
  for (const code of ['SONAR_SECURITY_FINDING','DEPLOYMENT_UNVERIFIED']) {
    const f = finding({ code });
    const result = await recover(f, ledger, { verifyBrainReceipt: async () => verified(f),
      routeBuilderReview: async () => { calls++; } }, NOW);
    assert.equal(result.status, 'HUMAN_REQUIRED');
    assert.equal(result.chainHalted, true);
  }
  assert.equal(calls,0);
  db.close();
});
test('same commit new evidence cannot bypass circuit via fingerprint collision', async () => {
  const { ledger, db } = fixture();
  const f = finding({ source:'site_watch', code:'LIVE_HEALTH_FAILURE', resource:'/news.html' });
  const ports = { verifyBrainReceipt: async f1 => verified(f1),
    readOnlyProbe: async () => ({ verified:true, readOnly:true, resource:'/news.html', health:'TRANSIENT' }) };
  await recover(f, ledger, ports, NOW);
  const conflict = await recover(finding({ source:'site_watch', code:'LIVE_HEALTH_FAILURE', resource:'/news.html', evidenceId:'actions:42022399428' }), ledger, ports, NOW+1000);
  assert.equal(conflict.reason,'RECOVERY_FINGERPRINT_CONFLICT');
  db.close();
});

test('required CI halt, missing provenance and emergency pause fail closed before routing', async () => {
  const { ledger, db } = fixture();
  const f = finding(); let routed = 0;
  for (const attrs of [
    { requiredCi: { verdict: 'SUCCESS', required: true, commit: f.commit,
      evidenceId: f.evidenceId, runAttempt: 1, chainHaltReadback: true } },
    { requiredCi: { verdict: 'FAILED', required: true, commit: f.commit,
      evidenceId: f.evidenceId, runAttempt: 1, chainHaltReadback: false } },
    { provenanceVerified: false }, { paused: true }, { killSwitchesVerified: false },
    { bindingScope: 'selfheal.deploy' }, { source: 'site_watch' }
  ]) {
    const result = await recover(f, ledger, {
      verifyBrainReceipt: async () => verified(f, attrs),
      routeBuilderReview: async () => { routed++; }
    }, NOW);
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.chainHalted, true);
  }
  assert.equal(routed, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM recoveries').get().n, 0);
  db.close();
});
test('renewed valid receipt does not reset durable health circuit', async () => {
  const { ledger, db } = fixture();
  const f = finding({ source: 'site_watch', code: 'LIVE_HEALTH_FAILURE', resource: '/news.html' });
  let nonce = 0, calls = 0;
  const ports = {
    verifyBrainReceipt: async () => verified(f, {
      receiptId: 'b101a6e9-3078-4f7e-8e0a-' + (++nonce).toString(16).padStart(12, '0'),
      expiresAtMs: NOW + 5 * 60_000
    }),
    readOnlyProbe: async () => { calls++; return {
      verified: true, readOnly: true, resource: '/news.html', health: 'TRANSIENT'
    }; }
  };
  assert.equal((await recover(f, ledger, ports, NOW)).status, 'WAITING');
  assert.equal((await recover(f, ledger, ports, NOW+30000)).status, 'WAITING');
  assert.equal((await recover(f, ledger, ports, NOW+150000)).status, 'CIRCUIT_OPEN');
  assert.equal(calls, 3);
  db.close();
});
test('lost routing readback remains UNKNOWN across Durable Object restart', async () => {
  const { ledger, db } = fixture();
  const f = finding(); let routeCalls = 0;
  const ports = { verifyBrainReceipt: async () => verified(f),
    routeBuilderReview: async () => { routeCalls++; throw Error('lost response'); } };
  assert.equal((await recover(f, ledger, ports, NOW)).status, 'UNKNOWN');
  const restarted = new RecoveryLedger(ledger.storage);
  assert.equal((await recover(f, restarted, ports, NOW+1000)).status, 'REPLAY_BLOCKED');
  assert.equal(routeCalls, 1);
  db.close();
});
test('staging SHA drift and unsafe review readback never claim success', async () => {
  const { ledger, db } = fixture();
  const f = finding();
  const wrongSha = await recover(f, ledger, {
    verifyBrainReceipt: async () => verified(f, { commit: 'f'.repeat(40) })
  }, NOW);
  assert.equal(wrongSha.status, 'BLOCKED');
  const result = await recover(f, ledger, {
    verifyBrainReceipt: async () => verified(f),
    routeBuilderReview: async () => ({
      accepted: true, receiptId: RECEIPT_ID, reviewOnly: true, verifiedReadback: true,
      ledgerOwner: 'second-ledger', requiredCiHaltedReadback: true
    })
  }, NOW);
  assert.equal(result.status, 'UNKNOWN');
  assert.equal((await recover(f, ledger, { verifyBrainReceipt: async () => verified(f) }, NOW+1)).status, 'REPLAY_BLOCKED');
  db.close();
});
