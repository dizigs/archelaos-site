import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';

export async function proveStaging(origin, key, operatorKey, expectedCommit) {
  const url = new URL(origin);
  if (!(url.protocol === 'https:' && /^archelaos-brain-staging\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname) || url.protocol === 'http:' && url.hostname === '127.0.0.1') || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Unapproved staging origin');
  if (!/^[0-9a-f]{40}$/.test(expectedCommit) || key.length < 43 || operatorKey.length < 43) throw new Error('Invalid staging proof configuration');
  let requests = 0;
  const hash = value => createHash('sha256').update(value).digest('hex');
  async function call(path, body, operator = false, expectedStatus = 200) {
    if (++requests > 120) throw new Error('Staging proof request budget exhausted');
    const method = body === undefined ? 'GET' : 'POST'; const raw = body === undefined ? '' : JSON.stringify(body);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', operator ? operatorKey : key).update(method + '\n' + path + '\n' + timestamp + '\n' + raw).digest('hex');
    const response = await fetch(new URL(path, origin), { method, redirect: 'error', signal: AbortSignal.timeout(10000), headers: { 'content-type': 'application/json', 'x-archelaos-key-id': operator ? 'operator-v1' : 'staging-v1', 'x-archelaos-timestamp': timestamp, 'x-archelaos-signature': signature }, ...(body === undefined ? {} : { body: raw }) });
    assert.equal(response.status, expectedStatus, 'Unexpected status on compiled staging proof route');
    return response.json();
  }
  async function wait(id, status) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const job = await call('/v1/tasks/' + id);
      if (job.status === status) return job;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('Staging alarm/dispatcher did not reach expected status');
  }
  const health = await (await fetch(new URL('/healthz', origin), { redirect: 'error', signal: AbortSignal.timeout(10000) })).json();
  assert.equal(health.commit, expectedCommit); assert.equal(health.environment, 'staging');
  const before = await call('/v1/diagnostics');
  const seed = randomUUID();
  const syntheticBytes = Buffer.from('%PDF-1.4 synthetic technical proof ' + seed);
  const input = { schemaVersion: 1, eventId: randomUUID(), sourceType: 'staging', sourceId: hash('synthetic-file-source-' + seed), sourceRevision: hash('revision-1'), receivedAt: new Date().toISOString(), correlationId: randomUUID(), eventType: 'source.file.created', payload: { blobSha256: hash(syntheticBytes), mimeType: 'application/pdf', sizeBytes: syntheticBytes.length } };
  const first = await call('/v1/events', input, false, 202);
  const second = await call('/v1/events', input); assert.equal(second.receiptId, first.receiptId); assert.equal(second.duplicate, true);
  const revision = await call('/v1/events', { ...input, eventId: randomUUID(), sourceRevision: hash('revision-2'), eventType: 'source.file.updated' }); assert.equal(revision.receiptId, first.receiptId);
  const completed = await wait(first.receiptId, 'WAITING_REVIEW'); assert.equal(completed.route, 'HISTORICAL_REVIEW'); assert.equal(completed.attempts, 1);
  const retried = await call('/v1/events', { ...input, eventId: randomUUID(), eventType: 'staging.retry.once' }, false, 202);
  const retryResult = await wait(retried.receiptId, 'WAITING_REVIEW'); assert.equal(retryResult.attempts, 2);
  const failed = await call('/v1/events', { ...input, eventId: randomUUID(), eventType: 'staging.retry.always' }, false, 202);
  const dlq = await wait(failed.receiptId, 'DLQ'); assert.equal(dlq.attempts, 3);
  const unknown = await call('/v1/events', { ...input, eventId: randomUUID(), eventType: 'source.unapproved' }, false, 202);
  assert.equal((await wait(unknown.receiptId, 'QUARANTINED')).attempts, 1);
  await call('/v1/control', undefined, false, 403);
  let state = await call('/v1/control', undefined, true);
  state = await call('/v1/control', { operation: 'pause', scope: 'source', source: 'staging', expectedRevision: state.revision }, true);
  await call('/v1/events', { ...input, eventId: randomUUID() }, false, 423);
  state = await call('/v1/control', { operation: 'resume', scope: 'source', source: 'staging', expectedRevision: state.revision, healthCommit: expectedCommit }, true);
  state = await call('/v1/control', { operation: 'pause', scope: 'global', expectedRevision: state.revision }, true);
  await call('/v1/events', { ...input, eventId: randomUUID() }, false, 423);
  state = await call('/v1/control', { operation: 'resume', scope: 'global', expectedRevision: state.revision, healthCommit: expectedCommit }, true);
  await call('/v1/control', { operation: 'resume', scope: 'ai', expectedRevision: state.revision, healthCommit: expectedCommit }, true, 409);
  const after = await call('/v1/diagnostics');
  const sum = report => report.jobs.reduce((count, row) => count + row.count, 0);
  assert.equal(sum(after) - sum(before), 4); assert.equal(after.aiProviderCalls, 0);
  return { commit: expectedCommit, source: 'synthetic-staging-file-metadata', receiptId: first.receiptId, sameReceiptOnReplay: true, logicalJobsAdded: 4, primaryJobAttempts: completed.attempts, retryAttempts: retryResult.attempts, dlqAttempts: dlq.attempts, unknownQuarantined: true, operatorScopeChecked: true, sourcePauseAndResume: true, globalPauseAndResume: true, paidAiResumeDenied: true, aiProviderCalls: 0, requests, productionMutationPerformed: false, providerDeploymentVerified: false };
}

if (process.argv[1]?.endsWith('/prove_staging.mjs')) {
  proveStaging(process.env.BRAIN_ORIGIN, process.env.BRAIN_INTAKE_KEY, process.env.BRAIN_OPERATOR_KEY, process.env.BRAIN_EXPECTED_SHA)
    .then(result => console.log(JSON.stringify(result)))
    .catch(() => { console.error('BRAIN_STAGING_PROOF_FAILED; inspect redacted job/audit evidence'); process.exitCode = 1; });
}
