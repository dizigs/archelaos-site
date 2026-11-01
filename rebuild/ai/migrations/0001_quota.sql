-- Configure on a dedicated D1 database, not on a public-facing data store.
CREATE TABLE IF NOT EXISTS ai_daily_usage (
 day TEXT PRIMARY KEY NOT NULL,
 requests INTEGER NOT NULL CHECK(requests >= 0)
);
-- No question text, IP addresses or private documents are stored.
