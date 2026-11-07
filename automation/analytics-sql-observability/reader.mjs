/**
 * Optional, account-scoped Analytics SQL readback. No Worker, route, authorization
 * endpoint, schedule, writes, ledger, or Brain integration. A privileged caller
 * must independently authorize access before enabling the native binding.
 */
const QUERIES = Object.freeze({
  httpStatuses: `SELECT edgeResponseStatus AS status, COUNT(*) AS requests
FROM events.httpRequests
WHERE timestamp >= $since AND clientRequestHttpHost = $host
GROUP BY edgeResponseStatus
ORDER BY requests DESC LIMIT 20`,
  aiErrors: `SELECT errorCode AS errorCode, COUNT(*) AS inferences
FROM events.aiInference
WHERE timestamp >= $since
GROUP BY errorCode
ORDER BY inferences DESC LIMIT 15`,
});

function boundedInteger(value, min, max, name) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(name);
  }
  return value;
}

function safeHost(host) {
  if (typeof host !== 'string' || host.length > 253 ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*archelaos\.club$/i.test(host)) {
    throw new TypeError('SQL_HOST_NOT_ALLOWLISTED');
  }
  return host.toLowerCase();
}

function timestamp(now, minutes) {
  boundedInteger(minutes, 5, 60, 'SQL_WINDOW_OUT_OF_BOUNDS');
  const time = now();
  if (!Number.isFinite(time) || time < Date.UTC(2026, 0, 1) ||
      !Number.isFinite(time - minutes * 60_000)) {
    throw new Error('SQL_INVALID_CLOCK');
  }
  return { time, since: new Date(time - minutes * 60_000).toISOString() };
}

function count(value) {
  const numeric = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(numeric) || numeric < 0) throw new Error('SQL_INVALID_COUNT');
  return numeric;
}

function strictRow(row, names) {
  if (!row || typeof row !== 'object' || Array.isArray(row) ||
      Object.keys(row).length !== names.length ||
      names.some(name => !Object.hasOwn(row, name))) {
    throw new Error('SQL_INVALID_ROW');
  }
  return row;
}

function sanitizeStats(stats) {
  if (stats === undefined) return undefined;
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) {
    throw new Error('SQL_INVALID_STATS');
  }
  // Never forward provider statistics wholesale; unknown fields may be private.
  const publicStats = {};
  for (const [from, to] of [
    ['elapsed_ms', 'elapsedMs'], ['rows_read', 'rowsRead'], ['bytes_read', 'bytesRead'],
  ]) {
    if (stats[from] !== undefined) {
      if (!Number.isFinite(stats[from]) || stats[from] < 0 ||
          stats[from] > Number.MAX_SAFE_INTEGER) throw new Error('SQL_INVALID_STATS');
      publicStats[to] = stats[from];
    }
  }
  return publicStats;
}

function resultRows(result, limit) {
  if (!result || typeof result !== 'object' || !Array.isArray(result.data) ||
      result.data.length > limit || !Number.isInteger(result.rows) ||
      result.rows !== result.data.length) throw new Error('SQL_MALFORMED_RESULT');
  return { rows: result.data, statistics: sanitizeStats(result.statistics) };
}

function httpRows(rows) {
  return rows.map(row => {
    strictRow(row, ['status', 'requests']);
    const status = typeof row.status === 'string' && /^\d{3}$/.test(row.status)
      ? Number(row.status) : row.status;
    if (!Number.isInteger(status) || status < 100 || status > 599) {
      throw new Error('SQL_INVALID_STATUS');
    }
    return { status, requests: count(row.requests) };
  });
}

function aiRows(rows) {
  const aggregate = new Map();
  for (const row of rows) {
    strictRow(row, ['errorCode', 'inferences']);
    const value = row.errorCode;
    if (value !== null && typeof value !== 'string' && typeof value !== 'number') {
      throw new Error('SQL_INVALID_ERROR_CODE');
    }
    // Codes are metadata, but free-form error strings can contain personal data.
    // Only expose numeric status-like codes; bucket everything else as OTHER.
    const code = value === null ? 'NONE' :
      (/^[1-5]\d{2}$/.test(String(value)) ? String(value) : 'OTHER');
    const total = (aggregate.get(code) ?? 0) + count(row.inferences);
    if (!Number.isSafeInteger(total)) throw new Error('SQL_INVALID_COUNT');
    aggregate.set(code, total);
  }
  return [...aggregate].map(([code, inferences]) => ({ code, inferences }));
}

