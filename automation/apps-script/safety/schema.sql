-- Isolated Apps Script inventory, advisory lease and metadata-only audit.
-- No Google source, OAuth tokens, full credentials or user files are stored.
CREATE TABLE IF NOT EXISTS apps_script_inventory (
  script_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  parent_id TEXT,
  source_hash TEXT NOT NULL,
  file_count INTEGER NOT NULL,
  remote_update_time TEXT,
  last_modify_user TEXT,
  trigger_visibility TEXT NOT NULL,
  entrypoints_json TEXT NOT NULL,
  deployments_json TEXT NOT NULL,
  versions_json TEXT NOT NULL,
  synced_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS apps_script_safety_leases (
  script_id TEXT PRIMARY KEY,
  holder_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expected_source_hash TEXT NOT NULL,
  acquired_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS apps_script_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  event_type TEXT NOT NULL,
  script_id TEXT,
  actor_id TEXT,
  outcome TEXT NOT NULL,
  reason_code TEXT,
  details_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_apps_script_audit_script_time
  ON apps_script_audit_log (script_id, timestamp DESC);
