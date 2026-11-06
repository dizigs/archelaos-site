import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVerifiedAppsScriptEvent, relayAppsScriptReceipt } from '../src/relay.mjs';

const ID = '11111111-1111-4111-8111-111111111111';
const TIME = '2026-11-05T12:00:00Z';
const NOW = Date.parse(TIME);
const HASH = char => char.repeat(64);
const receipt = (patch = {}) => ({
  operationId: ID,
  phase: 'BACKUP_VERIFIED',
  sourceFingerprint: HASH('a'),
  sourceRevision: HASH('b'),
  evidenceDigest: HASH('c'),
  observedAt: TIME,
  status: 'PROVIDER_VERIFIED',
  ...patch,
});
const capability = (patch = {}) => ({
  schemaVersion: 1,
  source: 'apps_script',
  transport: 'PRIVATE_SERVICE_BINDING',
  status: 'ACCEPTING',
  deploymentDigest: HASH('d'),
  ...patch,
});
function ports(changes = {}) {
  const sent = [], finalized = [], claimed = [];
  const p = {
    readControls: async () => ({ paused: false, bridgeEnabled: true }),
    readTrustedReceipt: async () => receipt(),
    readBrainCapabilities: async () => capability(),
    claimDelivery: async id => { claimed.push(id); return { status: 'CLAIMED' }; },
    submitToBrain: async event => {
      sent.push(event);
      return { receiptId: '22222222-2222-4222-8222-222222222222',
        correlationId: event.correlationId, status: 'QUEUED',
        durable: true, duplicate: false };
    },
    finalizeDelivery: async (id, result) => { finalized.push({ id, result }); },
    ...changes
  };
  return { p, sent, finalized, claimed };
}

test('stable private event carries no source code, project ID or Google credentials', async () => {
  const a = await buildVerifiedAppsScriptEvent(receipt(), NOW);
  const b = await buildVerifiedAppsScriptEvent(receipt(), NOW);
  assert.deepEqual(a, b);
  assert.match(a.eventId, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(a.source, 'apps_script');
  assert.equal(a.type, 'apps_script.backup.verified');
  assert.equal(a.correlationId, ID);
  assert.deepEqual(Object.keys(a.metadata),
    ['sourceFingerprint', 'evidenceDigest', 'privacy']);
  assert.equal(a.metadata.privacy, 'OPAQUE_AUDIT_ONLY');
  assert.equal(JSON.stringify(a).includes('projectId'), false);
  assert.equal(JSON.stringify(a).includes('token'), false);
});

test('three supported provider-verified stages have distinct event types', async () => {
  const stages = ['SOURCE_READ_VERIFIED', 'BACKUP_VERIFIED', 'SMOKE_ROLLBACK_VERIFIED'];
  const events = await Promise.all(stages.map(phase =>
    buildVerifiedAppsScriptEvent(receipt({ phase }), NOW)));
  assert.equal(new Set(events.map(e => e.eventId)).size, 3);
  assert.deepEqual(events.map(e => e.type),
    ['apps_script.source.read', 'apps_script.backup.verified', 'apps_script.rollback.verified']);
});

test('caller extras cannot smuggle private source, tokens, or unsupported stages', async () => {
  for (const mutation of [
    { sourceCode: 'private code' }, { token: 'private bearer' },
    { phase: 'GOOGLE_WRITTEN' }, { status: 'UNVERIFIED' },
    { evidenceDigest: HASH('z') }, { sourceFingerprint: 'abc' }
  ]) {
    await assert.rejects(buildVerifiedAppsScriptEvent(receipt(mutation), NOW));
  }
});

test('reject stale, future, impossible or malformed provider evidence', async () => {
  for (const observedAt of [
    '2026-10-01T12:00:00Z', '2026-11-05T12:06:00Z',
    '2026-02-30T12:00:00Z', 'not-a-date', 123
  ]) {
    await assert.rejects(buildVerifiedAppsScriptEvent(receipt({ observedAt }), NOW));
  }
});

test('relay refuses arbitrary user fields, even when they claim approval', async () => {
  const { p } = ports();
  for (const command of [
    { operationId: ID, verified: true },
    { operationId: ID, source: 'drive' },
    { operationId: ID, sourceCode: '// hi' },
    { operationId: 'bad' },
    {}
  ]) {
    await assert.rejects(relayAppsScriptReceipt(command, p, NOW),
      { code: 'INVALID_RELAY_COMMAND' });
  }
});

test('no trusted ports means no execution or exposed HTTP fallback', async () => {
  await assert.rejects(relayAppsScriptReceipt({ operationId: ID }, {}, NOW),
    { code: 'TRUSTED_PORTS_UNAVAILABLE' });
});

test('disabled and paused controls stop before reading private Google evidence', async () => {
  for (const controls of [
    { paused: false, bridgeEnabled: false },
    { paused: true, bridgeEnabled: true }
  ]) {
    let didRead = false;
    const { p, sent } = ports({
      readControls: async () => controls,
      readTrustedReceipt: async () => { didRead = true; return receipt(); }
    });
    const r = await relayAppsScriptReceipt({ operationId: ID }, p, NOW);
    assert.equal(r.sent, false);
    assert.equal(didRead, false);
    assert.equal(sent.length, 0);
  }
});

test('untrusted controls and mismatched provider operation are rejected', async () => {
  const { p } = ports({ readControls: async () => ({ bridgeEnabled: true }) });
  await assert.rejects(relayAppsScriptReceipt({ operationId: ID }, p, NOW),
    { code: 'TRUSTED_CONTROLS_UNAVAILABLE' });
  const x = ports({
    readTrustedReceipt: async () => receipt({
      operationId: '33333333-3333-4333-8333-333333333333'
    })
  });
  await assert.rejects(relayAppsScriptReceipt({ operationId: ID }, x.p, NOW),
    { code: 'RECEIPT_IDENTITY_MISMATCH' });
});

test('current Brain without apps_script source remains blocked', async () => {
  const { p, sent, claimed } = ports({
    readBrainCapabilities: async () => capability({ source: 'github' })
  });
  await assert.rejects(relayAppsScriptReceipt({ operationId: ID }, p, NOW),
    { code: 'BRAIN_APPSSCRIPT_SOURCE_NOT_READY' });
  assert.equal(sent.length, 0);
  assert.equal(claimed.length, 0);
});

test('capability cannot be a caller-supplied bool or a public transport', async () => {
  for (const value of [
    { ready: true, verified: true },
    capability({ transport: 'PUBLIC_WEBHOOK' }),
    capability({ deploymentDigest: 'staging' }),
    capability({ extra: 'overly broad' })
  ]) {
    const { p } = ports({ readBrainCapabilities: async () => value });
    await assert.rejects(relayAppsScriptReceipt({ operationId: ID }, p, NOW),
      { code: 'BRAIN_APPSSCRIPT_SOURCE_NOT_READY' });
  }
});

test('authorized synthetic private bridge gets a durable receipt, never a Google write', async () => {
  const { p, sent, claimed, finalized } = ports();
  const result = await relayAppsScriptReceipt({ operationId: ID }, p, NOW);
  assert.equal(result.status, 'DURABLE_BRAIN_RECEIPT');
  assert.equal(result.sent, true);
  assert.equal(sent.length, 1);
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0], sent[0].eventId);
  assert.deepEqual(finalized[0].result, {
    status: 'DURABLE_BRAIN_RECEIPT',
    brainReceiptId: '22222222-2222-4222-8222-222222222222'
  });
});

