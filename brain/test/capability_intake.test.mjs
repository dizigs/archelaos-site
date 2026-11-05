import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Miniflare } from 'miniflare';
import { validateAnalyticsSnapshot, validateAppsScriptEvent } from '../src/capability_intake.mjs';

const KEY = 'test-analytics-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const APPS_KEY = 'test-appscript-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const OPERATOR_KEY = 'test-operator-cccccccccccccccccccccccccccccccccccccccccccccccc';
const DRIVE_KEY = 'test-drive-eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const GMAIL_KEY = 'test-gmail-ffffffffffffffffffffffffffffffffffffffffffffffff';
const RECEIPT_KEY = 'test-receipt-dddddddddddddddddddddddddddddddddddddddddddddddd';
const COMMIT = 'e'.repeat(40);
const h = s => createHash('sha256').update(s).digest('hex');
function analytics({reportDigest = 'a'.repeat(64), observedAt = new Date().toISOString(), value = 42} = {}) {
  const source = 'ga4', from = '2026-11-05', to = '2026-11-05';
  const metrics = [{pagePath: '/', name: 'sessions', value, sampleSize: 40,
    confidence: 'AGGREGATE_ONLY_NO_CAUSAL_INFERENCE'}];
  return {
    schemaVersion: 1, event: {
      schemaVersion: 1, eventId: h('analytics|' + source + '|' + reportDigest + '|' + from + '|' + to),
      source: 'analytics', type: 'aggregate_report_ready', sourceRevision: reportDigest,
      observedAt, correlationId: h('analytics|' + source + '|' + reportDigest + '|' + from + '|' + to).slice(0, 24),
      payload: {schemaVersion: 1, source, reportDigest, period: {from, to}, metrics,
        suppressedRows: 0, rawVisitorDataStored: false, externalAiCalls: 0},
      privacyStatus: 'AGGREGATED_ONLY', aiRouting: 'CENTRAL_BRAIN_ONLY', publish: false
    },
    snapshotKey: source + '|' + from + '|' + to, metricRevision: h(JSON.stringify(metrics)),
    evidence: {repository: 'dizigs/archelaos-site', runId: 10, artifactId: 20,
      runSha: COMMIT, reportDigest, workflow: 'Google Search and GA4 daily aggregate', observedAt},
    operation: 'UPSERT_NOT_INCREMENT'
  };
}
function apps({operationId = randomUUID(), revision = 'b'.repeat(64), phase = 'SOURCE_READ_VERIFIED',
  observedAt = new Date().toISOString()} = {}) {
  const phases = {SOURCE_READ_VERIFIED: 'apps_script.source.read',
    BACKUP_VERIFIED: 'apps_script.backup.verified',
    SMOKE_ROLLBACK_VERIFIED: 'apps_script.rollback.verified'};
  const sourceFingerprint = 'c'.repeat(64), evidenceDigest = 'd'.repeat(64);
  const hash = h('archelaos|apps-script|v1|' + operationId + '|' + phase +
    '|' + sourceFingerprint + '|' + revision + '|' + evidenceDigest);
  const variant = ((parseInt(hash[16], 16) & 3) | 8).toString(16);
  const eventId = hash.slice(0, 8) + '-' + hash.slice(8, 12) + '-5' + hash.slice(13, 16) +
    '-' + variant + hash.slice(17, 20) + '-' + hash.slice(20, 32);
  return {schemaVersion: 1, eventId, source: 'apps_script', type: phases[phase],
    sourceRevision: revision, observedAt, correlationId: operationId,
    metadata: {sourceFingerprint, evidenceDigest, privacy: 'OPAQUE_AUDIT_ONLY'}};
}
async function withBrain(fn, {enabled = true, eventSources = false} = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'brain-capability-'));
  let externalCalls = 0;
  const options = {
    name: 'archelaos-brain-capability-test', modules: true, scriptPath: resolve('src/worker.mjs'),
    compatibilityDate: '2026-07-30',
    outboundService: async () => { externalCalls++; return new Response('BLOCKED', {status: 502}); },
    durableObjects: {BRAIN: {className: 'BrainCoordinator', useSQLite: true}},
    durableObjectsPersist: directory,
    bindings: {ENVIRONMENT: 'staging', DEPLOY_SHA: COMMIT,
      STAGING_EXPIRES_AT: new Date(Date.now() + 3600000).toISOString(),
      STAGING_INTAKE_KEY: 'test-staging-000000000000000000000000000000000000000000000000',
      STAGING_OPERATOR_KEY: OPERATOR_KEY, BRAIN_ANALYTICS_INTAKE_KEY: KEY,
      BRAIN_APPS_SCRIPT_INTAKE_KEY: APPS_KEY, BRAIN_CAPABILITY_RECEIPT_KEY: RECEIPT_KEY,
      BRAIN_DRIVE_INTAKE_KEY: DRIVE_KEY, BRAIN_GMAIL_INTAKE_KEY: GMAIL_KEY,
      BRAIN_PRIVATE_EVENT_SOURCES_ENABLED: eventSources ? 'true' : 'false',
      BRAIN_PRIVATE_CAPABILITIES_ENABLED: enabled ? 'true' : 'false',
      BRAIN_PRIVATE_SERVICE_BINDINGS_VERIFIED: enabled ? 'true' : 'false',
      STAGING_SHORT_RETRIES: 'true'}
  };
  let mf = new Miniflare(options);
  async function send(path, input, identity = 'analytics-v1', secret) {
    const method = input === undefined ? 'GET' : 'POST';
    const raw = input === undefined ? '' : JSON.stringify(input);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const key = secret ?? (identity === 'analytics-v1' ? KEY :
      identity === 'apps-script-v1' ? APPS_KEY :
      identity === 'drive-v1' ? DRIVE_KEY : identity === 'gmail-v1' ? GMAIL_KEY :
      OPERATOR_KEY);
    const signature = createHmac('sha256', key).update(method + '\n' + path + '\n' +
      timestamp + '\n' + raw).digest('hex');
    return mf.dispatchFetch('https://brain.test' + path, {
      method, headers: {'content-type': 'application/json', 'x-archelaos-key-id': identity,
        'x-archelaos-timestamp': timestamp, 'x-archelaos-signature': signature},
      ...(input === undefined ? {} : {body: raw})
    });
  }
  try { await fn({send, get mf() {return mf;},
    restart: async () => { await mf.dispose(); mf = new Miniflare(options); } }); }
  finally {
    await mf.dispose(); await rm(directory, {recursive: true, force: true});
    assert.equal(externalCalls, 0, 'capability intake must never invoke any external service');
  }
}
test('private validators accept real #220/#201 shapes and reject personal fields and forged digests', async () => {
  const report = analytics();
  assert.equal((await validateAnalyticsSnapshot(report)).snapshotKey, report.snapshotKey);
  const app = apps();
  assert.equal((await validateAppsScriptEvent(app)).eventId, app.eventId);
  await assert.rejects(validateAnalyticsSnapshot({...report, event: {
    ...report.event, payload: {...report.event.payload, visitorId: 'private'}}}), /ANALYTICS_INVALID_AGGREGATE/);
  await assert.rejects(validateAnalyticsSnapshot({...report, event: {
    ...report.event, payload: {...report.event.payload, metrics: [{
      ...report.event.payload.metrics[0], sampleSize: 1}]}}}), /ANALYTICS_UNSAFE_MEASUREMENT/);
  await assert.rejects(validateAnalyticsSnapshot({...report, metricRevision: 'f'.repeat(64)}), /ANALYTICS_HASH_MISMATCH/);
  await assert.rejects(validateAppsScriptEvent({...app, metadata: {...app.metadata, code: 'source'}}),
    /APPS_SCRIPT_INVALID_EVENT/);
  await assert.rejects(validateAppsScriptEvent({...app, sourceRevision: 'f'.repeat(64)}),
    /APPS_SCRIPT_HASH_MISMATCH/);
});
test('private source identities cannot impersonate each other or the operator', async () => {
  await withBrain(async ({send}) => {
    assert.equal((await send('/v1/intake/apps-script', apps())).status, 403);
    assert.equal((await send('/v1/intake/analytics', analytics(), 'apps-script-v1')).status, 403);
    assert.equal((await send('/v1/intake/analytics', analytics(), 'analytics-v1', 'bad-key-'.repeat(8))).status, 401);
    assert.equal((await send('/v1/control', {operation: 'pause', scope: 'global',
      expectedRevision: 0}, 'analytics-v1')).status, 403);
    assert.equal((await send('/v1/diagnostics')).status, 403);
    assert.equal((await send('/v1/exec/diagnostics', undefined, 'apps-script-v1')).status, 403);
    assert.equal((await send('/v1/events', analytics().event)).status, 403);
  });
});
test('private capabilities remain fail-closed when binding attestations are absent', async () => {
  await withBrain(async ({send}) => {
    assert.equal((await send('/v1/capabilities/analytics')).status, 423);
    assert.equal((await send('/v1/intake/analytics', analytics())).status, 423);
    assert.equal((await send('/v1/capabilities/apps-script', undefined, 'apps-script-v1')).status, 423);
  }, {enabled: false});
});
test('analytics snapshots durable UPSERT not increment with HMAC receipt and replay protection', async () => {
  await withBrain(async ({send}) => {
    const cap = await (await send('/v1/capabilities/analytics')).json();
    assert.equal(cap.version, 'analytics.aggregate.v1');
    assert.equal(cap.durableSnapshotUpsert, true);
    const report = analytics();
    const firstResponse = await send('/v1/intake/analytics', report);
    assert.equal(firstResponse.status, 200);
    const first = await firstResponse.json();
    assert.equal(first.status, 'ACCEPTED'); assert.equal(first.durable, true);
    assert.equal(first.eventId, report.event.eventId);
    const {receiptSignature, ...unsigned} = first;
    assert.equal(first.keyId, 'brain-capability-receipts-v1');
    assert.equal(first.audience, 'analytics.snapshot.ack.v1');
    assert.equal(first.principal, 'analytics-v1');
    assert.equal(receiptSignature, createHmac('sha256', RECEIPT_KEY).update(
      first.audience + '\n' + JSON.stringify(unsigned)).digest('hex'));
    const repeat = await (await send('/v1/intake/analytics', report)).json();
    assert.equal(repeat.status, 'DUPLICATE'); assert.equal(repeat.receiptId, first.receiptId);
    const updated = analytics({reportDigest: 'b'.repeat(64),
      observedAt: new Date(Date.now() + 1000).toISOString(), value: 43});
    const replacement = await (await send('/v1/intake/analytics', updated)).json();
    assert.equal(replacement.status, 'UPDATED');
    assert.notEqual(replacement.receiptId, first.receiptId);
    const earlier = await (await send('/v1/analytics/readback', {
      receiptId: first.receiptId, eventId: report.event.eventId,
      snapshotKey: report.snapshotKey})).json();
    assert.equal(earlier.isCurrent, false);
    assert.equal(earlier.status, 'ACCEPTED');
    const current = await (await send('/v1/analytics/readback', {
      receiptId: replacement.receiptId, eventId: updated.event.eventId,
      snapshotKey: updated.snapshotKey})).json();
    assert.equal(current.isCurrent, true);
    assert.equal(current.audience, 'analytics.snapshot.readback.v1');
    const {receiptSignature: readbackSignature, ...body} = current;
    assert.equal(readbackSignature, createHmac('sha256', RECEIPT_KEY).update(
      current.audience + '\n' + JSON.stringify(body)).digest('hex'));
    assert.equal((await send('/v1/intake/analytics', report)).status, 409);
    assert.equal((await send('/v1/analytics/readback', {
      receiptId: replacement.receiptId, eventId: report.event.eventId,
      snapshotKey: updated.snapshotKey})).status, 404);
    const attempt = await send('/v1/intake/analytics', {...updated, metricRevision: 'f'.repeat(64)});
    assert.equal(attempt.status, 409);
    const state = await (await send('/v1/diagnostics', undefined, 'operator-v1')).json();
    assert.equal(state.aiExecutionEnabled, false);
    assert.equal(state.aiProviderCalls, 0);
  });
});
test('Apps Script opaque receipts are durable, idempotent and never perform Google writes', async () => {
  await withBrain(async ({send}) => {
    const cap = await (await send('/v1/capabilities/apps-script', undefined, 'apps-script-v1')).json();
    assert.equal(cap.source, 'apps_script'); assert.equal(cap.status, 'ACCEPTING');
    const app = apps();
    const first = await (await send('/v1/intake/apps-script', app, 'apps-script-v1')).json();
    assert.deepEqual(Object.keys(first).sort(), ['correlationId', 'duplicate', 'durable', 'receiptId', 'status']);
    assert.equal(first.status, 'WAITING_REVIEW'); assert.equal(first.duplicate, false);
    const second = await (await send('/v1/intake/apps-script', app, 'apps-script-v1')).json();
    assert.equal(second.duplicate, true); assert.equal(second.receiptId, first.receiptId);
    const readback = await (await send('/v1/apps-script/readback', {
      receiptId: first.receiptId, eventId: app.eventId, operationId: app.correlationId
    }, 'apps-script-v1')).json();
    assert.equal(readback.audience, 'apps-script.receipt.readback.v1');
    assert.equal(readback.sourceRevision, app.sourceRevision);
    assert.equal(readback.durable, true);
    const {receiptSignature, ...signed} = readback;
    assert.equal(receiptSignature, createHmac('sha256', RECEIPT_KEY).update(
      readback.audience + '\n' + JSON.stringify(signed)).digest('hex'));
    const conflicting = apps({operationId: app.correlationId, revision: 'f'.repeat(64)});
    assert.equal((await send('/v1/intake/apps-script', conflicting, 'apps-script-v1')).status, 409);
  });
});
test('global/source pause blocks new capability receipts without enabling AI', async () => {
  await withBrain(async ({send}) => {
    const control = await send('/v1/control', {operation: 'pause', scope: 'source',
      source: 'analytics', expectedRevision: 0}, 'operator-v1');
    assert.equal(control.status, 200);
    assert.equal((await send('/v1/intake/analytics', analytics())).status, 423);
    assert.equal((await send('/v1/intake/apps-script', apps(), 'apps-script-v1')).status, 200);
    const state = await (await send('/v1/control', undefined, 'operator-v1')).json();
    assert.equal(state.aiPaused, true);
  });
});

