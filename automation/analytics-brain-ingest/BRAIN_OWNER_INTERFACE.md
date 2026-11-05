# Brain owner handoff — `analytics.aggregate.v1` (NOT IMPLEMENTED)

**Repository:** `dizigs/archelaos-site` · **Analytics owner:** PR #196 → #220 → #230 · **Brain owner:** canonical `brain/**` only.
**Status:** interface specification; no service binding, no authenticated submit, no deployed analytics intake and no authority to deploy. Do not adapt the existing `/v1/events` metadata intake: at the verified `main` revision it rejects `analytics` and does not support aggregate snapshots.

## Existing upstream evidence, not new collection

The only eligible upstream producers are the existing private Actions exports:
- GA4/GSC: `.github/workflows/google-analytics-aggregate.yml`, run `41995891582`, artifact `13399354924`, ZIP SHA256 `c9874c2878b6dc99676774c17e357baef995107016db28fa54ba9a3a4c7ee752`, extracted JSON SHA256 `8dbd1de04c223475366c98ac9fa05db0fd8592aacecd74569d4bfa3abe2d0c61`.
- Clarity: `.github/workflows/clarity-daily-export.yml`, run `41994256131`, artifact `13399511832`, ZIP SHA256 `59260c1ce61bb6c05c3e8906ccf7da7f6b114d0e9f4bea7038fe1f05838cc2a2`, extracted JSON SHA256 `e210155e2864a0801d0989b892e3c4210ac86655041711fd958678bd9406dc2f`.

Hashes are evidence pointers, **never** authentication by themselves. GitHub API run, workflow, SHA, artifact membership, expiry and actual artifact bytes must be independently verified by the authorized reader. ZIP downloads and JSON stay private; no public links or metric values in the PR/CI log.

## Private service capability (minimum contract)

A private Cloudflare Service Binding scoped to the approved Analytics principal and its independently authenticated identity must expose `analytics.aggregate.v1` only after an explicit reviewer-controlled enable gate. The Analytics caller must verify a trusted Brain deployment identity / binding configuration rather than trusting a caller-supplied object with `version` booleans. The current `deliverToBrain` abstraction deliberately has **ports, not a configured production client**.

Required capability response after authenticated handshake:

```json
{
  "version": "analytics.aggregate.v1",
  "authenticatedServiceBinding": true,
  "durableSnapshotUpsert": true,
  "receiptSignatureVerification": true,
  "immutableReceiptReadback": true
}
```

The Brain implementation owns key issuance/rotation, a replay-resistant signed task intent (domain/version, bound principal, source, period, content SHA256, allowed operation, correlation, nonce, short expiry), and **independent verification** of receipts. No raw API tokens, IPs, cookies, query strings or per-visitor identifiers may appear in a task or response. A boolean on its own is not proof of identity or cryptographic integrity.

### `submitSnapshot(request)` (only after local provenance and consent approval)

The exact object already emitted by `deliverToBrain`:

```json
{
  "schemaVersion": 1,
  "operation": "UPSERT_NOT_INCREMENT",
  "snapshotKey": "search_console|2026-11-04|2026-11-04",
  "metricRevision": "<64 lowercase hexadecimal SHA256 of canonical normalized metric rows>",
  "event": "<validated aggregate-only event from PR #196>",
  "evidence": {
    "repository": "dizigs/archelaos-site",
    "runId": 41995891582,
    "artifactId": 13399354924,
    "runSha": "<verified 40-hex main commit>",
    "reportDigest": "<verified SHA256 of extracted JSON>",
    "workflow": "Google Search and GA4 daily aggregate",
    "observedAt": "<canonical UTC ISO8601 Z>"
  }
}
```

Example dates and IDs describe shape, not a production request. Exact event/metric data come solely from the verified private artifact; GSC uses site-wide date rows, GA4 uses daily active-user cohort threshold and Clarity is rolling 24h rather than calendar-day data.

### Durable atomic semantics (single Brain SQLite / Durable Object)

- Primary identity: `(source, period.from, period.to)`. A newer trusted run revision **replaces** an older snapshot; never add 28-day overlapping Google exports. Store source artifact identity (run ID + artifact ID + JSON digest + producer SHA + completion UTC), metric revision and immutable receipt atomically in **the existing Brain store**, not a second ledger.
- Same key + same exact metric revision is `DUPLICATE` with original durable receipt. A changed metric revision is `UPDATED` only after comparing independently trusted producer ordering (completion UTC, tie-broken deterministically by run ID). An older or ambiguous revision must be rejected or quarantined, **not** overwrite a newer snapshot. Make concurrent submissions serializable.
- Deduplication must be robust across worker restarts, network timeout, concurrent replicas and resubmission after partial failure. No additive counters; no paid AI or separate economic reservations. Record only approved bounded aggregates, and honor global/source kill switches and privacy pause.

### Signed receipt + immutable readback

After committing, return an independently verifiable cryptographic receipt binding all of `receiptId`, `eventId`, `snapshotKey`, `metricRevision`, `status` (ACCEPTED / DUPLICATE / UPDATED), `durable=true`, producer evidence digest, correlation, principal, key ID and timestamp. The signed canonical encoding / algorithm must be fixed by the Brain owner and verified separately from `submitSnapshot` (never trust the same caller-controlled callback to attest itself).

`readbackSnapshot({receiptId,eventId,snapshotKey})` must read the authoritative committed state and return `receiptId`, `eventId`, `snapshotKey`, `metricRevision`, `reportDigest`, `source`, `correlationId`, `durable=true`, independently signed and bound to the request and receipt. If an older duplicate receipt is returned while the active snapshot has since advanced, the Brain should expose immutable versioned receipt readback as well as current-key status; do not misrepresent an obsolete revision as current.

Uncertain submission, failed signature check or readback mismatch means **STOP and reconcile** by trusted query/receipt; do not blindly retry or count an ACK as successful delivery. Missing, stale, nonfinal or unauthenticated proof fails closed.

## Privacy / acceptance gates

- GA4: do not emit any cohort with fewer than 20 active users. Clarity: drop device cells with fewer than 20 sessions *before* rolling up and do not expose device rows. In the privately inspected 2026-11-05 exports, **zero** GA4 days and **zero** Clarity device cohorts qualify. GSC has 27 date rows above 20 impressions, which is a *volume rule*, **not unique-user anonymization or proof of GDPR compliance**.
- Only date + site-wide `/` approved metric rows. No raw search queries, device-level outputs, precise URLs, visitor IDs, IPs, recordings, emails, cookies, tracking changes or autonomous site optimization. Produce only `REVIEW_ONLY` hints; never write site content from analytics.
- Acceptance requires source privacy/legal review, Brain owner implementation and cryptographic tests, immutable SHA-pinned Actions checks, genuine authenticated private staging submit + signed receipt + durable restart readback, out-of-order/replay/revision tests and explicit human approval. Real existing artifacts and synthetic fixtures must be reported separately.
- No additional collector, schedule, paid AI provider, production deploy, secret, D1 instance or new Brain. Maintain the single €20/month Brain AI budget and centralized dispatcher.

**Owner request:** implement this capability under `brain/**` in your own branch; provide PR URL, head SHA, binding identity, signed receipt canonicalization, atomic key/revision semantics and independently verified staging readback. Analytics PR #230 must remain OFF until that proof exists.
