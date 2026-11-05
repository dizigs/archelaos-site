import test from 'node:test';
import assert from 'node:assert/strict';
import { composeMergedReadOnlyHandoff } from './merged-contracts.mjs';

const OP = 'c87bf310-5124-48b4-a57c-871c8370d5ce';
const RECEIPT_ID = 'ad48ec51-171c-461e-8e1b-4b14586e9ec8';
const HASH = 'a'.repeat(64);
const SOURCE = 'b'.repeat(64);
const DRIFT = 'c'.repeat(64);
const FILES = Array.from({ length: 4 }, (_, i) => ({ name: 'synthetic-file-' + i }));

// Every port in these tests is an in-memory SYNTHETIC substitute. It does not
// contact Google, Cloudflare, GitHub, any real Apps Script project or Brain.
function fixture() {
  const reads = { count: 0, backups: 0, sends: 0, holds: [], audits: [] };
  const journal = new Map(), claims = new Map(), brainReceipts = new Map();
  const now = () => Date.now();
  const editor = {
    projectId: 'SYNTHETIC_PROJECT_NOT_A_REAL_GOOGLE_ID',
    async read() {
      reads.count++;
      return { status: 'PRIVATE_CONTENT_READ', projectIdentityVerified: true,
        headHash: SOURCE, files: FILES };
    },
    async backup() {
      reads.backups++;
      return { status: 'PRIVATE_BACKUP_VERIFIED', backupId: RECEIPT_ID,
        headHash: SOURCE, fileCount: 4 };
    }
  };
  const handoffPorts = {
    readControls: async () => ({ paused: false, readEnabled: true }),
    fingerprintProject: async () => HASH,
    claim: async (id, phase) => {
      const existing = journal.get(id);
      return { status: existing && existing.phase === phase ? 'COMPLETED' : 'CLAIMED' };
    },
    complete: async (id, receipt) => { journal.set(id, structuredClone(receipt)); },
    get: async id => journal.get(id),
    hold: async (id, reason) => { reads.holds.push({ id, reason }); },
    audit: async entry => { reads.audits.push(entry); }
  };
  const relayPorts = {
    readControls: async () => ({ paused: false, bridgeEnabled: true }),
    readTrustedReceipt: async id => journal.get(id),
    readBrainCapabilities: async () => ({
      schemaVersion: 1, source: 'apps_script',
      transport: 'PRIVATE_SERVICE_BINDING', status: 'ACCEPTING',
      deploymentDigest: HASH
    }),
    claimDelivery: async eventId => {
      if (claims.get(eventId) === 'RECEIVED') return { status: 'DUPLICATE_CONFIRMED' };
      if (claims.has(eventId)) return { status: 'RECONCILE_REQUIRED' };
      claims.set(eventId, 'CLAIMED');
      return { status: 'CLAIMED' };
    },
    submitToBrain: async event => {
      reads.sends++;
      brainReceipts.set(event.eventId, {
        eventId: event.eventId, correlationId: event.correlationId,
        receiptId: RECEIPT_ID, source: 'apps_script',
        sourceRevision: event.sourceRevision,
        transport: 'PRIVATE_SERVICE_BINDING', status: 'QUEUED', durable: true
      });
      return { receiptId: RECEIPT_ID, correlationId: event.correlationId,
        status: 'QUEUED', durable: true, duplicate: false };
    },
    finalizeDelivery: async (eventId, record) => {
      claims.set(eventId, record.status === 'DURABLE_BRAIN_RECEIPT' ?
        'RECEIVED' : 'HOLD');
    }
  };
  const trusted = {
    actor: { testOnly: true }, editor, handoffPorts, relayPorts, now,
    checkPrivateBinding: async () => ({
      verified: true, source: 'apps_script', scope: 'metadata-only',
      paused: false, enabled: true
    }),
    readBrainReceipt: async ({ eventId }) => brainReceipts.get(eventId),
    audit: async item => { reads.audits.push(item); }
  };
  return { reads, trusted, journal };
}

test('merged #218 source handoff -> #201 relay -> independent Brain readback', async () => {
  const { reads, trusted } = fixture();
  const result = await composeMergedReadOnlyHandoff({ operationId: OP, phase: 'read' }, trusted);
  assert.equal(result.status, 'DURABLE_BRAIN_RECEIPT');
  assert.equal(result.brainReadbackVerified, true);
  assert.equal(reads.count, 1);
  assert.equal(reads.backups, 0);
  assert.equal(reads.sends, 1);
  assert.equal(reads.audits.length, 2);
});

