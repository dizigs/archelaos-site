import { ScriptFault } from './security.mjs';

// Uses the existing Worker's future authorized SQLite DO storage port. This
// module creates no Worker/namespace and cannot make KV get/put atomic.
export class SqlScriptStore {
  constructor(storage, clock = Date.now) {
    if (typeof storage?.transactionSync !== 'function' || typeof storage?.sql?.exec !== 'function') throw new ScriptFault('ATOMIC_PRIVATE_STORE_REQUIRED', 503);
    this.storage = storage; this.sql = storage.sql; this.clock = clock;
    for (const statement of [
      'CREATE TABLE IF NOT EXISTS script_operations(id TEXT PRIMARY KEY,project TEXT NOT NULL,actor TEXT NOT NULL,digest TEXT NOT NULL,status TEXT NOT NULL,backup TEXT,intended TEXT,trigger_hash TEXT,updated INTEGER NOT NULL,result TEXT)',
      'CREATE TABLE IF NOT EXISTS script_project_locks(project TEXT PRIMARY KEY,operation TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS script_private_blobs(id TEXT PRIMARY KEY,cipher TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS script_oauth_states(id TEXT PRIMARY KEY,cipher TEXT NOT NULL,expires INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0)',
      'CREATE TABLE IF NOT EXISTS script_oauth_start_rate(bucket INTEGER PRIMARY KEY,count INTEGER NOT NULL)',
      'CREATE TABLE IF NOT EXISTS script_oauth_sessions(id TEXT PRIMARY KEY,cipher TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS script_admin_grants(actor TEXT PRIMARY KEY,session TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS script_browser_backup_confirmations(id TEXT PRIMARY KEY, expires INTEGER NOT NULL)',
      'CREATE TABLE IF NOT EXISTS script_refresh_claims(id TEXT PRIMARY KEY)',
      'CREATE TABLE IF NOT EXISTS script_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,operation TEXT NOT NULL,code TEXT NOT NULL,at INTEGER NOT NULL)'
    ]) this.sql.exec(statement);
  }
  audit(id, code) { this.sql.exec('INSERT INTO script_audit(operation,code,at) VALUES(?,?,?)', id, code, Date.now()); }
  begin(id, project, actor, digest) {
    return this.storage.transactionSync(() => {
      const old = [...this.sql.exec('SELECT * FROM script_operations WHERE id=?', id)][0];
      if (old) {
        if (old.project !== project || old.actor !== actor || old.digest !== digest) throw new ScriptFault('OPERATION_ID_CONFLICT');
        return { fresh: false, status: old.status, result: old.result ? JSON.parse(old.result) : null };
      }
      if ([...this.sql.exec('SELECT COUNT(*) AS n FROM script_operations')][0].n >= 1000) throw new ScriptFault('PRIVATE_JOURNAL_CAPACITY_REACHED', 429);
      if ([...this.sql.exec('SELECT operation FROM script_project_locks WHERE project=?', project)].length) throw new ScriptFault('PROJECT_OPERATION_IN_PROGRESS', 423);
      this.sql.exec('INSERT INTO script_operations(id,project,actor,digest,status,updated) VALUES(?,?,?,?,?,?)', id, project, actor, digest, 'PREPARING', this.clock());
      this.sql.exec('INSERT INTO script_project_locks(project,operation) VALUES(?,?)', project, id);
      this.audit(id, 'PREPARING'); return { fresh: true };
    });
  }
  attachBackup(id, backup) { this.sql.exec('UPDATE script_operations SET backup=? WHERE id=? AND status=?', backup, id, 'PREPARING'); }
  sent(id, intended, trigger) { this.sql.exec('UPDATE script_operations SET status=?,intended=?,trigger_hash=?,updated=? WHERE id=? AND status=?', 'WRITE_IN_FLIGHT', intended, trigger, this.clock(), id, 'PREPARING'); this.audit(id, 'WRITE_IN_FLIGHT'); }
  finish(id, result, release = true) {
    this.storage.transactionSync(() => {
      this.sql.exec('UPDATE script_operations SET status=?,result=?,updated=? WHERE id=?', result.status, JSON.stringify(result), this.clock(), id);
      if (release) this.sql.exec('DELETE FROM script_project_locks WHERE operation=?', id);
      this.audit(id, result.status);
    });
  }
  inspect(id, project, actor) {
    const row = [...this.sql.exec('SELECT id,status,backup,intended,trigger_hash,updated,result FROM script_operations WHERE id=? AND project=? AND actor=?', id, project, actor)][0];
    return row ? { operationId: row.id, status: row.status, intendedHash: row.intended, backupId: row.backup, triggerHash: row.trigger_hash, updatedAt: row.updated, result: row.result ? JSON.parse(row.result) : null } : null;
  }
  putPrivate(id, cipher) {
    this.storage.transactionSync(() => {
      const totals = [...this.sql.exec('SELECT COUNT(*) AS n,COALESCE(SUM(length(cipher)),0) AS bytes FROM script_private_blobs')][0];
      if (totals.n >= 64 || totals.bytes + cipher.length > 32 * 1024 * 1024) throw new ScriptFault('PRIVATE_BACKUP_CAPACITY_REACHED', 429);
      this.sql.exec('INSERT INTO script_private_blobs(id,cipher) VALUES(?,?)', id, cipher);
    });
  }
  getPrivate(id) { return [...this.sql.exec('SELECT cipher FROM script_private_blobs WHERE id=?', id)][0]?.cipher; }
  putState(id, cipher, expires) {
    this.storage.transactionSync(() => {
      const now = this.clock(); const bucket = Math.floor(now / 60000);
      this.sql.exec('DELETE FROM script_oauth_states WHERE expires<=? OR used=1', now);
      this.sql.exec('DELETE FROM script_oauth_start_rate WHERE bucket<?', bucket - 1);
      const rate = [...this.sql.exec('SELECT count FROM script_oauth_start_rate WHERE bucket=?', bucket)][0]?.count || 0;
      if (rate >= 30 || [...this.sql.exec('SELECT COUNT(*) AS n FROM script_oauth_states')][0].n >= 256) throw new ScriptFault('OAUTH_START_RATE_LIMIT', 429);
      this.sql.exec('INSERT INTO script_oauth_start_rate(bucket,count) VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1', bucket);
      this.sql.exec('INSERT INTO script_oauth_states(id,cipher,expires) VALUES(?,?,?)', id, cipher, expires);
    });
  }
  peekState(id, now) { return [...this.sql.exec('SELECT cipher FROM script_oauth_states WHERE id=? AND used=0 AND expires>?', id, now)][0]?.cipher; }
  consumeState(id, now) {
    return this.storage.transactionSync(() => {
      const cipher = this.peekState(id, now); if (!cipher) throw new ScriptFault('OAUTH_STATE_EXPIRED_OR_REPLAYED', 401);
      this.sql.exec('UPDATE script_oauth_states SET used=1,cipher=? WHERE id=?', '', id); return cipher;
    });
  }
  registerBackupConfirmation(id, expires) {
    this.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM script_browser_backup_confirmations WHERE expires<=?', this.clock());
      const n = [...this.sql.exec('SELECT COUNT(*) AS n FROM script_browser_backup_confirmations')][0].n;
      if (n >= 12) throw new ScriptFault('BACKUP_CONFIRMATION_CAPACITY_REACHED', 429);
      this.sql.exec('INSERT INTO script_browser_backup_confirmations(id,expires) VALUES(?,?)', id, expires);
    });
  }
  consumeBackupConfirmation(id) {
    this.storage.transactionSync(() => {
      const row = [...this.sql.exec('SELECT id FROM script_browser_backup_confirmations WHERE id=? AND expires>?', id, this.clock())][0];
      if (!row) throw new ScriptFault('BACKUP_CONFIRMATION_EXPIRED_OR_REPLAYED', 409);
      this.sql.exec('DELETE FROM script_browser_backup_confirmations WHERE id=?', id);
    });
  }
  putSession(id, cipher) { this.sql.exec('INSERT INTO script_oauth_sessions(id,cipher) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET cipher=excluded.cipher', id, cipher); }
  getSession(id) { return [...this.sql.exec('SELECT cipher FROM script_oauth_sessions WHERE id=?', id)][0]?.cipher; }
  bindGrant(actor, session) { this.sql.exec('INSERT INTO script_admin_grants(actor,session) VALUES(?,?) ON CONFLICT(actor) DO UPDATE SET session=excluded.session', actor, session); }
  grantSession(actor) { return [...this.sql.exec('SELECT session FROM script_admin_grants WHERE actor=?', actor)][0]?.session; }
  claimRefresh(id) {
    return this.storage.transactionSync(() => {
      if ([...this.sql.exec('SELECT id FROM script_refresh_claims WHERE id=?', id)].length) throw new ScriptFault('REFRESH_RECONCILIATION_REQUIRED', 423);
      this.sql.exec('INSERT INTO script_refresh_claims(id) VALUES(?)', id);
    });
  }
}
