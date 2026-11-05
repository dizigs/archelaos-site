import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  AppsScriptInventoryService, AuditLogger, LeaseManager, LIMITATION,
  executeGuardedWrite, redactSecrets
} from './index.mjs';
import { contentHash } from '../files.mjs';
globalThis.crypto ??= webcrypto;

const scriptId = 'archelaos_test_script_project_12345';
const projectTitle = 'Archelaos museum automation';
const files = [
  { name: 'Code', type: 'SERVER_JS', source: 'function run() { return 1; }\r\n' },
  { name: 'MuseumApprovals', type: 'SERVER_JS', source: 'function check() {}' },
  { name: 'CloudflareBridge', type: 'SERVER_JS', source: 'function bridge() {}' },
  { name: 'Web', type: 'HTML', source: '<p>ok</p>' },
  { name: 'appsscript', type: 'JSON', source: JSON.stringify({ timeZone: 'Europe/Athens', webapp: { access: 'ANYONE' } }) }
];
const fakeStore = (now = () => Date.now()) => {
  let snapshot = null;
  const leases = new Map();
  const logs = [];
  return {
    logs,
    upsertInventorySnapshot(s) { snapshot = structuredClone(s); },
    getInventorySnapshot() { return snapshot; },
    insertAuditLog(e) { logs.push(e); },
    getLease(id) { return leases.get(id) ?? null; },
    // Atomic emulation; production store uses DO storage.transactionSync.
    tryAcquireLease(rec) {
      const old = leases.get(rec.scriptId);
      if (old && old.expiresAt > now()) return false;
      leases.set(rec.scriptId, { ...rec }); return true;
    },
    renewLease(id, tokenHash, expiresAt) {
      const old = leases.get(id);
      if (!old || old.expiresAt <= now() || old.tokenHash !== tokenHash) return false;
      old.expiresAt = expiresAt; return true;
    },
    releaseLease(id, tokenHash) {
      const old = leases.get(id);
      if (!old || old.tokenHash !== tokenHash) return false;
      return leases.delete(id);
    }
  };
};
const fakeProvider = (givenFiles = files, extra = {}) => ({
  metadata: async () => ({ scriptId, title: projectTitle, updateTime: '2026-11-05T10:00:00Z', ...extra }),
  content: async () => ({ scriptId, files: givenFiles })
});
const makeInventory = (provider, store) => new AppsScriptInventoryService({
  projectId: scriptId, projectTitle, provider, store,
  auditLogger: new AuditLogger({ store }),
  readDeployments: async () => [{
    deploymentId: 'AKfycb_safe', deploymentConfig: { versionNumber: 5, description: 'SENSITIVE' },
    token: 'ya29.secret'
  }]
});

