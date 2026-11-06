# Librarian → Canonical Brain: first news-only private readiness review

**Status:** SOURCE-ONLY / FAIL-CLOSED / NOT CONNECTED / NO PROVIDER CALL / NO LIVE IMPORT.

## Decision and scope

This work implements **no active connection**. It provides an independent metadata-only readiness assessment of the EXISTING `archelaos-librarian-staging` as a future producer of **independently verified `news.search.completed` event metadata** for `archelaos-brain-staging`. It does not authorize the reverse direction (Brain instructing Librarian to import PDF/news into Notebook), a new Worker, a public route, or a second queue/ledger. The existing `automation/cloudflare-brain-integration/client.mjs` has already prepared a disabled-by-default `news` source adapter; this PR does not duplicate it.

The **PR #194** Librarian implementation remains Draft. Its head `634a6b2059b27e95c6fe77329320d3b9c17ab1f9` is diverged from `main` at assessment: GitHub compare reported 36 commits ahead and 490 behind. Its code contains `importPublishedNews` and `importApprovedPdf`, which can call external providers after separate approval. No attempt was made to merge, rebase, deploy or invoke those routines. Do not assume the PR #194 source is identical to the installed Worker executable.

## Evidence obtained, 6–7 November 2026

- Current GitHub `main` at inspection: `edb817f5077caec5a1495be11f0f90ba66d91e02`.
- Fresh authenticated **read-only Cloudflare settings/deployments GET**: `archelaos-librarian-staging` deployment `5e2dfa21-5f87-4308-83ea-4df84279f8f4`, version `d291424c-05fd-42df-b5b3-0891339ef658`. Binding `LEDGER` is an existing `LibrarianLedger` Durable Object. **Zero `BRAIN_PRIVATE` native service bindings** and zero Brain news/receipt `secret_text` metadata on this caller. `NEWS_IMPORT_ENABLED=false`, `ARCHIVE_IMPORT_ENABLED=false`, `DRIVE_LINK_PROBE_ENABLED=false`.
- `archelaos-brain-staging` latest observed deployment `bac07481-10c6-4c82-8251-8dfb2ce8a0a6`, version `e565910f-bbb4-44f6-b0b5-3463906ce495`; configured `DEPLOY_SHA=5c5401d57fda3a3d1a815c48b43f55a2741a8ded`, **not a separately verified executable hash**. `STAGING_EXPIRES_AT=1970-01-01T00:00:00Z`. Canonical `BRAIN` DO exists. No `BRAIN_NEWS_INTAKE_KEY` or `BRAIN_CAPABILITY_RECEIPT_KEY` secret metadata observed. An existing `HEALER` Service Binding to Self-Heal is unrelated and **must not be modified**.
- No private Google Drive, PDF, photo, OCR, Notebook, source URL, user record, credential value, or live event was read or sent. No Cloudflare API writes.

## Readiness contract introduced here

`librarian-news-readiness.mjs` is a **pure**, non-authorizing eligibility checker. It can classify a supplied evidence package as `BLOCKED` or `READY_FOR_OWNER_STAGING_REVIEW`, but **always** reports `connected:false`, `authenticatedE2EVerified:false`, `privatePdfReadAuthorized:false`, `notebookWriteAuthorized:false`, `liveImportEnabled:false`.

The checklist requires:

1. **Preservation of installed resources:** `LEDGER` remains the exact `LibrarianLedger` DO. Caller has a **single approved** native `BRAIN_PRIVATE` Service Binding to existing `archelaos-brain-staging`, without aliases/public fallback.
2. **Separate principals and receipts:** `news-v1` / `BRAIN_NEWS_INTAKE_KEY` on caller and Brain; `BRAIN_CAPABILITY_RECEIPT_KEY` metadata on both for signed ACK/readback verification. Distinct trust domains must be independently attested, not inferred from secret names.
3. **No import activation:** all three deployed Librarian flags `NEWS_IMPORT_ENABLED`, `ARCHIVE_IMPORT_ENABLED`, `DRIVE_LINK_PROBE_ENABLED` remain exact literal `false`.
4. **Exact release identity:** approved source SHA plus independent **deployed executable** attestation (configured `DEPLOY_SHA` is insufficient), a finite staging window of at most 60 minutes, private transport, and source-owner/Brain-owner/operator approval.
5. **Independent provenance:** trusted `news.search.completed` source receipt, source-bound HMAC, immutable event/correlation IDs, durable local audit, signed Brain receipt and separate source-scoped readback. An article title, similar club name, published URL, or a self-declared `verified:true` Boolean is **not** authoritative provenance.
6. **No side effects:** no PDF/Drive reads, no Notebook source creation, no Cron, no real import, no AI budget consumption, no public ingress or new coordinator in this phase. A timeout or uncertain ACK remains UNKNOWN for manual readback reconciliation, never automatically retried.

The negative tests are imported into the existing `binding-plan.test.mjs` execution path, which is already imported by the Cloudflare adapter test suite. They only use synthetic metadata and do not issue external requests. A passed offline suite proves only the **testable fail-closed predicates**, never real connectivity or historical attribution.

## Blocked next handoff

The designated Librarian source owner must first reconcile the stale PR #194 with current main *in their own scope*, attest its exact source/provenance implementation, and decide whether the Librarian should **emit** a news discovery event or only **consume** a Brain-approved command. These are different trust boundaries and cannot be treated as equivalent. Do not enable the existing `importPublishedNews` simply to prove Brain event delivery.

Only the release/operator owner can separately review complete Cloudflare binding/config updates preserving the existing Ledger/Brain/Healer resources and prove real private staging SHA, signed event → persisted receipt → readback → restart, with rollback. Until then, **NO-GO / BLOCKED**.
