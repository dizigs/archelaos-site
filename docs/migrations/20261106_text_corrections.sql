-- Private Cloudflare D1 database, reusing ARCHIVE_DB (NOT the canonical Brain ledger).
-- Do not apply to production or enable submission before reviewed staging.
CREATE TABLE IF NOT EXISTS text_corrections (
  id TEXT PRIMARY KEY,
  record_kind TEXT NOT NULL CHECK(record_kind IN ('person','news','story','moment','view','interview','match','photo')),
  record_id TEXT NOT NULL,
  record_title TEXT NOT NULL,
  source_page TEXT NOT NULL,
  text_excerpt TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  description TEXT NOT NULL,
  public_source_url TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewing','needs_evidence','approved_for_editor','rejected')),
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewer_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_text_corrections_review ON text_corrections(status,created_at);
CREATE INDEX IF NOT EXISTS idx_text_corrections_record ON text_corrections(record_kind,record_id);
CREATE TABLE IF NOT EXISTS text_correction_rate (
  ip_hash TEXT NOT NULL,
  minute INTEGER NOT NULL,
  hits INTEGER NOT NULL DEFAULT 1 CHECK(hits BETWEEN 1 AND 5),
  PRIMARY KEY(ip_hash,minute)
);
CREATE INDEX IF NOT EXISTS idx_text_correction_rate_minute ON text_correction_rate(minute);
-- Purge expired rate rows regularly. A pending or approved_for_editor suggestion
-- never modifies public JSON or a historical biography automatically.