test('inventory uses the exact PR124 project-scoped content hash', async () => {
  const store = fakeStore();
  const result = await makeInventory(fakeProvider(), store).sync();
  assert.equal(result.sourceHash, await contentHash(scriptId, files));
  assert.equal(result.fileCount, files.length);
  assert.equal(result.scriptId, scriptId);
  assert.equal(result.triggerVisibility, 'NOT_VERIFIED');
  assert.equal(result.installableTriggersComplete, false);
  assert.match(result.limitationNotice, /EXTERNAL_OAUTH_LOCK/);
});
test('webapp manifest configuration is NOT reported as an installable trigger', async () => {
  const store = fakeStore();
  const result = await makeInventory(fakeProvider(), store).sync();
  assert.deepEqual(result.entrypoints, [{ kind: 'WEBAPP_CONFIGURATION' }]);
  assert.equal(result.deployments[0].versionNumber, 5);
  assert.equal(result.deployments[0].description, undefined);
  assert.doesNotMatch(JSON.stringify(store.getInventorySnapshot()), /ya29|SENSITIVE|function run/);
});
test('cross-project content refuses before inventory persistence', async () => {
  const store = fakeStore();
  const provider = { ...fakeProvider(), content: async () => ({ scriptId: 'other_project', files }) };
  await assert.rejects(() => makeInventory(provider, store).sync(), { code: 'INVENTORY_PROJECT_IDENTITY_MISMATCH' });
  assert.equal(store.getInventorySnapshot(), null);
});
test('unexpected project title refuses, avoiding a replaced project binding', async () => {
  const store = fakeStore();
  await assert.rejects(() => makeInventory(fakeProvider(files, { title: 'Not Archelaos' }), store).sync(),
    { code: 'INVENTORY_PROJECT_IDENTITY_MISMATCH' });
});
test('incomplete source refuses instead of hashing a partial project', async () => {
  const store = fakeStore();
  await assert.rejects(() => makeInventory(fakeProvider(files.slice(0, 2)), store).sync(),
    { code: 'COMPLETE_PROJECT_CONTENT_REQUIRED' });
});
test('source drift is detected; read-only report never claims external writer exclusion', async () => {
  const store = fakeStore();
  const inventory = makeInventory(fakeProvider(), store);
  const originalHash = await contentHash(scriptId, files);
  await inventory.sync();
  const changedFiles = files.map(f => f.name === 'Code' ? { ...f, source: 'function run(){ return 2; }' } : f);
  const changed = makeInventory(fakeProvider(changedFiles), store);
  const report = await changed.inspectDrift({ expectedSourceHash: originalHash });
  assert.equal(report.driftDetected, true);
  assert.ok(report.signals.includes('REMOTE_SOURCE_HASH_DRIFT'));
  assert.equal(report.externalWriterExclusionVerified, false);
  assert.equal(report.triggerInventoryVerified, false);
});
test('missing expected hash fails closed in drift probe', async () => {
  const store = fakeStore();
  await assert.rejects(() => makeInventory(fakeProvider(), store).inspectDrift({}),
    { code: 'MISSING_EXPECTED_HASH' });
});
test('audit recursively redacts tokens, secret fields, cyclic objects and hashes actor identifier', async () => {
  const store = fakeStore();
  const log = new AuditLogger({ store });
  const details = { refreshToken: '1//secretValue', nested: {
    authorization: 'Bearer ya29.private', note: 'leak GOCSPX-AbcdefGhijkl'
  }, api_key: 'AIza' + 'A'.repeat(35), bearer: 'Bearer secretValue' };
  details.loop = details;
  await log.log({ eventType: 'SAFETY_AUDIT', scriptId, actorId: 'operator@example.org',
    outcome: 'INFO', details });
  const record = store.logs[0];
  assert.match(record.detailsJson, /REDACTED/);
  assert.doesNotMatch(JSON.stringify(record), /1\/\/secretValue|ya29.private|GOCSPX-Abcdef|secretValue|AIzaAAAA|operator@example.org/);
  assert.match(record.detailsJson, /CIRCULAR/);
  assert.equal(record.actorId.length, 64);
});
test('an in-memory conflict proves LeaseManager requires atomic tryAcquireLease', async () => {
  let now = 1000000;
  const store = fakeStore(() => now);
  const mgr = new LeaseManager({ store, now: () => now });
  const hash = 'a'.repeat(64);
  const first = await mgr.acquire({ scriptId, holderId: 'worker-one', expectedSourceHash: hash });
  await assert.rejects(() => mgr.acquire({ scriptId, holderId: 'worker-two', expectedSourceHash: hash }),
    { code: 'SAFETY_LEASE_CONFLICT' });
  assert.equal((await mgr.verify(first)).holderId, 'worker-one');
  now += 61000;
  const second = await mgr.acquire({ scriptId, holderId: 'worker-two', expectedSourceHash: hash });
  assert.equal(second.holderId, 'worker-two');
});
test('forged lease token, wrong holder, and wrong hash are refused', async () => {
  const store = fakeStore();
  const mgr = new LeaseManager({ store });
  const lease = await mgr.acquire({ scriptId, holderId: 'holder-a', expectedSourceHash: 'a'.repeat(64) });
  for (const candidate of [
    { ...lease, token: 'forged' },
    { ...lease, holderId: 'holder-b' },
    { ...lease, expectedSourceHash: 'b'.repeat(64) }
  ]) {
    await assert.rejects(() => mgr.verify(candidate), { code: 'SAFETY_LEASE_INVALID' });
  }
});
test('lease renew/release always require valid holder and token', async () => {
  let now = 1000000;
  const store = fakeStore(() => now);
  const mgr = new LeaseManager({ store, now: () => now });
  let lease = await mgr.acquire({ scriptId, holderId: 'holder-a', expectedSourceHash: 'a'.repeat(64) });
  now += 1000;
  lease = await mgr.renew(lease, 60000);
  assert.equal(await mgr.release(lease), true);
  await assert.rejects(() => mgr.verify(lease), { code: 'SAFETY_LEASE_INVALID' });
});
test('advisory safety gate forbids all live Google writes even with a valid lease', async () => {
  const store = fakeStore();
  const mgr = new LeaseManager({ store });
  const lease = await mgr.acquire({ scriptId, holderId: 'holder-a', expectedSourceHash: 'a'.repeat(64) });
  let count = 0;
  await assert.rejects(() => executeGuardedWrite({
    ...lease, allowLiveWrite: true, gasClient: { updateProjectContent: async () => { count++; } }
  }), { code: 'WRITE_MUST_USE_PR124_SCRIPT_EDITOR' });
  assert.equal(count, 0);
});
test('does not accept missing atomic lock provider', () => {
  assert.throws(() => new LeaseManager({ store: { getLease() {}, upsertLease() {} } }),
    { code: 'ATOMIC_SAFETY_LEASE_STORE_REQUIRED' });
});
test('redactor handles duplicate references without marking them as circular', () => {
  const shared = { ok: 'hello' };
  assert.deepEqual(redactSecrets({ a: shared, b: shared }), { a: shared, b: shared });
});
test('source fingerprint is scoped to the configured project, not a UI-form scriptId', async () => {
  const store = fakeStore();
  const inventory = makeInventory(fakeProvider(), store);
  const result = await inventory.sync();
  assert.equal(result.scriptId, scriptId);
  assert.ok(LIMITATION.includes('BRIDGE_ADVISORY_LEASE_ONLY'));
});
