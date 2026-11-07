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
- Default zero retries; optional one retry only for native provider errors marked retryable. Default timeout 1.5s, four calls per minute per reader instance, one in-flight call. 429/network/invalid results fail closed as UNKNOWN. Upstream distributed limits, private authorization and billing protection remain required.
- The Beta SQL API is analytics/observability only. It is not Durable Object SQLite, D1, or a substitute for authoritative Brain business data.
- Native binding does not currently support `logs.workersLogs` and does not accept a `FORMAT` clause. Verify plan permissions before staging.

Tests: `node --test automation/analytics-sql-observability/reader.test.mjs`.

Docs: https://developers.cloudflare.com/analytics/sql-api/workers-binding/ and https://developers.cloudflare.com/analytics/sql-api/limits/.


## Final security acceptance contract — draft, code-only, OFF

The adapter exports only two fixed aggregate SELECT query recipes with named parameters, COUNT, GROUP BY and literal LIMIT (20 HTTP status groups, 15 AI error groups). It has no raw SQL interface, mutation callback, DML, credentials, public HTTP endpoint or Cloudflare accountTag predicate. Host values are allowlisted to archelaos.club and syntactically valid subdomains; time windows must be whole minutes from 5 to 60.

The native binding scopes queries to the Cloudflare account. The HTTP recipe filters to one host, but the AI inference recipe has no verified per-host partition: label its counts **account-wide**, never verified traffic for a specific site. Private identity checks and tenant permissions must be enforced by a future owner-approved caller; this module does not authorize callers itself.

The reader drops all unknown provider-statistics properties and forwards only numeric elapsedMs, rowsRead and bytesRead. Unexpected result columns fail closed. AI error codes are reduced to 3-digit numeric codes or OTHER; null becomes NONE. Prompt text, personal identifiers, free-form provider errors, original raw rows and passwords must never be displayed or logged.

Default behavior: disabled, 1500 ms timeout (100–3000 permitted), at most four provider calls/minute per instance (1–30 permitted), one in-flight call, zero retries. An owner may explicitly configure **one maximum retry** with 25–250 ms backoff, only if the native binding marks the error retryable. 429 without that flag never retries. Timed-out operations never retry, and a timeout does not cancel a provider query already in progress. Local rate limits are not distributed across Worker isolates; deployment would still require separately verified global throttling and cost controls.

All results use an explicit status: OK, DISABLED or UNKNOWN. UNKNOWN returns only a bounded reason (BINDING_UNAVAILABLE, BUSY, RATE_LIMITED, TIMEOUT, INVALID_DATA or PROVIDER_FAILURE) and retry count, not raw provider errors. Consumers may not infer zero incidents, success, spending authorization or remediation permission from stale/UNKNOWN data.

### Future read-only Control Center contract: archelaos.observability.aggregate.v1

This is a **schema proposal only**, not an active endpoint or Brain integration. Suggested envelope fields: schemaVersion, generatedAt, windowStart, windowEnd, sourceStatuses, metrics. A source must explicitly be OK, DISABLED, UNKNOWN or STALE, with a verified origin/time window. Forbid raw SQL, unbounded rows, visitor IPs, cookies, secrets, prompts, actor names and raw error descriptions.

| Proposed aggregate fields | Authoritative source | Boundary |
| --- | --- | --- |
| http.statusCounts[], http.total | This SQL reader | Allowlisted host; numeric status counts, 5–60 minutes |
| ai.errorCounts[], ai.inferences | This SQL reader | Account-wide numeric/OTHER code counts only |
| brain.receipts, brain.quarantined | Existing canonical Brain receipts | Cannot be inferred from SQL |
| workers.executions, workers.failures | Owner-approved aggregate Worker telemetry | No raw logs or identifiers |
| incidents.open, incidents.resolved | Existing incident registry/owner | No raw incident descriptions |
| ci.passed, ci.failed, ci.unknown | GitHub exact-SHA check aggregates | Verified freshness and commit scope |
| retries.attempts, retries.exhausted, failures.total | Approved Brain/Worker aggregate receipts | No stack traces or error bodies |
| aiBudget.month, aiBudget.capCents, aiBudget.spentCents, aiBudget.state | **Existing canonical Brain AI ledger only** | No second ledger or SQL cost approximation |

AI budget: the firm cap remains **€20 per month = 2,000 euro cents**. Suggested display warnings: 70%, 90%, and block at 100%. Only the canonical Brain ledger and its pre-existing cost gate can authorize/block paid AI operations; the SQL adapter merely displays approved evidence. UNKNOWN or stale spending must not be treated as zero or permission to spend. No automatic top-ups, new billable service, billing settings change, increased cap or inferred pricing are authorized. SQL API access/cost entitlement must separately be reviewed before any activation.

GA4, Google Search Console and Microsoft Clarity stay completely independent. No ingestion or code modifications to their pipelines, and no changes to PR #248 (consent), #249 (Control Center), or other owner paths.

### Acceptance matrix and blockers

| Control | Evidence | Status |
| --- | --- | --- |
| SELECT-only, parameterization, fixed limits, host allowlist | Source review + mock SQL shape tests | CODE PASS |
| Privacy, SQL injection, unexpected columns, query mutation | Negative mock Node tests | CODE PASS |
| 429, network errors, bounded retries, timeouts, per-instance quota | Deterministic fake-binding tests | CODE PASS |
| Disabled by default; no Worker/database/endpoint | PR file ownership and source review | CODE PASS |
| Aggregates for Brain, Workers, incidents, CI, retries, AI spending | Schema only; non-SQL sources owned elsewhere | NOT INTEGRATED |
| €20 AI cap | Existing canonical ledger is authority, not queried here | NOT LIVE-VERIFIED |
| Exact-head CI, mergeability, security checks | Must be rechecked after final commit | PENDING |
| Distributed limits, private authenticated staging, Cloudflare permission and billing review | Deployment/integration expressly excluded | BLOCKER |

Reproduction without live Cloudflare queries:

    node --check automation/analytics-sql-observability/reader.mjs
    node --check automation/analytics-sql-observability/reader.test.mjs
    node --test automation/analytics-sql-observability/reader.test.mjs

Existing original PR evidence of successful past read-only account introspection is historical only. It cannot prove final-head CI, runtime binding permissions, billing, or secure staging. No merge, live SQL writes, Worker deployment, or active Brain connection is permitted here.

Native binding docs: https://developers.cloudflare.com/analytics/sql-api/workers-binding/
SQL API limits: https://developers.cloudflare.com/analytics/sql-api/limits/
