/**
 * Aggregate-only Cloudflare Analytics SQL reader. No Worker, triggers, routes, ledger,
 * auth, or action execution. Attach through a review-approved native binding only.
 * The binding itself derives the account scope; never supply accountTag in SQL.
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

function normalizeWindow(minutes) {
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 60) {
    throw new RangeError('SQL_WINDOW_OUT_OF_BOUNDS');
  }
  return minutes;
}

function safeHost(host) {
  if (typeof host !== 'string' || host.length > 253 ||
      !/^(?:[a-z0-9-]+\.)*archelaos\.club$/i.test(host)) {
    throw new TypeError('SQL_HOST_NOT_ALLOWLISTED');
  }
  return host.toLowerCase();
}

function validateResult(result, limit) {
  if (!result || !Array.isArray(result.data) || result.data.length > limit ||
      !Number.isInteger(result.rows) || result.rows !== result.data.length) {
    throw new Error('SQL_MALFORMED_RESULT');
  }
  return result.data;
}

function validatedTimestamp(now, minutes) {
  const time = now();
  if (!Number.isFinite(time) || time < Date.UTC(2026, 0, 1)) {
    throw new Error('SQL_INVALID_CLOCK');
  }
  return new Date(time - normalizeWindow(minutes) * 60_000).toISOString();
}

function boundedTotal(value) {
  // Cloudflare may serialize a COUNT as a numeric string.
  const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('SQL_INVALID_COUNT');
  return n;
}

/** No dynamic or caller-supplied SQL; no PII fields or raw logs. */
export function createAnalyticsSqlReader({ binding, enabled = false, now = Date.now } = {}) {
  if (typeof enabled !== 'boolean' || typeof now !== 'function') {
    throw new TypeError('SQL_INVALID_CONFIG');
  }
  async function query(sql, params, limit) {
    if (!enabled) return { status: 'DISABLED', rows: [] };
    if (typeof binding?.query !== 'function') throw new Error('SQL_BINDING_MISSING');
    const result = await binding.query({ query: sql, params });
    return { status: 'OK', rows: validateResult(result, limit), statistics: result.statistics };
  }
  return Object.freeze({
    async httpStatusSummary({ host = 'archelaos.club', minutes = 15 } = {}) {
      const sanitizedHost = safeHost(host);
      const since = validatedTimestamp(now, minutes);
      const result = await query(QUERIES.httpStatuses, { since, host: sanitizedHost }, 20);
      if (result.status !== 'OK') return result;
      return {
        status: 'OK',
        host: sanitizedHost,
        windowMinutes: minutes,
        statuses: result.rows.map(row => ({
          status: Number(row.status),
          requests: boundedTotal(row.requests),
        })).map(row => {
          if (!Number.isInteger(row.status) || row.status < 100 || row.status > 599) {
            throw new Error('SQL_INVALID_STATUS');
          }
          return row;
        }),
        statistics: result.statistics,
      };
    },
    async aiErrorSummary({ minutes = 15 } = {}) {
      const since = validatedTimestamp(now, minutes);
      const result = await query(QUERIES.aiErrors, { since }, 15);
      if (result.status !== 'OK') return result;
      return {
        status: 'OK',
        windowMinutes: minutes,
        errors: result.rows.map(row => ({
          // Error codes are metadata, not request/response content.
          code: row.errorCode === null ? 'NONE' : String(row.errorCode).slice(0, 80),
          inferences: boundedTotal(row.inferences),
        })),
        statistics: result.statistics,
      };
    },
  });
}
