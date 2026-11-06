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
  assert.deepEqual(await missing.httpStatusSummary(), { status: 'UNKNOWN', reason: 'BINDING_UNAVAILABLE', retryCount: 0 });
  const broken = createAnalyticsSqlReader({ enabled: true, now: () => TIME, binding: { async query() { return { data: [{ status: 200, requests: 5 }], rows: 3 }; } } });
  assert.deepEqual(await broken.httpStatusSummary(), { status: 'UNKNOWN', reason: 'INVALID_DATA', retryCount: 0 });
});

test('failed provider queries are not retried', async () => {
  let attempts = 0;
  const reader = createAnalyticsSqlReader({ enabled: true, now: () => TIME, binding: { async query() { attempts++; throw Object.assign(new Error('SQL_LIMIT'), { retryable: true }); } } });
  assert.deepEqual(await reader.httpStatusSummary(), { status: 'UNKNOWN', reason: 'PROVIDER_FAILURE', retryCount: 0 });
  assert.equal(attempts, 1);
});

test('malformed aggregate rows fail closed', async () => {
  const reader = createAnalyticsSqlReader({ enabled: true, now: () => TIME, binding: { async query() { return { data: [{ status: 200, requests: -1 }], rows: 1 }; } } });
  assert.deepEqual(await reader.httpStatusSummary(), { status: 'UNKNOWN', reason: 'INVALID_DATA', retryCount: 0 });
});


// Security acceptance tests: mock bindings only; no Cloudflare SQL queries.
test('negative: SQL injection, unrelated hosts and malformed DNS labels are blocked before query', async () => {
  let calls = 0;
  const reader = createAnalyticsSqlReader({ enabled: true, now: () => TIME, binding: {
    async query() { calls++; return { data: [], rows: 0 }; },
  } });
  for (const host of ["archelaos.club' OR 1=1--", 'archelaos.club;DELETE', 'archelaos.club.evil.test',
    'foo_archelaos.club', '-bad.archelaos.club', 'bad-.archelaos.club', 'a..archelaos.club', '', null]) {
    await assert.rejects(reader.httpStatusSummary({ host }), /SQL_HOST_NOT_ALLOWLISTED/);
  }
  assert.equal(calls, 0);
});

test('invalid safety configuration and all out-of-bounds SQL windows are rejected', async () => {
  const binding = { query() { throw new Error('should not call'); } };
  for (const opts of [{ timeoutMs: 10 }, { maxQueriesPerMinute: 0 }, { maxRetries: 2 },
    { retryDelayMs: 2000 }, { enabled: 'yes' }]) {
    assert.throws(() => createAnalyticsSqlReader({ binding, now: () => TIME, ...opts }), /SQL_INVALID_/);
  }
  const reader = createAnalyticsSqlReader({ binding, enabled: true, now: () => TIME });
  for (const minutes of [0, 4, 61, 360, NaN, 5.5, '15']) {
    await assert.rejects(reader.aiErrorSummary({ minutes }), /SQL_WINDOW_OUT_OF_BOUNDS/);
  }
});

test('output privacy: provider statistics are reduced to numeric allowlisted aggregate metadata', async () => {
  const reader = createAnalyticsSqlReader({ enabled: true, now: () => TIME, binding: {
    async query() { return {
      data: [{ status: 200, requests: '42' }], rows: 1,
      statistics: { elapsed_ms: 7, rows_read: 20, bytes_read: 80,
        clientIP: '192.0.2.1', secret: 'TOP_SECRET' },
    }; },
  } });
  const result = await reader.httpStatusSummary();
  assert.deepEqual(result.statistics, { elapsedMs: 7, rowsRead: 20, bytesRead: 80 });
  assert.doesNotMatch(JSON.stringify(result), /TOP_SECRET|192\.0\.2\.1|clientIP/);
});

test('privacy negative: unexpected PII columns invalidate HTTP or AI aggregates', async () => {
  const http = createAnalyticsSqlReader({ enabled: true, now: () => TIME, binding: {
    async query() { return { data: [{ status: 200, requests: 5, clientIP: 'PRIVATE' }], rows: 1 }; },
  } });
  const ai = createAnalyticsSqlReader({ enabled: true, now: () => TIME, binding: {
    async query() { return { data: [{ errorCode: 429, inferences: 1, prompt: 'PRIVATE' }], rows: 1 }; },
  } });
  assert.deepEqual(await http.httpStatusSummary(), { status: 'UNKNOWN', reason: 'INVALID_DATA', retryCount: 0 });
  assert.deepEqual(await ai.aiErrorSummary(), { status: 'UNKNOWN', reason: 'INVALID_DATA', retryCount: 0 });
});

test('privacy negative: arbitrary AI error text gets bucketed and never leaks', async () => {
  const reader = createAnalyticsSqlReader({ enabled: true, now: () => TIME, binding: {
    async query() { return { data: [
      { errorCode: 'person@example.com sensitive secret', inferences: 2 },
      { errorCode: 'ANOTHER_PRIVATE_IDENTIFIER', inferences: 3 },
      { errorCode: '429', inferences: 1 },
    ], rows: 3 }; },
  } });
  const result = await reader.aiErrorSummary();
  assert.deepEqual(result.errors, [{ code: 'OTHER', inferences: 5 }, { code: '429', inferences: 1 }]);
  assert.doesNotMatch(JSON.stringify(result), /person@|PRIVATE_IDENTIFIER|sensitive/);
});

