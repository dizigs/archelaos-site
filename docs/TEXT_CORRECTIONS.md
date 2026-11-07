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

## 2026-11-07 — Updated release acceptance
- User requested activation of popup correction proposals alongside the participatory museum research (PR #296). This PR remains a **separate** correction endpoint, not the 61-item Fact Check intake.
- Rebased by an ancestry-preserving merge commit onto current main only after checking no overlapping source paths. Independent exact-HEAD CI and safe staging acceptance still required.
- Data store: dedicated EU-only ARCHIVE_DB with `text_corrections` and `text_correction_rate`, provisioned but no production submissions yet. `ENABLE_TEXT_CORRECTIONS` stays OFF until a proven hosted end-to-end test.
- Privacy: anonymous proposals without name/email, short-lived secret-salted IP hashes only to rate-limit abuse; reviewer access is restricted. Operator must honor privacy/deletion requests in the site's Policy of Privacy and periodically purge expired rate rows and unnecessary personal data.
- Rollback: set ENABLE_TEXT_CORRECTIONS=false and redeploy, preserve moderation records; do not delete or publish user content automatically.

## STAGING SLOT — 2026-11-07
- Dedicated Pages preview limited to this PR's branch, with EU-only `ARCHIVE_DB` preview database and an independent Turnstile widget for `archelaos-site.pages.dev`.
- Keep `ENABLE_TEXT_CORRECTIONS=false` until preview hostname, protected form submission, D1 receipt readback and privacy/rollback behavior are verified. Only then turn on production, using the same exact-HEAD reviewed code and its own EU D1 binding.
- Never infer preview success from PR CI alone; capture provider deployment SHA, logs, exact URL and form/readback evidence.

- Preview Cloudflare hostname `feat-popup-text-corrections.archelaos-site.pages.dev` and EU-only D1 schema were confirmed on 07/11/2026; preview submissions enabled for staged tests while production remains disabled. Do not carry preview credentials into production.