function withTimeout(queryPromise, timeoutMs) {
  let timer;
  return Promise.race([
    Promise.resolve(queryPromise),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('SQL_TIMEOUT')), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

function unknown(reason, retryCount = 0) {
  return { status: 'UNKNOWN', reason, retryCount };
}

/**
 * A per-instance safety limiter supplements (never replaces) upstream auth,
 * distributed rate-limiting and Cloudflare billing controls.
 * maxRetries defaults to 0, and is capped at one retry for retryable errors.
 */
export function createAnalyticsSqlReader({
  binding, enabled = false, now = Date.now,
  timeoutMs = 1500, maxQueriesPerMinute = 4,
  maxRetries = 0, retryDelayMs = 50,
} = {}) {
  if (typeof enabled !== 'boolean' || typeof now !== 'function') {
    throw new TypeError('SQL_INVALID_CONFIG');
  }
  boundedInteger(timeoutMs, 100, 3000, 'SQL_INVALID_TIMEOUT');
  boundedInteger(maxQueriesPerMinute, 1, 30, 'SQL_INVALID_RATE');
  boundedInteger(maxRetries, 0, 1, 'SQL_INVALID_RETRIES');
  boundedInteger(retryDelayMs, 25, 250, 'SQL_INVALID_RETRY_DELAY');
  let bucketStart = null;
  let used = 0;
  let busy = false;

  function takeQuota(time) {
    if (bucketStart === null || time - bucketStart >= 60_000) {
      bucketStart = time;
      used = 0;
    }
    if (time < bucketStart || used >= maxQueriesPerMinute) return false;
    used++;
    return true;
  }

  async function query(recipe, params, limit, time) {
    if (!enabled) return { status: 'DISABLED', rows: [] };
    if (typeof binding?.query !== 'function') return unknown('BINDING_UNAVAILABLE');
    if (busy) return unknown('BUSY');
    busy = true;
    try {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (!takeQuota(time)) return unknown('RATE_LIMITED', Math.max(0, attempt - 1));
        try {
          const response = await withTimeout(binding.query({ query: QUERIES[recipe], params }), timeoutMs);
          return { status: 'OK', ...resultRows(response, limit), retryCount: attempt };
        } catch (error) {
          const timedOut = error?.message === 'SQL_TIMEOUT';
          const rateLimited = error?.status === 429 || error?.statusCode === 429 ||
            error?.code === 429 || error?.code === '429';
          const canRetry = !timedOut && error?.retryable === true && attempt < maxRetries;
          if (!canRetry) return unknown(
            timedOut ? 'TIMEOUT' : rateLimited ? 'RATE_LIMITED' :
              error?.message === 'SQL_MALFORMED_RESULT' || error?.message === 'SQL_INVALID_STATS'
                ? 'INVALID_DATA' : 'PROVIDER_FAILURE', attempt,
          );
          await new Promise(resolve => setTimeout(resolve, retryDelayMs * (2 ** attempt)));
        }
      }
      return unknown('PROVIDER_FAILURE', maxRetries);
    } finally {
      busy = false;
    }
  }

  return Object.freeze({
    async httpStatusSummary({ host = 'archelaos.club', minutes = 15 } = {}) {
      const hostname = safeHost(host);
      const { time, since } = timestamp(now, minutes);
      const result = await query('httpStatuses', { since, host: hostname }, 20, time);
      if (result.status !== 'OK') return result;
      try {
        return { status: 'OK', host: hostname, windowMinutes: minutes,
          statuses: httpRows(result.rows), statistics: result.statistics,
          retryCount: result.retryCount };
      } catch { return unknown('INVALID_DATA', result.retryCount); }
    },
    async aiErrorSummary({ minutes = 15 } = {}) {
      const { time, since } = timestamp(now, minutes);
      const result = await query('aiErrors', { since }, 15, time);
      if (result.status !== 'OK') return result;
      try {
        return { status: 'OK', windowMinutes: minutes, errors: aiRows(result.rows),
          statistics: result.statistics, retryCount: result.retryCount };
      } catch { return unknown('INVALID_DATA', result.retryCount); }
    },
  });
}
