# Inline correction proposals — STAGED / NOT ACTIVE

Status: 2026-11-06, isolated draft. Visitor interface matches the existing favorite hearts and opens with a 220 ms fade + downward slide + slight scale, disabled when reduced motion is preferred.

## Identity and workflow

Each entry is attached to a category, immutable record ID, title, original page URL, short text excerpt and its SHA-256 hash, proposed text, optional public source link, UTC timestamp, and review status. Canonical Hall IDs come directly from the displayed biography. Other dialogs use IDs already present in their favorite controls. Submissions never modify historical public text automatically.

## Reuse

Use the existing Cloudflare Pages deployment, the existing PRIVATE ARCHIVE_DB D1 binding designed for the archive intake, server-side Turnstile Siteverify, short-lived rate hashes and a new private corrections table. No second Brain, new Worker, cron, AI consumption or separate budget ledger. The prior dormant archive-suggestions prototype remains unchanged.

## Activation checklist

1. Apply the proposed SQL migration in docs/migrations/20261106_text_corrections.sql to the intended private D1 only after privacy/security and EU residency review; this branch does not run it.
2. Verify the actual Pages deployment SHA and bindings. Configure ARCHIVE_DB and secrets TURNSTILE_SECRET and ARCHIVE_RATE_SALT, and variables ARCHIVE_TURNSTILE_HOSTNAME and TEXT_CORRECTIONS_SITE_KEY. The secret and rate salt must never be committed.
3. Verify Turnstile action text_correction and exact hostname. Only after real staging E2E and explicit authorization set ENABLE_TEXT_CORRECTIONS=true. Until then, GET reports disabled and POST rejects with 503.
4. Provide an Access-authenticated private moderation and export workflow, decisions/audit records, retention and deletion policy, rate-bucket cleanup, privacy notice and proven rollback.
5. Test exact SHA, mobile/desktop keyboard operation, Escape, nested dialogs, throttling, duplicate submissions, source sanitization, malicious input, loss of connectivity and real staging receipts. Existing CI and independent acceptance gates remain mandatory before merge.

Public data never contains visitor submissions or private metadata. Reviewer decisions require human research and historical source verification. No automatic approval or AI-based publication.

Offline test command: node --test tests/text-corrections.test.mjs
