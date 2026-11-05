// Metadata-only safety store on the existing SQLite Durable Object.
// The advisory lease NEVER authorizes ScriptEditor writes or blocks Google IDE.
export class SQLiteSafetyStore {
  constructor(storage, now = () => Date.now()) {
    if (typeof storage?.transactionSync !== 'function' || typeof storage?.sql?.exec !== 'function') {
      throw new Error('ATOMIC_PRIVATE_SQLITE_REQUIRED');
    }
    this.storage = storage;
    this.sql = storage.sql;
    this.now = now;
    for (const statement of [
      'CREATE TABLE IF NOT EXISTS apps_script_inventory(script_id TEXT PRIMARY KEY,title TEXT NOT NULL,parent_id TEXT,source_hash TEXT NOT NULL,file_count INTEGER NOT NULL,remote_update_time TEXT,last_modify_user TEXT,trigger_visibility TEXT NOT NULL,entrypoints_json TEXT NOT NULL,deployments_json TEXT NOT NULL,versions_json TEXT NOT NULL,synced_at TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS apps_script_safety_leases(script_id TEXT PRIMARY KEY,holder_id TEXT NOT NULL,token_hash TEXT NOT NULL,expected_source_hash TEXT NOT NULL,acquired_at INTEGER NOT NULL,expires_at INTEGER NOT NULL)',
      'CREATE TABLE IF NOT EXISTS apps_script_audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT,timestamp TEXT NOT NULL,event_type TEXT NOT NULL,script_id TEXT,actor_id TEXT,outcome TEXT NOT NULL,reason_code TEXT,details_json TEXT NOT NULL)',
      'CREATE INDEX IF NOT EXISTS idx_apps_script_audit_script_time ON apps_script_audit_log(script_id,timestamp DESC)'
    ]) this.sql.exec(statement);
  }

  getInventorySnapshot(id) {
    const row = [...this.sql.exec('SELECT * FROM apps_script_inventory WHERE script_id=?', id)][0];
    if (!row) return null;
    return {
      scriptId: row.script_id, title: row.title, parentId: row.parent_id,
      sourceHash: row.source_hash, fileCount: row.file_count,
      remoteUpdateTime: row.remote_update_time, lastModifyUser: row.last_modify_user,
      triggerVisibility: row.trigger_visibility, syncedAt: row.synced_at
    };
  }

  upsertInventorySnapshot(s) {
    this.sql.exec(
      'INSERT INTO apps_script_inventory(script_id,title,parent_id,source_hash,file_count,remote_update_time,last_modify_user,trigger_visibility,entrypoints_json,deployments_json,versions_json,synced_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(script_id) DO UPDATE SET title=excluded.title,parent_id=excluded.parent_id,source_hash=excluded.source_hash,file_count=excluded.file_count,remote_update_time=excluded.remote_update_time,last_modify_user=excluded.last_modify_user,trigger_visibility=excluded.trigger_visibility,entrypoints_json=excluded.entrypoints_json,deployments_json=excluded.deployments_json,versions_json=excluded.versions_json,synced_at=excluded.synced_at',
      s.scriptId, s.title, s.parentId, s.sourceHash, s.fileCount, s.remoteUpdateTime,
      s.lastModifyUser, s.triggerVisibility, JSON.stringify(s.entrypoints),
      JSON.stringify(s.deployments), JSON.stringify(s.versions), s.syncedAt
    );
  }

  insertAuditLog(e) {
    this.sql.exec(
      'INSERT INTO apps_script_audit_log(timestamp,event_type,script_id,actor_id,outcome,reason_code,details_json) VALUES(?,?,?,?,?,?,?)',
      e.timestamp, e.eventType, e.scriptId, e.actorId, e.outcome, e.reasonCode, e.detailsJson
    );
  }

  getLease(scriptId) {
    const r = [...this.sql.exec('SELECT * FROM apps_script_safety_leases WHERE script_id=?', scriptId)][0];
    if (!r) return null;
    return {
      scriptId: r.script_id, holderId: r.holder_id, tokenHash: r.token_hash,
      expectedSourceHash: r.expected_source_hash, acquiredAt: r.acquired_at, expiresAt: r.expires_at
    };
  }

  // Atomic read-and-create. Unlike getLease() + upsertLease(), simultaneous
  // Workers cannot both acquire an unexpired lease.
  tryAcquireLease(record) {
    return this.storage.transactionSync(() => {
      const old = this.getLease(record.scriptId);
      if (old && old.expiresAt > this.now()) return false;
      this.sql.exec(
        'INSERT INTO apps_script_safety_leases(script_id,holder_id,token_hash,expected_source_hash,acquired_at,expires_at) VALUES(?,?,?,?,?,?) ON CONFLICT(script_id) DO UPDATE SET holder_id=excluded.holder_id,token_hash=excluded.token_hash,expected_source_hash=excluded.expected_source_hash,acquired_at=excluded.acquired_at,expires_at=excluded.expires_at',
        record.scriptId, record.holderId, record.tokenHash, record.expectedSourceHash,
        record.acquiredAt, record.expiresAt
      );
      return true;
    });
  }

  renewLease(scriptId, tokenHash, expiresAt) {
    return this.storage.transactionSync(() => {
      const old = this.getLease(scriptId);
      if (!old || old.tokenHash !== tokenHash || old.expiresAt <= this.now()) return false;
      this.sql.exec('UPDATE apps_script_safety_leases SET expires_at=? WHERE script_id=? AND token_hash=?',
        expiresAt, scriptId, tokenHash);
      return true;
    });
  }

  releaseLease(scriptId, tokenHash) {
    return this.storage.transactionSync(() => {
      const old = this.getLease(scriptId);
      if (!old || old.tokenHash !== tokenHash) return false;
      this.sql.exec('DELETE FROM apps_script_safety_leases WHERE script_id=? AND token_hash=?', scriptId, tokenHash);
      return true;
    });
  }
}
