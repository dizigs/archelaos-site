# Archelaos Analytics Worker — private adapter for the central Brain

**Status: code-only staging; NOT DEPLOYED; NOT CONNECTED.**
This new Worker does not replace, access, or schedule the existing private daily Clarity and GA4/Search Console exports. It consumes *only* pre-reviewed, aggregated metrics delivered later by the trusted central Brain. Existing sources: `.github/workflows/clarity-daily-export.yml`, `.github/workflows/google-analytics-aggregate.yml`, and their consent/privacy mechanisms.

## Explicit boundary

- The central Brain is the sole dispatcher and AI router. The Analytics Worker itself NEVER calls Gemini, Cloudflare AI or OpenAI; `externalAiCalls:0`.
- `fetch()` is always 404. `workers_dev=false`, `preview_urls=false`, no cron, no triggers and no credentials in this package.
- A permitted calling Worker must use a privately authorized Cloudflare Service binding and independently validate the underlying Google/GitHub/Clarity aggregate artifact, signed producer receipt, permissions, revision and provenance before calling `normalizeForBrain`.
- A synthetic `reportDigest` shape check in this code is **not source authentication**. Never infer it is. The Brain verifies actual artifact bytes/hash and establishes trust.
- The report schema accepts only `source`, `reportDigest`, `period`, `metrics`. Rows allow a canonical URL *path only* (no hostname, query, fragment), approved metric type, nonnegative numeric value and sample size.
- Small cohorts with `sampleSize<20` are suppressed and values never leave this adapter. Raw recordings, session IDs, cookies, email addresses, per-visitor data and search phrases fail validation.
- Deterministic event ID per source+artifact digest+period supports dedupe in the **Brain** queue; the Analytics Worker never claims that the Brain's queue, service binding, schema mapper or consumer is live.
- `ANALYTICS_ENABLED=false` by default. No spending, new Analytics account, key, schedule or public export allowed.

## Acceptance for enabling
1. Verify actual private Clarity and GA4 export runs and legal basis/consent. No public raw artifacts.
2. Define and independently test the exactly scoped producer-to-Brain receipt and Brain-to-Analytics Service binding.
3. Establish artifact hash/readback and source adapters; reject replays and malformed/flooded events in the central queue.
4. Verify every metric mapping against actual provider report schema, not guessed fields, with min-sample policy.
5. Test one synthetic report -> analytics normalization -> unique Brain receipt; then an authorized real aggregated report -> Brain receipt/readback, without any raw visitor data.
6. Only then stage/deploy with actual Cloudflare logs, review CI/security gates, and enable a bounded source at a time.

Use `cd automation/analytics-worker && npm run check` for fixture-only offline validation. No other Worker or brain source files are changed by this PR.