test('merged #218 encrypted-backup contract preserves source hash and is read-only', async () => {
  const { reads, trusted, journal } = fixture();
  const result = await composeMergedReadOnlyHandoff({ operationId: OP, phase: 'backup' }, trusted);
  assert.equal(result.status, 'DURABLE_BRAIN_RECEIPT');
  assert.equal(reads.backups, 1);
  assert.equal(journal.get(OP).sourceRevision, SOURCE);
  assert.equal(journal.get(OP).phase, 'BACKUP_VERIFIED');
});

test('duplicate event uses immutable #218 receipt and durable #201 duplicate claim', async () => {
  const { reads, trusted } = fixture();
  const first = await composeMergedReadOnlyHandoff({ operationId: OP, phase: 'read' }, trusted);
  const second = await composeMergedReadOnlyHandoff({ operationId: OP, phase: 'read' }, trusted);
  assert.equal(first.brainReadbackVerified, true);
  assert.equal(second.status, 'DUPLICATE_CONFIRMED');
  assert.equal(second.brainReadbackVerified, true);
  assert.equal(reads.count, 1);
  assert.equal(reads.sends, 1);
});

test('source change between encrypted backup and readback blocks before relay', async () => {
  const { reads, trusted } = fixture();
  trusted.editor.read = async () => {
    reads.count++;
    return { status: 'PRIVATE_CONTENT_READ', projectIdentityVerified: true,
      headHash: DRIFT, files: FILES };
  };
  await assert.rejects(
    composeMergedReadOnlyHandoff({ operationId: OP, phase: 'backup' }, trusted),
    { code: 'SOURCE_DRIFT_AFTER_BACKUP' }
  );
  assert.equal(reads.sends, 0);
  assert.equal(reads.holds.length, 1);
});

test('uncertain delivery is held, even when called again; no retransmission', async () => {
  const { reads, trusted } = fixture();
  trusted.relayPorts.submitToBrain = async () => {
    reads.sends++;
    throw Error('SYNTHETIC_NETWORK_LOSS');
  };
  const first = await composeMergedReadOnlyHandoff({ operationId: OP, phase: 'read' }, trusted);
  const second = await composeMergedReadOnlyHandoff({ operationId: OP, phase: 'read' }, trusted);
  assert.equal(first.status, 'RECONCILIATION_REQUIRED');
  assert.equal(second.status, 'RECONCILIATION_REQUIRED');
  assert.equal(reads.sends, 1);
});

test('Brain receipt source revision mismatch is a reconciliation hold', async () => {
  const { reads, trusted } = fixture();
  const original = trusted.readBrainReceipt;
  trusted.readBrainReceipt = async input => ({
    ...await original(input), sourceRevision: DRIFT
  });
  const result = await composeMergedReadOnlyHandoff({ operationId: OP, phase: 'read' }, trusted);
  assert.equal(result.status, 'RECONCILIATION_REQUIRED');
  assert.equal(result.sent, false);
  assert.equal(reads.sends, 1);
});

test('external source, write phase or extra caller fields fail before private ports', async () => {
  const { reads, trusted } = fixture();
  for (const input of [
    { operationId: OP, phase: 'edit' },
    { operationId: OP, phase: 'read', sourceCode: 'forbidden' },
    { operationId: OP, phase: 'read', approved: true }
  ]) {
    await assert.rejects(composeMergedReadOnlyHandoff(input, trusted),
      { code: 'READ_ONLY_COMMAND_REQUIRED' });
  }
  assert.equal(reads.count, 0);
  assert.equal(reads.sends, 0);
});

test('no verified private binding prevents even source GET', async () => {
  const { reads, trusted } = fixture();
  trusted.checkPrivateBinding = async () => ({ verified: false });
  await assert.rejects(
    composeMergedReadOnlyHandoff({ operationId: OP, phase: 'read' }, trusted),
    { code: 'PRIVATE_BRAIN_BINDING_NOT_READY' }
  );
  assert.equal(reads.count, 0);
});

test('unavailable Brain intake capability cannot dispatch', async () => {
  const { reads, trusted } = fixture();
  trusted.relayPorts.readBrainCapabilities = async () => ({
    schemaVersion: 1, source: 'github', transport: 'PRIVATE_SERVICE_BINDING',
    status: 'ACCEPTING', deploymentDigest: HASH
  });
  await assert.rejects(
    composeMergedReadOnlyHandoff({ operationId: OP, phase: 'read' }, trusted),
    { code: 'BRAIN_APPSSCRIPT_SOURCE_NOT_READY' }
  );
  assert.equal(reads.sends, 0);
});