test('durable duplicate and uncertain claim never dispatch again', async () => {
  for (const status of ['DUPLICATE_CONFIRMED', 'RECONCILE_REQUIRED']) {
    const { p, sent } = ports({
      claimDelivery: async () => ({ status })
    });
    const r = await relayAppsScriptReceipt({ operationId: ID }, p, NOW);
    assert.equal(r.status, status);
    assert.equal(r.sent, false);
    assert.equal(sent.length, 0);
  }
});

test('unknown network outcome is held for reconciliation; no auto retry', async () => {
  let calls = 0;
  const { p, finalized } = ports({
    submitToBrain: async () => { calls++; throw Error('private network error token=secret'); }
  });
  const r = await relayAppsScriptReceipt({ operationId: ID }, p, NOW);
  assert.equal(calls, 1);
  assert.equal(r.sent, false);
  assert.equal(r.status, 'RECONCILE_REQUIRED');
  assert.equal(finalized[0].result.brainReceiptId, null);
  assert.equal(JSON.stringify(r).includes('secret'), false);
});

test('malformed or non-durable Brain response is never called success', async () => {
  const { p } = ports({ submitToBrain: async () =>
    ({ status: 'QUEUED', durable: false, receiptId: ID, correlationId: ID, duplicate: false }) });
  const r = await relayAppsScriptReceipt({ operationId: ID }, p, NOW);
  assert.equal(r.status, 'RECONCILE_REQUIRED');
  assert.equal(r.sent, false);
});

test('failure to durably finalize receipt must fail closed', async () => {
  const { p } = ports({ finalizeDelivery: async () => { throw Error('database error'); } });
  await assert.rejects(relayAppsScriptReceipt({ operationId: ID }, p, NOW),
    { code: 'DURABLE_AUDIT_NOT_CONFIRMED' });
});
