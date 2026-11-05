import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalyticsSqlReader } from './reader.mjs';
const TIME = Date.UTC(2026, 10, 6, 12, 0, 0);

test('off by default and never touches provider', async () => {
  const reader = createAnalyticsSqlReader({ binding: { query() { throw new Error('UNEXPECTED'); } }, now: () => TIME });
  assert.deepEqual(await reader.httpStatusSummary(), { status: 'DISABLED', rows: [] });
  assert.deepEqual(await reader.aiErrorSummary(), { status: 'DISABLED', rows: [] });
});

test('fixed aggregate HTTP query with account-scoped binding and parameters', async () => {
  let call;
  const reader = createAnalyticsSqlReader({ enabled: true, now: () => TIME, binding: {
    async query(args) { call = args; return { data: [{ status: 200, requests: '42' }, { status: 500, requests: 2 }], rows: 2, statistics: { elapsed_ms: 28 } }; },
  } });
  const result = await reader.httpStatusSummary({ host: 'Archery.Archelaos.Club', minutes: 30 });
  assert.equal(result.status, 'OK');
  assert.deepEqual(result.statuses, [{ status: 200, requests: 42 }, { status: 500, requests: 2 }]);
  assert.deepEqual(call.params, { since: '2026-11-06T11:30:00.000Z', host: 'archery.archelaos.club' });
  assert.match(call.query, /GROUP BY edgeResponseStatus/);
  assert.doesNotMatch(call.query, /accountTag|SELECT \*/);
});

test('invalid host or clock cannot execute a query', async () => {
  let calls = 0;
  const reader = createAnalyticsSqlReader({ enabled: true, now: () => TIME, binding: { async query() { calls++; return {}; } } });
  await assert.rejects(reader.httpStatusSummary({ host: 'archelaos.club.evil.test' }), /SQL_HOST_NOT_ALLOWLISTED/);
  await assert.rejects(reader.httpStatusSummary({ host: 'foo_archelaos.club' }), /SQL_HOST_NOT_ALLOWLISTED/);
  await assert.rejects(reader.httpStatusSummary({ minutes: 61 }), /SQL_WINDOW_OUT_OF_BOUNDS/);
  await assert.rejects(createAnalyticsSqlReader({ enabled: true, now: () => NaN, binding: { query() {} } }).aiErrorSummary(), /SQL_INVALID_CLOCK/);
  assert.equal(calls, 0);
});

test('AI query stays aggregate-only and excludes request content', async () => {
  let call;
  const reader = createAnalyticsSqlReader({ enabled: true, now: () => TIME, binding: {
    async query(args) { call = args; return { data: [{ errorCode: null, inferences: 19 }, { errorCode: '429', inferences: '2' }], rows: 2 }; },
  } });
  const result = await reader.aiErrorSummary({ minutes: 5 });
  assert.deepEqual(result.errors, [{ code: 'NONE', inferences: 19 }, { code: '429', inferences: 2 }]);
  assert.equal(call.params.since, '2026-11-06T11:55:00.000Z');
  assert.doesNotMatch(call.query, /requestBytesIn|clientIP|rawMessage|prompt|responseText/);
});

test('missing binding and malformed responses fail closed', async () => {
  const missing = createAnalyticsSqlReader({ enabled: true, now: () => TIME });
  await assert.rejects(missing.httpStatusSummary(), /SQL_BINDING_MISSING/);
  const broken = createAnalyticsSqlReader({ enabled: true, now: () => TIME, binding: { async query() { return { data: [{ status: 200, requests: 5 }], rows: 3 }; } } });
  await assert.rejects(broken.httpStatusSummary(), /SQL_MALFORMED_RESULT/);
});

test('failed provider queries are not retried', async () => {
  let attempts = 0;
  const reader = createAnalyticsSqlReader({ enabled: true, now: () => TIME, binding: { async query() { attempts++; throw Object.assign(new Error('SQL_LIMIT'), { retryable: true }); } } });
  await assert.rejects(reader.httpStatusSummary(), /SQL_LIMIT/);
  assert.equal(attempts, 1);
});

test('malformed aggregate rows fail closed', async () => {
  const reader = createAnalyticsSqlReader({ enabled: true, now: () => TIME, binding: { async query() { return { data: [{ status: 200, requests: -1 }], rows: 1 }; } } });
  await assert.rejects(reader.httpStatusSummary(), /SQL_INVALID_COUNT/);
});
