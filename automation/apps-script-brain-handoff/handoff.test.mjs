import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareAppsScriptReceipt, verifyBrainHandoffReadiness } from './handoff.mjs';

const ID = 'b4848810-2359-4a01-8f40-a02b51570900';
const HEX = 'a'.repeat(64);
function fixture() {
  const rows = new Map(); const claims = new Map(); const audits = []; let reads = 0; let backups = 0;
  const editor = {
    projectId: 'not-exported-private-script-id',
    async read() { reads++; return { status: 'PRIVATE_CONTENT_READ', projectIdentityVerified: true,
      headHash: HEX, files: [{}, {}, {}, {}] }; },
    async backup() { backups++; return { status: 'PRIVATE_BACKUP_VERIFIED', backupId: ID, headHash: HEX, fileCount: 4 }; }
  };
  const ports = {
    async readControls() { return { paused: false, readEnabled: true }; },
    async fingerprintProject() { return 'b'.repeat(64); },
    async claim(id, phase) {
      if (claims.has(id)) return { status: claims.get(id) === phase && rows.has(id) ? 'COMPLETED' : 'RECONCILE_REQUIRED' };
      claims.set(id, phase); return { status: 'CLAIMED' };
    },
    async get(id) { return rows.get(id); },
    async complete(id, receipt) { if (rows.has(id)) throw Error('duplicate'); rows.set(id, receipt); },
    async hold(id) { if (!rows.has(id)) claims.set(id, 'HOLD'); },
    async audit(event) { audits.push(event); }
  };
  return { editor, ports, rows, claims, audits, reads: () => reads, backups: () => backups };
}
const run = (f, args = {}) => prepareAppsScriptReceipt({ operationId: ID, actor: { verified: true },
  editor: f.editor, ports: f.ports, sleep: async () => {}, ...args });

test('read-only receipt is durable, privacy-minimized and idempotent', async () => {
  const f = fixture(); assert.equal((await run(f)).status, 'PRIVATE_RECEIPT_VERIFIED');
  const stored = f.rows.get(ID);
  assert.deepEqual(Object.keys(stored).sort(), ['evidenceDigest','observedAt','operationId','phase','sourceFingerprint','sourceRevision','status'].sort());
  assert.equal(stored.phase, 'SOURCE_READ_VERIFIED'); assert.equal(stored.sourceRevision, HEX);
  assert.equal(JSON.stringify(stored).includes(f.editor.projectId), false);
  assert.equal((await run(f)).status, 'ALREADY_VERIFIED');
  assert.equal(f.reads(), 1); assert.equal(f.audits.length, 1);
});
test('backup receipt calls existing editor once then performs source readback', async () => {
  const f = fixture();
  assert.equal((await run(f, { phase: 'backup' })).status, 'PRIVATE_RECEIPT_VERIFIED');
  assert.equal(f.backups(), 1); assert.equal(f.reads(), 1);
  assert.equal(f.rows.get(ID).phase, 'BACKUP_VERIFIED');
  assert.equal((await run(f, { phase: 'backup' })).status, 'ALREADY_VERIFIED');
  assert.equal(f.backups(), 1);
});
test('rejects stale backup source without relay receipt', async () => {
  const f = fixture(); f.editor.read = async () => ({ status: 'PRIVATE_CONTENT_READ', projectIdentityVerified: true,
    headHash: 'c'.repeat(64), files: [{}, {}, {}, {}] });
  await assert.rejects(run(f, { phase: 'backup' }), /SOURCE_DRIFT_AFTER_BACKUP/);
  assert.equal(f.rows.size, 0); assert.equal(f.claims.get(ID), 'HOLD');
});
test('paused and disabled controls reject before source access', async () => {
  const f = fixture(); f.ports.readControls = async () => ({ paused: true, readEnabled: true });
  await assert.rejects(run(f), /HANDOFF_DISABLED_OR_PAUSED/);
  assert.equal(f.reads(), 0); assert.equal(f.claims.size, 0);
});
test('invalid commands and unsupported rollback phase reject before claim', async () => {
  const f = fixture();
  await assert.rejects(run(f, { operationId: '../../evil' }), /HANDOFF_COMMAND_INVALID/);
  await assert.rejects(run(f, { phase: 'rollback' }), /HANDOFF_COMMAND_INVALID/);
  assert.equal(f.claims.size, 0);
});
test('retry only transient source reads once, with no Google PUT', async () => {
  const f = fixture(); let tries = 0; const original = f.editor.read;
  f.editor.read = async () => { if (++tries === 1) throw { code: 'GOOGLE_HTTP_503' }; return original(); };
  assert.equal((await run(f)).status, 'PRIVATE_RECEIPT_VERIFIED');
  assert.equal(tries, 2); assert.equal(f.backups(), 0);
});
test('authorization error never retries read', async () => {
  const f = fixture(); let tries = 0;
  f.editor.read = async () => { tries++; throw { code: 'ADMIN_SCOPE_OR_EXECUTOR_AUTHORIZATION_REQUIRED' }; };
  await assert.rejects(run(f)); assert.equal(tries, 1); assert.equal(f.claims.get(ID), 'HOLD');
});
test('backup errors never retry or fabricate success', async () => {
  const f = fixture(); let calls = 0;
  f.editor.backup = async () => { calls++; throw { code: 'GOOGLE_PROJECT_TRANSPORT_UNCERTAIN' }; };
  await assert.rejects(run(f, { phase: 'backup' })); assert.equal(calls, 1); assert.equal(f.rows.size, 0);
});
test('receipt persistence mismatch halts handoff', async () => {
  const f = fixture(); f.ports.complete = async (id, r) => f.rows.set(id, { ...r, evidenceDigest: 'c'.repeat(64) });
  await assert.rejects(run(f), /IMMUTABLE_RECEIPT_MISMATCH/);
});
test('cross-phase replay is rejected, not reinterpreted', async () => {
  const f = fixture(); await run(f);
  await assert.rejects(run(f, { phase: 'backup' }), /HANDOFF_IN_PROGRESS_OR_RECONCILIATION_REQUIRED/);
  assert.equal(f.backups(), 0);
});
test('Brain refuses absent binding, missing source and malformed capability', async () => {
  const cap = { schemaVersion: 1, source: 'apps_script', transport: 'PRIVATE_SERVICE_BINDING', status: 'ACCEPTING', deploymentDigest: HEX };
  await assert.rejects(verifyBrainHandoffReadiness({ bindingVerified: false, readCapabilities: async () => cap }), /PRIVATE_SERVICE_BINDING_NOT_VERIFIED/);
  await assert.rejects(verifyBrainHandoffReadiness({ bindingVerified: true, readCapabilities: async () => ({ ...cap, source: 'github' }) }), /BRAIN_APPSSCRIPT_SOURCE_NOT_READY/);
  assert.equal((await verifyBrainHandoffReadiness({ bindingVerified: true, readCapabilities: async () => cap })).status, 'BRAIN_APPS_SCRIPT_INTAKE_CAPABILITY_VERIFIED');
});
