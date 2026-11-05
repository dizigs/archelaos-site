# Cloudflare Analytics SQL (Beta): single optional observability reader

Status: CODE-ONLY / REVIEW-ONLY. This does not add an endpoint, Worker, cron, route, D1 table, AI ledger, trigger, Cloudflare binding, or deployed SQL integration. Existing production and staging resources remain unchanged. Native SQL bindings require **Wrangler >=4.145.0** and owner review.

## Real account evidence (2026-11-06)

The existing Cloudflare connector successfully called the account-scoped SQL introspection and executed two real read-only HTTP aggregate queries, receiving `data`, `rows`, and `statistics.elapsed_ms` (28ms and 42ms). Observed analytics datasets include `events.httpRequests`, `events.aiInference`, `events.challengeApi`, `events.d1Queries`, and `logs.workersLogs`. Only `events.httpRequests` and `events.aiInference` are used by this adapter because their columns were introspected. `logs.workersLogs` is not supported via the native binding currently. Availability does not prove production connectivity or binding entitlement for every script.

## Native binding: opt in per owner, never everywhere

For a selected Worker with a compatible Wrangler version, a reviewed owner can add:

```toml
[analytics]
binding = "ANALYTICS_SQL"
```

or JSONC: `"analytics": { "binding": "ANALYTICS_SQL" }`.

The Worker should then consume this shared reader, which is disabled by default:

```js
import { createAnalyticsSqlReader } from './reviewed-path/reader.mjs';
const reader = createAnalyticsSqlReader({ binding: env.ANALYTICS_SQL, enabled: env.SQL_OBSERVABILITY_ENABLED === 'true' });
const evidence = await reader.httpStatusSummary({ host: 'archelaos.club', minutes: 15 });
// Forward only aggregated metadata through the canonical Brain's existing intake
// after identity, audit and receipt validation are approved by the Brain owner.
```

Do not copy the example import path into production unchanged; resolve it in the existing build layout. This module exports read-only functions; it deliberately contains no caller-controlled raw SQL, token storage, auto-trigger, notification path, kill-switch bypass, privileged incident decision, paid AI call or data persistence.

**Handoffs to current owners (do not concurrently edit their files):**
- Analytics PRs #196 → #220 → #230: aggregate reports and drift evidence; preserve existing GA4/GSC/Clarity private exports; do not duplicate ingestion.
- Self-Heal/Security PR #235: supporting evidence only, never auto-remediate or bypass CI and durable Brain receipts.
- Canonical Brain PR #234: read-only advisory aggregation only. Keep canonical DO/SQLite AI ledger and €20/month cap authoritative. No second budget accounting.
- Cloudflare connectivity PR #233: verify installed scripts, bindings, staging identity and least-privilege configuration; do not deploy or flip an expired Brain staging flag in this PR.
- Other Workers: no SQL binding by default. Add it only when an owner documents a specific need and observes an actual benefit.

## Safety and limits

- Fixed SQL `SELECT` statements only; no user-controlled SQL string; Cloudflare binding derives account scope automatically and rejects accountTag in the query.
- Window 5–60 minutes, account-scoped aggregates only; host allowlist restricted to archelaos.club subdomains; no IPs, prompts, raw event bodies, PII, secrets, or media content in responses.
- No automatic retries: query rejections fail closed. Callers must enforce bounded rate/CPU, monitoring budget and privacy controls before enabling.
- The Beta SQL API is analytics/observability only. It is not Durable Object SQLite, D1, or a substitute for authoritative Brain business data.
- Native binding does not currently support `logs.workersLogs` and does not accept a `FORMAT` clause. Verify plan permissions before staging.

Tests: `node --test automation/analytics-sql-observability/reader.test.mjs`.

Docs: https://developers.cloudflare.com/analytics/sql-api/workers-binding/ and https://developers.cloudflare.com/analytics/sql-api/limits/.
