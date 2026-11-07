# Analytics → Brain: private handoff readiness decision (2026-11-07)

**Status:** REVIEW-ONLY / NO-GO FOR LIVE TRANSPORT / NO DEPLOYMENT / NO PRIVATE ARTIFACT FETCH / NO AI.

## Scope and existing components

Existing private GitHub Actions exporters already collect **aggregate** GA4 + Google Search Console and Clarity summaries:
- `.github/workflows/google-analytics-aggregate.yml`, artifact `google-search-ga4-private-report`;
- `.github/workflows/clarity-daily-export.yml`, artifact `clarity-private-aggregate-report`.

The existing Node 22 private artifact verifier, `automation/analytics-brain-ingest/src/github-artifacts.mjs`, verifies GitHub run/artifact association, ZIP digest, extracted JSON bytes and source-specific schema **when called with properly scoped authorized credentials**. The existing Analytics normalization and signed-ack/readback verification code is already under `automation/analytics-worker/`, `automation/analytics-brain-ingest/`, and the canonical Brain capability route in `brain/src/worker.mjs`. This scope does **not** add a second collector or adapter.

Important trust boundary:

```
Existing GitHub Actions scheduled private exports
         │  [future authorized actions:read, verified ZIP + JSON]
         ▼
Node 22 private artifact reader (NOT a Cloudflare Worker)
         │  [trusted, separately approved aggregate-only handoff: NOT INSTALLED]
         ▼
Future reviewed private Cloudflare Analytics caller (NOT INSTALLED)
         │  BRAIN_PRIVATE native Cloudflare Service Binding + analytics-v1 HMAC
         ▼
Existing archelaos-brain-staging → BrainCoordinator SQLite
         │  immutable snapshot UPSERT + signed ACK and signed readback
         ▼
Review-only aggregate metrics (AI and publishing remain OFF)
```

**Do not** call `env.BRAIN_PRIVATE.fetch()` from GitHub Actions/Node: native Cloudflare Service Bindings exist only in Worker runtime. Do not replace the missing private handoff with guessed `workers.dev` URLs, a new public endpoint, auto-deploying the code-only `archelaos-analytics` Worker, the existing Automation Bridge, or a second Brain/ledger without a separately reviewed scope.

## Live Cloudflare inventory rechecked (read-only)

Account associated with `archelaos.club`, GET `/accounts/{id}/workers/scripts` and GET Brain settings:
- **9** installed scripts; **no `archelaos-analytics`** installed, and no Analytics-named script.
- The canonical `archelaos-brain-staging` still has `STAGING_EXPIRES_AT=1970-01-01T00:00:00Z`; configured `DEPLOY_SHA=5c5401d57fda3a3d1a815c48b43f55a2741a8ded` is settings text and does not attest executable bytes.
- `BRAIN_ANALYTICS_INTAKE_KEY`, `BRAIN_CAPABILITY_RECEIPT_KEY`, `BRAIN_PRIVATE_CAPABILITIES_ENABLED`, and `BRAIN_PRIVATE_SERVICE_BINDINGS_VERIFIED` were **not observed as current binding names**. The absence of a configured flag is fail-closed; no flags were enabled.
- A separate installed `HEALER` service binding for the existing Self-Heal link has been previously observed and is **out of scope**. Nothing in this proposal may remove or overwrite it.

No private ZIP, JSON report values, API tokens, visitor data, consent records or keys were read in this task. Historic examples in `analytics-brain-ingest/README.md` are **not** treated as live proof or a fresh 2026-11-07 export. The current source adapter and synthetic tests are not evidence of Cloudflare E2E or legal/privacy approval.

## New independent review-only gate

The new `src/private-readiness.mjs` and `test/private-readiness.test.mjs` are **pure, credential-free predicates** for a future `archelaos-analytics` caller. The future caller is only a candidate; this work **does not authorize creation or deployment**. A matching native `BRAIN_PRIVATE` binding, independent `analytics-v1` request key, separate signed Brain receipt verifier, canonical Brain `BRAIN` Durable Object, source ingestion evidence and an explicitly time-limited staging window are necessary before review. Independent attestation of the exact deployed executable is required; a SHA variable in a config is not enough. The candidate Analytics Worker must keep `ANALYTICS_ENABLED=false`.

The gate checks allowlisted GitHub repository/workflow/artifact identities, authorized ZIP/JSON digest readback, source/consent/aggregate privacy attestation, a genuine trusted GitHub→Cloudflare aggregate-only transport, snapshot `UPSERT_NOT_INCREMENT`, immutable current-version readback, UNKNOWN reconciliation without blind resend and explicit owner/operator permissions.

It **always** returns `connected:false`, `remoteE2EVerified:false`, `anyDataDelivered:false`, `privateArtifactsAccessed:false`, `deploymentAuthorized:false`, `aiSpendingAuthorized:false`, even if synthetic inputs result in `READY_FOR_OWNER_PRIVATE_STAGING_REVIEW`.

## Privacy and accuracy restrictions

- GA4: require **at least 20 active users** in eligible aggregate cohort before forwarding.
- Clarity: exclude device cells with **fewer than 20 sessions** before any site-wide rollup; do not expose device-level breakdowns, recordings, session IDs or personal data. The previous-24-hour Clarity window is not comparable to calendar-day totals and **must not be summed across overlapping windows**.
- GSC: `impressions >= 20` is a **volume threshold, not k-anonymity** or proof of 20 unique humans. Require separate GDPR/legal/source review.
- No raw private artifacts, visitor histories, IPs, query/search terms, campaign IDs, contact information, page URLs with parameters or media session recordings in a Brain event or CI log.
- No new Google, Clarity or Cloudflare collection, public tracking, cron, Google Ads request, publisher, AI budget ledger or provider inference. Keep the shared AI ceiling €20/month in the existing Brain only.

## Next owner decisions, NOT executed in this PR

1. Approve a **specific private Cloudflare runtime** or another independently verified private connector boundary; choose whether the existing `archelaos-analytics` *code-only* proposal warrants a future installation or whether an already-installed, permission-scoped caller can safely support the handoff. This is not decided by a mock.
2. Independently establish the authorized GitHub Actions artifact reader → approved private Cloudflare caller connection, keeping actual artifact bytes inaccessible to public logs and without granting the caller GitHub write permission.
3. Exact-SHA independent Brain executable attestation, scoped HMAC/receipt secret bindings, short staging activation, source-specific receipt evidence and an explicit one-time operator review of all preserved Cloudflare bindings/routes.
4. One verified real **privacy-approved aggregate-only** test of private handoff, HMAC signed accepted receipt and independently signed immutable readback including restart/idempotency/out-of-order validation; stop on every UNKNOWN or failed security check.
5. Existing scheduled exporters, canonical BrainCoordinator ledger, paused AI, and all other Workers must remain unchanged. No merge/deploy until CI + CodeQL + applicable privacy/security controls and owner approval.

**Release decision at creation:** BLOCKED for private E2E and production activation, independent of offline test outcome.