function legacyEvent(sourceType, eventType, updates = {}) {
  return {schemaVersion: 1, eventId: randomUUID(), sourceType,
    sourceId: 'a'.repeat(64), sourceRevision: 'b'.repeat(64),
    receivedAt: new Date().toISOString(), correlationId: randomUUID(),
    eventType, payload: {blobSha256: 'c'.repeat(64), mimeType: 'application/json',
      sizeBytes: 42}, ...updates};
}
test('source-specific event keys remain OFF without a verified private binding', async () => {
  await withBrain(async ({send}) => {
    assert.equal((await send('/v1/events', legacyEvent('drive', 'source.file.created'),
      'drive-v1')).status, 423);
  }, {eventSources: false});
});
test('Drive/Gmail source-scoped HMAC event, route, receipt and readback permission', async () => {
  await withBrain(async ({send}) => {
    assert.equal((await send('/v1/events', legacyEvent('gmail','source.message.received'),
      'drive-v1')).status, 422);
    assert.equal((await send('/v1/events', legacyEvent('drive','github.ci.failed'),
      'drive-v1')).status, 403);
    const ev = legacyEvent('drive', 'source.file.created');
    const response = await send('/v1/events', ev, 'drive-v1');
    assert.equal(response.status, 202);
    const ack = await response.json();
    assert.equal(ack.durable, true);
    const again = await (await send('/v1/events', ev, 'drive-v1')).json();
    assert.equal(again.receiptId, ack.receiptId);
    const observed = await send('/v1/source-receipts/' + ack.receiptId,
      undefined, 'drive-v1');
    assert.equal(observed.status, 200);
    const scoped = await observed.json();
    assert.equal(scoped.receiptId, ack.receiptId);
    assert.equal(scoped.correlationId, ev.correlationId);
    assert.equal(scoped.durable, true);
    assert.equal((await send('/v1/source-receipts/' + ack.receiptId,
      undefined, 'gmail-v1')).status, 404);
    assert.equal((await send('/v1/diagnostics', undefined, 'drive-v1')).status, 403);
    assert.equal((await send('/v1/control', undefined, 'gmail-v1')).status, 403);
    assert.equal((await send('/v1/exec/diagnostics', undefined, 'drive-v1')).status, 403);
  }, {eventSources: true});
});
test('immutable analytics revision and Apps Script receipt survive the same SQLite DO restart', async () => {
  await withBrain(async ({send, restart}) => {
    const report = analytics(), app = apps();
    const first = await (await send('/v1/intake/analytics', report)).json();
    const second = await (await send('/v1/intake/apps-script', app, 'apps-script-v1')).json();
    await restart();
    const analyticsRead = await (await send('/v1/analytics/readback', {
      receiptId: first.receiptId, eventId: report.event.eventId,
      snapshotKey: report.snapshotKey})).json();
    assert.equal(analyticsRead.isCurrent, true);
    assert.equal(analyticsRead.durable, true);
    const appsRead = await (await send('/v1/apps-script/readback', {
      receiptId: second.receiptId, eventId: app.eventId,
      operationId: app.correlationId}, 'apps-script-v1')).json();
    assert.equal(appsRead.status, 'WAITING_REVIEW');
    assert.equal((await (await send('/v1/intake/analytics', report)).json()).status, 'DUPLICATE');
    assert.equal((await (await send('/v1/intake/apps-script', app, 'apps-script-v1')).json()).duplicate, true);
  });
});
test('analytics snapshot rejects conflicting/older producer evidence and accepts newer identical metrics', async () => {
  await withBrain(async ({send}) => {
    const at = new Date().toISOString();
    const first = analytics({observedAt: at});
    const receipt = await (await send('/v1/intake/analytics', first)).json();
    const sameTime = analytics({observedAt: at, reportDigest: 'f'.repeat(64)});
    assert.equal((await send('/v1/intake/analytics', sameTime)).status, 409);
    const older = analytics({observedAt: new Date(Date.now() - 60_000).toISOString(),
      reportDigest: 'e'.repeat(64)});
    assert.equal((await send('/v1/intake/analytics', older)).status, 409);
    const newer = analytics({observedAt: new Date(Date.now() + 1000).toISOString(),
      reportDigest: 'd'.repeat(64)});
    const updated = await (await send('/v1/intake/analytics', newer)).json();
    assert.equal(updated.status, 'UPDATED');
    assert.equal(updated.metricRevision, receipt.metricRevision);
    assert.notEqual(updated.receiptId, receipt.receiptId);
  });
});
