-- Apply on PRIVATE Cloudflare D1 only, before activating Pages Functions.
-- No user IPs or contact addresses are stored in public historical JSON.
CREATE TABLE IF NOT EXISTS archive_suggestions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('person','event','verification_request','general')),
  record_id TEXT NOT NULL,
  description TEXT NOT NULL,
  public_source_url TEXT NOT NULL DEFAULT '',
  content_hash TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewing','needs_evidence','approved_for_editor','rejected')),
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewer_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_suggestions_review ON archive_suggestions(status,created_at);
CREATE TABLE IF NOT EXISTS archive_rate_buckets (
  ip_hash TEXT NOT NULL,
  minute INTEGER NOT NULL,
  hits INTEGER NOT NULL DEFAULT 1 CHECK(hits BETWEEN 1 AND 5),
  PRIMARY KEY(ip_hash,minute)
);
CREATE INDEX IF NOT EXISTS idx_rate_minute ON archive_rate_buckets(minute);
-- Rotate ARCHIVE_RATE_SALT periodically; delete old rate buckets regularly.
-- Approved_for_editor does NOT mean publication. Manual research approval is separate.
