// One Durable Object instance provides atomic anti-replay, rate and circuit state.
// No KV eventual consistency and no per-Worker in-memory budget.
const VALID_KEY = /^[a-z0-9:._-]{1,128}$/;
const keyOK = key => { if (!VALID_KEY.test(key)) throw new Error('INVALID_SECURITY_KEY'); };

export function createSqlSecurityStore(storage, { minuteLimit = 30, dailyLimit = 1000,
  breakerFailures = 3, breakerBackoffMs = 60000 } = {}) {
  if (!storage?.sql || typeof storage.transactionSync !== 'function')
    throw new Error('DURABLE_SQL_STORAGE_REQUIRED');
  if (![minuteLimit, dailyLimit, breakerFailures, breakerBackoffMs].every(Number.isSafeInteger) ||
      minuteLimit < 1 || minuteLimit > 10000 || dailyLimit < 1 || dailyLimit > 1000000 ||
      breakerFailures < 1 || breakerFailures > 20 || breakerBackoffMs < 1000 || breakerBackoffMs > 3600000)
    throw new Error('INVALID_GUARD_LIMITS');
  const sql = storage.sql;
  sql.exec('CREATE TABLE IF NOT EXISTS guard_nonces(id TEXT PRIMARY KEY, expires INTEGER NOT NULL)');
  sql.exec('CREATE TABLE IF NOT EXISTS guard_rates(k TEXT PRIMARY KEY,used INTEGER NOT NULL,expires INTEGER NOT NULL)');
  sql.exec('CREATE TABLE IF NOT EXISTS guard_breakers(k TEXT PRIMARY KEY, failures INTEGER NOT NULL, mode TEXT NOT NULL, retry_at INTEGER NOT NULL)');
  const first = (query, ...params) => [...sql.exec(query, ...params)][0];
  const mutate = fn => storage.transactionSync(fn);
  return Object.freeze({
    claim: (keyId, nonce, expires, now) => mutate(() => {
      keyOK(keyId); keyOK(nonce);
      if (!Number.isSafeInteger(now) || !Number.isSafeInteger(expires) || expires <= now || expires - now > 600001)
        throw new Error('INVALID_REPLAY_TTL');
      sql.exec('DELETE FROM guard_nonces WHERE expires<=?', now);
      const id = keyId + ':' + nonce;
      if (first('SELECT id FROM guard_nonces WHERE id=?', id)) return false;
      const count = first('SELECT COUNT(*) AS n FROM guard_nonces')?.n;
      if (!Number.isSafeInteger(count) || count >= 25000) throw new Error('NONCE_STORAGE_FULL');
      sql.exec('INSERT INTO guard_nonces(id,expires) VALUES(?,?)', id, expires);
      return true;
    }),
    consume: (key, now) => mutate(() => {
      keyOK(key);
      if (!Number.isSafeInteger(now)) throw new Error('INVALID_CLOCK');
      sql.exec('DELETE FROM guard_rates WHERE expires<=?', now);
      for (const [window, max, size] of [['m', minuteLimit, 60000], ['d', dailyLimit, 86400000]]) {
        const bucket = Math.floor(now / size);
        const k = window + ':' + key + ':' + bucket;
        const existing = first('SELECT used FROM guard_rates WHERE k=?', k);
        if (existing?.used >= max) return false;
      }
      for (const [window, size] of [['m', 60000], ['d', 86400000]]) {
        const bucket = Math.floor(now / size);
        const k = window + ':' + key + ':' + bucket;
        sql.exec('INSERT INTO guard_rates(k,used,expires) VALUES(?,1,?) ON CONFLICT(k) DO UPDATE SET used=used+1', k, (bucket + 1) * size);
      }
      return true;
    }),
    before: (key, now) => mutate(() => {
      keyOK(key);
      const row = first('SELECT * FROM guard_breakers WHERE k=?', key);
      if (!row || row.mode === 'CLOSED') return true;
      if (row.mode === 'HALF_OPEN' || now < row.retry_at) return false;
      // Only ONE probe can transition OPEN -> HALF_OPEN atomically.
      sql.exec('UPDATE guard_breakers SET mode=? WHERE k=?', 'HALF_OPEN', key);
      return true;
    }),
    record: (key, success, now) => mutate(() => {
      keyOK(key);
      if (typeof success !== 'boolean' || !Number.isSafeInteger(now)) throw new Error('INVALID_BREAKER_OUTCOME');
      const row = first('SELECT * FROM guard_breakers WHERE k=?', key);
      if (success) {
        sql.exec('INSERT INTO guard_breakers(k,failures,mode,retry_at) VALUES(?,0,?,0) ON CONFLICT(k) DO UPDATE SET failures=0,mode=excluded.mode,retry_at=0', key, 'CLOSED');
        return 'CLOSED';
      }
      const failures = Math.min((row?.failures || 0) + 1, 20);
      const open = row?.mode === 'HALF_OPEN' || failures >= breakerFailures;
      const backoff = Math.min(breakerBackoffMs * (2 ** Math.min(Math.max(failures - breakerFailures, 0), 6)), 3600000);
      sql.exec('INSERT INTO guard_breakers(k,failures,mode,retry_at) VALUES(?,?,?,?) ON CONFLICT(k) DO UPDATE SET failures=excluded.failures,mode=excluded.mode,retry_at=excluded.retry_at',
        key, failures, open ? 'OPEN' : 'CLOSED', open ? now + backoff : 0);
      return open ? 'OPEN' : 'CLOSED';
    })
  });
}
