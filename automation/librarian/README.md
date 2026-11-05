# ARCHELAOS — The Librarian (staging, separate Worker)

**Status: isolated staging Worker deployed 2026-11-05; imports disabled. NOT CONNECTED to Google/NotebookLM, NOT LIVE.** Canonical work: [Issue #193](https://github.com/dizigs/archelaos-site/issues/193), Shared Drive collector #55, central brain #108, historical Notebook bridge draft PR #178.

## Owner-approved architecture
The Librarian is separate from the central brain. It handles two independently guarded flows:

1. **Already archived Shared Drive PDFs:** `importApprovedPdf({fileId})` checks the file's actual Shared Drive, original type/version/size and an explicit test allowlist. A **private, separately provisioned PDF_EXTRACTOR Service binding** must extract the embedded text or perform Greek OCR and return page-numbered text. The Worker chunks it under the Notebook API's 1 MB per-source cap, retains page attribution and sends via `text_content`. No original is moved, renamed, made public or committed to GitHub.
2. **Published news:** `importPublishedNews({newsId})` reads canonical public `https://archelaos.club/news.json`, validates the requested published news ID and imports its public `sourceUrl` via `web_content`. The existing daily research/news publishing mechanism or central brain may call this Worker through **private Cloudflare Service bindings** after independently verifying source events; no second scraper or recurring schedule.
3. **Owner-requested one-PDF link experiment:** `probeApprovedDriveLink({fileId})` is explicitly gated. Google's public API docs state Drive URLs are unsupported, so HTTP 400 is expected; the actual provider result must be recorded if the test is attempted, without changing file visibility. A prior documentation lookup is *not* a real attempted provider upload.

## Required private secrets and permissions — NOT yet installed
- Personal Google account Notebook OAuth with `https://www.googleapis.com/auth/notebook`: `NOTEBOOK_CLIENT_ID`, `NOTEBOOK_CLIENT_SECRET`, `NOTEBOOK_REFRESH_TOKEN`, `NOTEBOOK_NAME`, `NOTEBOOK_PROJECT_ID`.
- Separately scoped Drive readonly OAuth: `DRIVE_CLIENT_ID`, `DRIVE_CLIENT_SECRET`, `DRIVE_REFRESH_TOKEN`. Configure `ARCHIVE_DRIVE_ID` privately for the **actual** Shared Drive and `APPROVED_PDF_IDS` with only reviewed, non-sensitive files.
- `LEDGER_INTERNAL_KEY` Worker secret; the SQLite Durable Object protects against duplicate submission. An uncertain remote response leaves a `RESERVED` record to reconcile manually; **never blind retry**.
- Trusted private `PDF_EXTRACTOR` service binding, not provided by this draft. **Tesseract is a native executable and cannot run directly inside a normal Worker**. The Greek OCR experiment in historical research PR #178 is local/CI, not a live private PDF service. Cost/privacy guards apply before building an OCR backend.
- Default import controls remain **disabled**: `ARCHIVE_IMPORT_ENABLED`, `NEWS_IMPORT_ENABLED`, `DRIVE_LINK_PROBE_ENABLED` must be explicitly set to `true` *only after* staging proof and reviewed private credentials.

The existing Chromebook OAuth test does not automatically transfer credentials to Cloudflare. The existing Apps Script OAuth or Gemini API key is not a substitute for Notebook OAuth.

## Network, security, and proof requirements
The default Worker `fetch()` always returns 404. The Wrangler config declares no public route, workers.dev host, or cron. Source processing is invoked only through a separately authorized caller's private Cloudflare Service binding. No private PDF bytes, private source IDs, tokens, arbitrary user URLs or results go into public GitHub CI/logs.

**Do not describe ingestion as live** until the deployed Worker, private PDF extraction service, approved Notebook OAuth, one real (non-sensitive) archived PDF, one news link, successful Notebook source `ACTIVE` readback, duplicate replay, and Cloudflare deployment logs all pass. File text may require chunking and human review of mixed/unclear pages. Notebook account source limits still apply.

Official API documentation: https://developers.google.com/notebook/docs/sources (in November 2026, only public web/YouTube or inline plain text/Markdown; no Drive URLs or PDF upload). This code deliberately uses text/Markdown for private archival extraction, and public web links for news.

## Actual Cloudflare staging deployment (verified 2026-11-05)

- Worker `archelaos-librarian-staging`, separately uploaded from PR #194 code without changing the central brain or existing bridge.
- Deployment ID `5e2dfa21-5f87-4308-83ea-4df84279f8f4`, version `d291424c-05fd-42df-b5b3-0891339ef658`, version traffic share 100% (no public route).
- Cloudflare readback confirms `subdomain.enabled=false`, `previews_enabled=false`, SQLite Durable Object binding `LEDGER`; all three import flags are `false`.
- No Google OAuth refresh secret, PDF extractor service binding, authorized caller or scheduled trigger installed. This is a deployed **inert runtime**, not any successful Notebook/Drive functional run.
- See `evidence/staging-20261105.json`. Owner-requested real PDF URL test is still blocked on secure Notebook OAuth availability.

## Offline checks
```bash
cd automation/librarian
npm run check
```
CI uses synthetic fixtures without secrets and runs only on PR/manual triggers. It proves code behavior, **not** real provider connectivity or a Cloudflare deployment.
