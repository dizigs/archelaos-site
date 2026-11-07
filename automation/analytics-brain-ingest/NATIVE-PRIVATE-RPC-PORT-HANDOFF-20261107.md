# Analytics private RPC port — source-only bridge to canonical Brain

**Status:** CODE-ONLY / OFF / NO INSTALLED ANALYTICS CALLER / NO LIVE E2E / NO AI.

## Why this port

The existing Analytics private-ingest adapter uses opt-in Node 22 GitHub Actions artifacts and a five-method `brainPort` interface. Those existing `deliverToBrain()` calls previously relied on synthetic ports in tests; no concrete native Cloudflare Service Binding implementation existed in this module.

`src/native-private-port.mjs` now provides that **caller-side** implementation for an independently reviewed Cloudflare Worker runtime. This is not a Worker entrypoint and cannot itself run in GitHub Actions: GitHub Actions lacks Cloudflare's native `env.BRAIN_PRIVATE` binding. It does NOT solve the missing authorized GitHub Actions → private Cloudflare transfer; that remains an independent, release-blocking security boundary.

## Exact transport

```
[existing GitHub scheduled artifact exporters]  (unchanged)
                 │
     [existing Node 22 private ZIP + JSON reader]
                 │
     AUTHENTICATED, RESTRICTED AGGREGATE HANDOFF
                  (NOT YET DESIGNED/APPROVED/INSTALLED)
                 ▼
 [future trusted Cloudflare caller for Analytics]  (NOT DEPLOYED)
                 │
                 ├─ env.BRAIN_PRIVATE.fetch('https://brain.internal/healthz')
                 ├─ HMAC analytics-v1 GET /v1/capabilities/analytics
                 ├─ HMAC analytics-v1 POST /v1/intake/analytics
                 └─ HMAC analytics-v1 POST /v1/analytics/readback
                 ▼
   EXISTING archelaos-brain-staging + BrainCoordinator SQLite
```

The port calls **only** the trusted `env.BRAIN_PRIVATE.fetch` object. No use of global `fetch`, `workers.dev`, public endpoints, arbitrary URLs, auto retries or a second Coordinator/DB. Requests are signed HMAC-SHA256 over exact `method + newline + path + newline + unix_seconds + newline + exact raw JSON body`, with header `x-archelaos-key-id=analytics-v1`. GET requests sign an empty body; request JSON is capped at 4096 bytes, responses at 8192 bytes, and calls have abortable timeouts. A successful exact-SHA health check with `environment=staging` and `aiExecutionEnabled=false` is mandatory before capability probing, submit and readback.

The `deliverToBrain()` port verifies **independently keyed** canonical Brain HMAC ACK and immutable readback through existing `src/brain-signed-receipts.mjs`. The port refuses identical source signing and response verification keys. Unknown network delivery, bad signatures and mismatched readback remain fail-closed. All tests use synthetic in-memory Cloudflare-like fetch stubs, without access to real reports, Cloudflare credentials or provider writes.

## Hard release gates (NOT MET)

1. The Cloudflare account inventory still shows 9 Workers, **without** installed `archelaos-analytics`; the `automation/analytics-worker` package is code-only. This PR does not create, install or activate it or repurpose the already privileged Automation Bridge.
2. Source owner and operator must independently approve exact release SHA, per-caller authenticated private `BRAIN_PRIVATE` Service Binding, separate `BRAIN_ANALYTICS_INTAKE_KEY` and `BRAIN_CAPABILITY_RECEIPT_KEY` secrets, provenance and HMAC key rotation. Brain staging currently expires in 1970, and the Cloudflare `DEPLOY_SHA` setting does **not** prove the executable version; keep runtime OFF.
3. Trusted GitHub Actions artifact proof must include repository/run/head/UTC/artifact ZIP digest and extracted JSON digest, with source and privacy checks. The future GitHub → Worker handoff must explicitly disallow a public unauthenticated ingress, prevent caller-controlled authorization flags, enforce short-lived authentication and allow only privacy-approved aggregates. This port **must not** be used as an alternative to that gate.
4. Privacy/consent review: GA4 activeUsers≥20 for eligible rows; Clarity sessions≥20 per included device before aggregation; GSC impressions≥20 are a volume proxy and **do not establish anonymization**. No search terms, IDs, raw user/session records, cookies, page queries, private files or recording details. One immutable source/day snapshot UPSERT, not an increment.
5. Separate owner-reviewed temporary staging activation, real Cloudflare readback and native binding identity attestation, exact-SHA CI/CodeQL, an actual accepted signed receipt, independent durable readback after restart, replay/conflict cases, a hard kill switch, rollback and audit before any live use.

The connector does not report `DEPLOYED`, `CONNECTED` or `AUTHENTICATED` simply because its synthetic tests pass. No merge or deployment is authorized by this code-only PR.
