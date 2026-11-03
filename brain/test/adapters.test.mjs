import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Miniflare } from 'miniflare';
import { handleGitHubWebhook } from '../src/adapters/github.mjs';
import { handleDriveNotification } from '../src/adapters/drive.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const now = Date.now(); const metadata = { blobSha256: hash('synthetic-document'), mimeType: 'application/pdf', sizeBytes: 100 };
let mf, directory;
const options = (clock = now) => ({ name: 'brain-source-fixture', modules: true, scriptPath: resolve('test/source_store_fixture.mjs'), compatibilityDate: '2026-07-30', durableObjects: { STORE: { className: 'StoreHarness', useSQLite: true }, CORE: { className: 'BrainCoordinator', useSQLite: true } }, durableObjectsPersist: directory, bindings: { DEPLOY_SHA: 'a'.repeat(40), STAGING_SHORT_RETRIES: 'true', TEST_NOW: String(clock) } });
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'brain-source-')); mf = new Miniflare(options()); });
afterEach(async () => { await mf.dispose(); await rm(directory, { recursive: true, force: true }); });
const send = (path, body) => mf.dispatchFetch('https://fixture.test' + path, { method: 'POST', body: JSON.stringify(body) });
const driveKey = 'drive:' + hash('synthetic-channel');
function drive() { return { config: { enabled: true, authorizationVerified: true, channelId: 'synthetic-channel', channelToken: 'synthetic-channel-secret-'.repeat(3), resourceId: 'synthetic-resource', channelExpiresAt: now + 2 * 86400000, approvedDriveId: 'synthetic-approved-drive' }, notification: { headers: { 'x-goog-channel-id': 'synthetic-channel', 'x-goog-channel-token': 'synthetic-channel-secret-'.repeat(3), 'x-goog-resource-id': 'synthetic-resource', 'x-goog-resource-state': 'change' } }, metadata, pages: { cursor1: { items: [{ fileId: 'synthetic-file', revision: 'r1', driveId: 'synthetic-approved-drive' }], newStartPageToken: 'cursor2' }, cursor2: { items: [], newStartPageToken: 'cursor2' } } }; }
async function initialize(key = driveKey, cursor = 'cursor1') { assert.equal((await send('/initialize', { key, cursor })).status, 200); }
test('Drive is fail-closed before authorization or real connector exists', async () => {
  let called = false;
  await assert.rejects(handleDriveNotification({}, { enabled: false }, { listChanges: () => { called = true; } }, null));
  assert.equal(called, false);
});
test('Drive actual SQL cursor advances only after one durable native core receipt', async () => {
  await initialize(); const response = await send('/drive', drive()); assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.receipts.length, 1);
  const snapshot = await (await send('/snapshot', { key: driveKey })).json(); assert.equal(snapshot.cursor, 'cursor2');
  assert.equal(snapshot.core.jobs.reduce((n, row) => n + row.count, 0), 1);
  assert.equal((await send('/drive', drive())).status, 200);
});
test('crash after durable enqueue, runtime restart and replay do not lose or duplicate source work', async () => {
  await initialize(); const input = drive(); input.failAfterDurable = 1;
  assert.equal((await send('/drive', input)).status, 409);
  assert.equal((await (await send('/snapshot', { key: driveKey })).json()).cursor, 'cursor1');
  await mf.dispose(); mf = new Miniflare(options());
  const replay = await (await send('/drive', drive())).json(); assert.equal(replay.receipts[0].duplicate, true);
  const snapshot = await (await send('/snapshot', { key: driveKey })).json(); assert.equal(snapshot.cursor, 'cursor2'); assert.equal(snapshot.core.jobs.reduce((n, row) => n + row.count, 0), 1);
});
test('forged Drive channel, expired watch and foreign shared drive cannot checkpoint or enqueue', async () => {
  await initialize();
  const cases = [drive(), drive(), drive()]; cases[0].notification.headers['x-goog-channel-token'] = 'forged'; cases[1].config.channelExpiresAt = now - 1; cases[2].pages.cursor1.items[0].driveId = 'foreign-private-drive';
  for (const input of cases) assert.equal((await send('/drive', input)).status, 409);
  const snapshot = await (await send('/snapshot', { key: driveKey })).json(); assert.equal(snapshot.cursor, 'cursor1'); assert.deepEqual(snapshot.core.jobs, []);
});
test('source lease blocks concurrent processing and recovers after expired crashed owner', async () => {
  await initialize(); const holding = send('/hold', { key: driveKey });
  for (let attempt = 0; attempt < 20; attempt++) { const state = await (await send('/snapshot', { key: driveKey })).json(); if (state.sourceRows[0].locked) break; await new Promise(resolve => setTimeout(resolve, 5)); }
  assert.equal((await (await send('/drive', drive())).json()).code, 'SOURCE_LEASE_BUSY'); await holding;
  await send('/crashed-lease', { key: driveKey }); await mf.dispose(); mf = new Miniflare(options(now + 61000));
  assert.equal((await send('/drive', drive())).status, 200);
});
test('Drive watch sync is not a fabricated file event and raw deletion does not remove content', async () => {
  await initialize(); const input = drive(); input.notification.headers['x-goog-resource-state'] = 'sync';
  assert.equal((await (await send('/drive', input)).json()).status, 'CHANNEL_SYNC_ONLY');
  const deletion = drive(); deletion.pages.cursor1.items = [{ removed: true }];
  assert.equal((await send('/drive', deletion)).status, 200);
  assert.deepEqual((await (await send('/snapshot', { key: driveKey })).json()).core.jobs, []);
});
const gmailKey = 'gmail:' + hash('archive@synthetic.invalid');
function gmail() { return { config: { enabled: true, authorizationVerified: true, mailbox: 'archive@synthetic.invalid', audience: 'https://synthetic.invalid/gmail', serviceAccountEmail: 'push@synthetic.invalid', subscription: 'projects/synthetic/subscriptions/archive', approvedLabelId: 'ARCHIVE_APPROVED' }, principal: { verified: true, audience: 'https://synthetic.invalid/gmail', email: 'push@synthetic.invalid', emailVerified: true, issuer: 'https://accounts.google.com', expiresAt: now + 3600000 }, push: { authorization: 'synthetic-verified-by-injected-verifier', subscription: 'projects/synthetic/subscriptions/archive', data: { emailAddress: 'archive@synthetic.invalid', historyId: '105' } }, metadata, pages: { first: { items: [{ id: 'synthetic-message', historyId: '101', labelIds: ['ARCHIVE_APPROVED'] }], nextPageToken: 'page-2' }, 'page-2': { items: [], historyId: '105' } } }; }
test('Gmail uses verified OIDC and durable history pagination without treating page token as history ID', async () => {
  await initialize(gmailKey, '100'); const response = await send('/gmail', gmail()); assert.equal(response.status, 200);
  const snapshot = await (await send('/snapshot', { key: gmailKey })).json(); assert.equal(snapshot.cursor, '105'); assert.equal(snapshot.calls[1].cursor, '100'); assert.equal(snapshot.calls[1].page_token, 'page-2');
  assert.equal((await (await send('/gmail', gmail())).json()).status, 'NOTIFICATION_ALREADY_COVERED');
});
test('Gmail bad principal, mailbox, label and expired history preserve original checkpoint', async () => {
  await initialize(gmailKey, '100'); const cases = [gmail(), gmail(), gmail(), gmail()];
  cases[0].principal.verified = false; cases[1].push.data.emailAddress = 'foreign@synthetic.invalid'; cases[2].pages.first.items[0].labelIds = ['UNAPPROVED']; cases[3].historyMissing = true;
  for (const input of cases) assert.equal((await send('/gmail', input)).status, 409);
  const snapshot = await (await send('/snapshot', { key: gmailKey })).json(); assert.equal(snapshot.cursor, '100'); assert.deepEqual(snapshot.core.jobs, []);
});
test('contribution requires independent committed backend receipt, consent and clean scan', async () => {
  const input = { config: { enabled: true, authorizationVerified: true }, input: { receiptReference: 'synthetic-receipt' }, backendReceipt: { verified: true, status: 'UPLOAD_COMMITTED', purpose: 'archive_contribution', processingConsent: true, malwareScan: 'PASS', id: 'synthetic-upload', revision: 'r1', metadata } };
  const result = await (await send('/form', input)).json(); assert.equal(result.status, 'PRIVATE_REVIEW');
  for (const update of [{ verified: false }, { malwareScan: 'UNKNOWN' }, { processingConsent: false }]) assert.equal((await send('/form', { ...input, backendReceipt: { ...input.backendReceipt, ...update } })).status, 409);
});
test('GitHub verifies raw HMAC and repository before emitting technical review metadata', async () => {
  const secret = 'synthetic-github-secret-'.repeat(3); const events = [];
  const body = { repository: { full_name: 'dizigs/archelaos-site', id: 42 }, action: 'opened', pull_request: { id: 100, updated_at: new Date(now).toISOString(), head: { sha: 'a'.repeat(40), repo: { full_name: 'dizigs/archelaos-site' } } } };
  const rawBody = JSON.stringify(body); const request = { rawBody, event: 'pull_request', deliveryId: randomUUID(), signature: 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex') };
  const config = { enabled: true, authorizationVerified: true, repositoryId: 42, webhookSecret: secret }; const deps = { enqueue: async event => { events.push(event); return { durable: true, receiptId: randomUUID() }; } };
  assert.equal((await handleGitHubWebhook(request, config, deps, now)).status, 'TECHNICAL_REVIEW_ONLY'); assert.equal(events.length, 1); assert.equal(events[0].sourceType, 'github');
  await assert.rejects(handleGitHubWebhook({ ...request, rawBody: rawBody + ' ' }, config, deps, now));
  await assert.rejects(handleGitHubWebhook(request, { ...config, repositoryId: 43 }, deps, now)); assert.equal(events.length, 1);
});
test('source event through native queue, extraction, SQLite draft and mocked PR is one durable workflow', async () => {
  await initialize();
  const text = JSON.stringify({ claims: [{ factId: 'synthetic-fact' }] });
  const input = drive(); input.metadata = { blobSha256: hash(text), mimeType: 'application/json', sizeBytes: Buffer.byteLength(text) };
  const received = await (await send('/drive', input)).json(); const receiptId = received.receipts[0].receiptId;
  for (let attempt = 0; attempt < 60; attempt++) { const task = await (await send('/task', { receiptId })).json(); if (task.status === 'WAITING_REVIEW') break; await new Promise(resolve => setTimeout(resolve, 50)); }
  const process = { receiptId, source: { processingAllowed: true, publicReleaseApproved: true, revision: hash('r1'), blobSha256: hash(text), allowedPublicHosts: ['synthetic.invalid'] }, document: { text, mimeType: 'application/json' }, facts: { 'synthetic-fact': { verified: true, publicReleaseApproved: true, sourceRevision: hash('r1'), organizationId: 'gas-archelaos-katerini', contentTarget: 'history', text: 'Συνθετικό τεκμηριωμένο γεγονός.', eventDate: '2020-01-01', publishDate: '2020-01-02', phase: 'historical', competitionId: 'synthetic-cup', publicSourceUrl: 'https://synthetic.invalid/evidence', publicSourceLabel: 'Συνθετικό δημόσιο τεκμήριο', observedAt: new Date(now).toISOString() } } };
  const concurrent = await Promise.all([send('/process', process).then(r => r.json()), send('/process', process).then(r => r.json())]);
  assert.equal(concurrent.filter(row => row.status === 'DRAFTS_PREPARED_FOR_REVIEW').length, 1);
  assert.equal((await (await send('/process', process)).json()).status, 'REPLAY_SUPPRESSED');
  assert.deepEqual(await (await send('/pipeline-counts', {})).json(), { drafts: 1, publications: 1, work: 1 });
});
