import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { Miniflare } from 'miniflare';

const KEY = 'synthetic-test-only-00000000000000000000000000000000000000000000';
const COMMIT = 'a'.repeat(40);
let mf, directory;
function options() { return { name: 'archelaos-brain-test', modules: true, scriptPath: resolve('src/worker.mjs'), compatibilityDate: '2026-07-30', durableObjects: { BRAIN: { className: 'BrainCoordinator', useSQLite: true } }, durableObjectsPersist: directory, bindings: { ENVIRONMENT: 'staging', DEPLOY_SHA: COMMIT, STAGING_EXPIRES_AT: new Date(Date.now() + 3600000).toISOString(), STAGING_INTAKE_KEY: KEY, STAGING_SHORT_RETRIES: 'true', TEST_BUDGET: 'true' } }; }
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'archelaos-brain-test-')); mf = new Miniflare(options()); });
afterEach(async () => { await mf.dispose(); await rm(directory, { recursive: true, force: true }); });
function event(updates = {}) { return { schemaVersion: 1, eventId: randomUUID(), sourceType: 'staging', sourceId: 'b'.repeat(64), sourceRevision: 'c'.repeat(64), receivedAt: new Date().toISOString(), correlationId: randomUUID(), eventType: 'source.file.created', payload: { blobSha256: 'd'.repeat(64), mimeType: 'application/pdf', sizeBytes: 100 }, ...updates }; }
async function send(path, body, overrides = {}) {
  const method = body === undefined ? 'GET' : 'POST'; const raw = body === undefined ? '' : JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', KEY).update(method + '\n' + path + '\n' + timestamp + '\n' + raw).digest('hex');
  return mf.dispatchFetch('https://brain.test' + path, { method, headers: { 'content-type': 'application/json', 'x-archelaos-key-id': 'staging-v1', 'x-archelaos-timestamp': timestamp, 'x-archelaos-signature': signature, ...overrides }, ...(body === undefined ? {} : { body: raw }) });
}
async function wait(id, target) {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    const response = await send('/v1/tasks/' + id); const result = await response.json();
    if (result.status === target) return result;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  assert.fail('Durable alarm did not reach ' + target);
}
async function budget(path, input) {
  const namespace = await mf.getDurableObjectNamespace('BRAIN');
  return namespace.get(namespace.idFromName('budget-fixture')).fetch('https://internal/internal/budget/' + path, { method: 'POST', body: JSON.stringify(input) });
}
const NOW = Date.parse('2026-11-03T12:00:00Z');
function reservation(amount, suffix = 'e', provider = 'cloudflare', now = NOW) {
  const price = { verified: true, currency: 'EUR', evidenceSha256: 'f'.repeat(64), sourceUrl: 'https://example.org/synthetic-test-pricing', expiresAt: '2027-01-01T00:00:00Z', inputMicroCurrencyPerMillion: amount - 1, outputMicroCurrencyPerMillion: 1, fxNumerator: 1, fxDenominator: 1 };
  return { now, request: { reservationId: suffix.repeat(64), provider, maxInputTokens: 1000000, maxOutputTokens: 1 }, config: { coverageConfirmed: true, capMicroEur: 20000000, prices: { [provider]: price } } };
}

