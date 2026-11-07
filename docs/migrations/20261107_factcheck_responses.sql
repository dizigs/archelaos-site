-- EU-only anonymous moderated research intake. No IP, no identities, no public results.
CREATE TABLE IF NOT EXISTS factcheck_responses (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 receipt TEXT NOT NULL UNIQUE,
 claim_id TEXT NOT NULL,
 choice TEXT NOT NULL CHECK (choice IN ('true','false','unknown')),
 evidence TEXT NOT NULL DEFAULT '',
 reference_url TEXT NOT NULL DEFAULT '',
 submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','reviewed','flagged','rejected'))
);
CREATE INDEX IF NOT EXISTS idx_factcheck_claim ON factcheck_responses(claim_id,submitted_at);
CREATE INDEX IF NOT EXISTS idx_factcheck_review ON factcheck_responses(review_status,submitted_at);