test('malformed rows, invalid stats, count overflow and excess groups fail closed', async () => {
  const invalid = [
    null, { data: [], rows: 2 }, { data: Array(21).fill({ status: 200, requests: 1 }), rows: 21 },
    { data: [{ status: 200, requests: -1 }], rows: 1 },
    { data: [{ status: 999, requests: 2 }], rows: 1 },
    { data: [{ status: 200, requests: Number.MAX_SAFE_INTEGER + 1 }], rows: 1 },
    { data: [{ status: 200, requests: 1 }], rows: 1, statistics: { elapsed_ms: -1 } },
  ];
  for (const value of invalid) {
    const reader = createAnalyticsSqlReader({ enabled: true, now: () => TIME,
      binding: { async query() { return value; } } });
    assert.equal((await reader.httpStatusSummary()).status, 'UNKNOWN');
  }
});

test('provider exception is redacted and non-retryable failures are never retried', async () => {
  let calls = 0;
  const reader = createAnalyticsSqlReader({ enabled: true, maxRetries: 1, now: () => TIME, binding: {
    async query() { calls++; throw Object.assign(new Error('token=PRIVATE'), { retryable: false }); },
  } });
  const result = await reader.httpStatusSummary();
  assert.deepEqual(result, { status: 'UNKNOWN', reason: 'PROVIDER_FAILURE', retryCount: 0 });
  assert.equal(calls, 1);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|token/);
});

test('429 requires an explicit retryable flag and otherwise fails closed without retry', async () => {
  let calls = 0;
  const reader = createAnalyticsSqlReader({ enabled: true, maxRetries: 1, now: () => TIME, binding: {
    async query() { calls++; throw Object.assign(new Error('429'), { status: 429 }); },
  } });
  assert.deepEqual(await reader.aiErrorSummary(), { status: 'UNKNOWN', reason: 'RATE_LIMITED', retryCount: 0 });
  assert.equal(calls, 1);
});

test('retryable 429: at most one retry with bounded backoff', async () => {
  let calls = 0;
  const reader = createAnalyticsSqlReader({ enabled: true, maxRetries: 1, retryDelayMs: 25,
    now: () => TIME, binding: { async query() {
      calls++;
      if (calls === 1) throw Object.assign(new Error('429'), { statusCode: 429, retryable: true });
      return { data: [{ status: 200, requests: 10 }], rows: 1 };
    } },
  });
  const result = await reader.httpStatusSummary();
  assert.equal(result.status, 'OK');
  assert.equal(result.retryCount, 1);
  assert.equal(calls, 2);
});

test('network failures marked retryable stop after one retry', async () => {
  let calls = 0;
  const reader = createAnalyticsSqlReader({ enabled: true, maxRetries: 1, retryDelayMs: 25,
    now: () => TIME, binding: { async query() {
      calls++; throw Object.assign(new Error('network failed'), { retryable: true });
    } },
  });
  assert.deepEqual(await reader.httpStatusSummary(),
    { status: 'UNKNOWN', reason: 'PROVIDER_FAILURE', retryCount: 1 });
  assert.equal(calls, 2);
});

test('timeouts fail closed and never retry an outstanding provider call', async () => {
  let calls = 0;
  const reader = createAnalyticsSqlReader({ enabled: true, maxRetries: 1, timeoutMs: 100,
    now: () => TIME, binding: { async query() { calls++; return new Promise(() => {}); } },
  });
  assert.deepEqual(await reader.httpStatusSummary(),
    { status: 'UNKNOWN', reason: 'TIMEOUT', retryCount: 0 });
  assert.equal(calls, 1);
});

test('local rate limit and in-flight limit block excess calls', async () => {
  let calls = 0;
  const limited = createAnalyticsSqlReader({ enabled: true, maxQueriesPerMinute: 1,
    now: () => TIME, binding: { async query() { calls++; return { data: [], rows: 0 }; } },
  });
  assert.equal((await limited.httpStatusSummary()).status, 'OK');
  assert.deepEqual(await limited.httpStatusSummary(), { status: 'UNKNOWN', reason: 'RATE_LIMITED', retryCount: 0 });
  assert.equal(calls, 1);
  let complete;
  const concurrent = createAnalyticsSqlReader({ enabled: true, now: () => TIME,
    binding: { async query() { return new Promise(resolve => { complete = () => resolve({ data: [], rows: 0 }); }); } },
  });
  const first = concurrent.httpStatusSummary();
  assert.deepEqual(await concurrent.httpStatusSummary(), { status: 'UNKNOWN', reason: 'BUSY', retryCount: 0 });
  complete();
  assert.equal((await first).status, 'OK');
});

test('query mutation negative: provider cannot change the fixed SQL recipe', async () => {
  const seen = [];
  const reader = createAnalyticsSqlReader({ enabled: true, now: () => TIME, binding: {
    async query(request) {
      seen.push(request.query);
      request.query = 'DELETE FROM events.httpRequests';
      request.params.host = 'evil.test';
      return { data: [{ status: 200, requests: 1 }], rows: 1 };
    },
  } });
  assert.equal((await reader.httpStatusSummary()).status, 'OK');
  assert.equal((await reader.httpStatusSummary()).status, 'OK');
  assert.equal(seen.length, 2);
  assert.equal(seen[0], seen[1]);
  assert.match(seen[1], /^SELECT /);
  assert.doesNotMatch(seen[1], /DELETE/);
});