test('unauthenticated and expired signatures cannot create receipts', async () => {
  const response = await send('/v1/events', event(), { 'x-archelaos-signature': '0'.repeat(64) }); assert.equal(response.status, 401);
  const stale = await send('/v1/events', event(), { 'x-archelaos-timestamp': '1000000000' }); assert.equal(stale.status, 401);
  const state = await (await send('/v1/diagnostics')).json(); assert.deepEqual(state.jobs, []);
});
test('actual SQLite receipt, alarm dispatcher and safe audit reach review', async () => {
  const response = await send('/v1/events', event()); assert.equal(response.status, 202);
  const receipt = await response.json(); assert.equal(receipt.durable, true);
  const result = await wait(receipt.receiptId, 'WAITING_REVIEW');
  assert.equal(result.attempts, 1); assert.equal(result.route, 'HISTORICAL_REVIEW');
  assert.deepEqual(result.audit.map(row => row.status), ['QUEUED', 'RUNNING', 'WAITING_REVIEW']);
  assert.equal(JSON.stringify(result).includes('blobSha256'), false);
});
test('concurrent identical deliveries create exactly one logical queue job', async () => {
  const input = event(); const results = await Promise.all(Array.from({ length: 10 }, () => send('/v1/events', input)));
  assert.equal(results.filter(response => response.status === 202).length, 1);
  const bodies = await Promise.all(results.map(response => response.json())); assert.equal(new Set(bodies.map(body => body.receiptId)).size, 1);
});
test('new event IDs and revisions for unchanged blob reuse the same receipt', async () => {
  const input = event(); const first = await (await send('/v1/events', input)).json();
  const second = await (await send('/v1/events', { ...input, eventId: randomUUID(), sourceRevision: 'a'.repeat(64), eventType: 'source.file.updated' })).json();
  assert.equal(second.receiptId, first.receiptId); assert.equal(second.duplicate, true);
});
test('event ID or revision reused for different content is rejected', async () => {
  const input = event(); await send('/v1/events', input);
  const changed = { ...input, payload: { ...input.payload, blobSha256: 'a'.repeat(64) } };
  assert.equal((await send('/v1/events', changed)).status, 409);
  assert.equal((await send('/v1/events', { ...changed, eventId: randomUUID() })).status, 409);
  assert.equal((await send('/v1/events', { ...input, sourceId: 'a'.repeat(64) })).status, 409);
});
test('receipt and dedupe survive an actual runtime restart', async () => {
  const input = event(); const initial = await (await send('/v1/events', input)).json();
  await wait(initial.receiptId, 'WAITING_REVIEW'); await mf.dispose(); mf = new Miniflare(options());
  const replay = await (await send('/v1/events', input)).json(); assert.equal(replay.receiptId, initial.receiptId); assert.equal(replay.duplicate, true);
});
test('one transient failure retries by durable alarm and then stops', async () => {
  const initial = await (await send('/v1/events', event({ eventType: 'staging.retry.once' }))).json();
  const result = await wait(initial.receiptId, 'WAITING_REVIEW'); assert.equal(result.attempts, 2);
  assert.equal(result.audit.filter(row => row.status === 'RETRY_WAIT').length, 1);
});
test('repeated failure reaches DLQ at three attempts without looping', async () => {
  const initial = await (await send('/v1/events', event({ eventType: 'staging.retry.always' }))).json();
  const result = await wait(initial.receiptId, 'DLQ'); assert.equal(result.attempts, 3);
  await new Promise(resolve => setTimeout(resolve, 250));
  const unchanged = await (await send('/v1/tasks/' + initial.receiptId)).json(); assert.equal(unchanged.audit.length, result.audit.length);
});
test('unknown event is quarantined without AI or publishing', async () => {
  const initial = await (await send('/v1/events', event({ eventType: 'source.unknown' }))).json();
  assert.equal((await wait(initial.receiptId, 'QUARANTINED')).attempts, 1);
});
test('private raw source IDs, extra payload, source impersonation and stale events fail closed', async () => {
  for (const input of [event({ sourceId: 'private-drive-id' }), event({ sourceType: 'drive' }), event({ receivedAt: '2020-01-01T00:00:00Z' }), { ...event(), privateText: 'not allowed' }, event({ payload: { ...event().payload, content: 'private source text' } })]) assert.equal((await send('/v1/events', input)).status, 422);
});
test('query strings, oversized requests, unsigned status and public budget APIs are rejected', async () => {
  assert.equal((await send('/v1/events?token=private', event())).status, 404);
  assert.equal((await send('/v1/events', { oversized: 'a'.repeat(5000) })).status, 413);
  assert.equal((await mf.dispatchFetch('https://brain.test/v1/diagnostics')).status, 401);
  assert.equal((await send('/v1/budget/reserve', {})).status, 404);
});
test('per-source flood limit rejects excess deliveries without adding jobs', async () => {
  const input = event(); const responses = [];
  for (let index = 0; index < 31; index++) responses.push(await send('/v1/events', input));
  assert.equal(responses[30].status, 429);
  const state = await (await send('/v1/diagnostics')).json(); assert.equal(state.jobs.reduce((n, row) => n + row.count, 0), 1);
});
test('concurrent AI reservations across providers cannot exceed EUR20', async () => {
  const results = await Promise.all([budget('reserve', reservation(8000000, 'a', 'cloudflare')), budget('reserve', reservation(8000000, 'b', 'azure')), budget('reserve', reservation(8000000, 'c', 'openai'))]);
  assert.equal(results.filter(response => response.status === 200).length, 2);
  assert.equal(results.filter(response => response.status === 402).length, 1);
});
test('75/90 percent alerts fire once and exact remaining limit rejects next call', async () => {
  const first = await (await budget('reserve', reservation(15000000, 'a'))).json(); assert.deepEqual(first.alerts, [75]);
  const second = await (await budget('reserve', reservation(3000000, 'b'))).json(); assert.deepEqual(second.alerts, [90]);
  assert.equal((await budget('reserve', reservation(2000001, 'c'))).status, 402);
  const replay = await (await budget('reserve', reservation(3000000, 'b'))).json(); assert.equal(replay.duplicate, true);
});
test('unknown account coverage, expired pricing and raised cap prevent any reservation', async () => {
  const coverage = reservation(1000000); coverage.config.coverageConfirmed = false; assert.equal((await budget('reserve', coverage)).status, 409);
  const pricing = reservation(1000000); pricing.config.prices.cloudflare.expiresAt = '2020-01-01T00:00:00Z'; assert.equal((await budget('reserve', pricing)).status, 409);
  const raised = reservation(1000000); raised.config.capMicroEur = 20000001; assert.equal((await budget('reserve', raised)).status, 422);
});
test('unsettled previous-month cost is held through Athens calendar rollover', async () => {
  await budget('reserve', reservation(19000000, 'a', 'cloudflare', Date.parse('2026-11-30T21:59:59Z')));
  assert.equal((await budget('reserve', reservation(2000000, 'b', 'azure', Date.parse('2026-11-30T22:00:00Z')))).status, 402);
});
test('verified actual usage settles once; conflicting/out-of-bound usage remains reserved', async () => {
  const request = reservation(19000000, 'a'); await budget('reserve', request);
  assert.equal((await budget('settle', { id: 'a'.repeat(64), actualMicroEur: 19000001 })).status, 409);
  assert.equal((await budget('reserve', reservation(2000000, 'b'))).status, 402);
  assert.equal((await budget('settle', { id: 'a'.repeat(64), actualMicroEur: 5000000 })).status, 200);
  const again = await (await budget('settle', { id: 'a'.repeat(64), actualMicroEur: 5000000 })).json(); assert.equal(again.duplicate, true);
  assert.equal((await budget('reserve', reservation(15000000, 'c'))).status, 200);
});
