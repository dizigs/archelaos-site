-- Apply only in a separately approved staging D1 database. No scheduled writes.
CREATE TABLE IF NOT EXISTS ads_receipts (
  idempotency_key TEXT PRIMARY KEY NOT NULL,
  intent_hash TEXT NOT NULL,
  kind TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('IN_FLIGHT','APPLIED','REJECTED','NEEDS_RECONCILIATION')),
  correlation_id TEXT NOT NULL,
  resource_name TEXT,
  request_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ads_receipts_created_idx ON ads_receipts(created_at);
