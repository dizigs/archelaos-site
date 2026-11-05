import { AdapterBlocked } from './adapters/common.mjs';

export class SqlSourceState {
  constructor(storage, clock = Date.now) {
    this.storage = storage; this.sql = storage.sql; this.clock = clock;
    this.sql.exec('CREATE TABLE IF NOT EXISTS source_state(source TEXT PRIMARY KEY,cursor TEXT,owner TEXT,expires INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 0)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS source_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,source TEXT NOT NULL,code TEXT NOT NULL,at INTEGER NOT NULL)');
  }
  getCursor(source) { return [...this.sql.exec('SELECT cursor FROM source_state WHERE source=?', source)][0]?.cursor || null; }
  initialize(source, cursor) {
    if (!/^(drive|gmail):[0-9a-f]{64}$/.test(source) || typeof cursor !== 'string' || !cursor || cursor.length > 1024) throw new AdapterBlocked('INVALID_SOURCE_CHECKPOINT');
    this.sql.exec('INSERT INTO source_state(source,cursor) VALUES(?,?)', source, cursor);
  }
  saveCursor(source, cursor, lease) {
    if (typeof cursor !== 'string' || !cursor || cursor.length > 1024 || lease.source !== source) throw new AdapterBlocked('INVALID_SOURCE_CHECKPOINT');
    this.storage.transactionSync(() => {
      const row = [...this.sql.exec('SELECT owner,expires FROM source_state WHERE source=?', source)][0];
      if (!row || row.owner !== lease.owner || row.expires <= this.clock()) throw new AdapterBlocked('SOURCE_LEASE_LOST');
      this.sql.exec('UPDATE source_state SET cursor=?,revision=revision+1 WHERE source=?', cursor, source);
      this.record(source, 'DURABLE_DELIVERY_CHECKPOINT', this.clock());
    });
  }
  record(source, code, at) {
    if (!/^(drive|gmail):[0-9a-f]{64}$/.test(source) || !/^[A-Z_]{3,60}$/.test(code)) throw new AdapterBlocked('INVALID_SOURCE_AUDIT');
    this.sql.exec('INSERT INTO source_audit(source,code,at) VALUES(?,?,?)', source, code, at);
  }
  async withLease(source, _observedAt, action) {
    const owner = crypto.randomUUID(); const now = this.clock();
    this.storage.transactionSync(() => {
      const old = [...this.sql.exec('SELECT owner,expires FROM source_state WHERE source=?', source)][0];
      if (!old) throw new AdapterBlocked('SOURCE_START_CHECKPOINT_REQUIRED');
      if (old.owner && old.expires > now) throw new AdapterBlocked('SOURCE_LEASE_BUSY');
      this.sql.exec('UPDATE source_state SET owner=?,expires=? WHERE source=?', owner, now + 60000, source);
    });
    try { return await action({ source, owner }); }
    finally { this.sql.exec('UPDATE source_state SET owner=NULL,expires=0 WHERE source=? AND owner=?', source, owner); }
  }
}
