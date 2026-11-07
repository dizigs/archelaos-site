# Canonical Brain capability intake — 2026-11-05

Owner: **`brain/**` only**. Existing `BrainCoordinator` / `BRAIN` Durable Object / SQLite migration is reused. This change **does not** introduce another Worker, DO, D1 database, ledger, scheduler, provider, production deployment, or autonomous executor.

## Existing main and contracts

Based on main `c89823a21efc1fa9f979b17a6567337a498a1969` after merges #111, #202, #219, #222. The old `/v1/events` interface continues to accept the six existing metadata sources and is **not** repurposed to accept Analytics or Apps Script. The extra `automation/brain-boundary/event-contract.mjs` six-field event is not the same envelope as the legacy file source event or the specialised #201/#220 contracts; it is **not automatically interchangeable**.

The new signed source identities are `analytics-v1` (secret `BRAIN_ANALYTICS_INTAKE_KEY`) and `apps-script-v1` (secret `BRAIN_APPS_SCRIPT_INTAKE_KEY`). Both use the established canonical Brain request HMAC: `METHOD + "\n" + PATH + "\n" + 10-digit epoch seconds + "\n" + exact UTF-8 JSON body`. Neither identity has operator-control or execution authority. Signed identity controls **source origin, not external provider provenance**.

## Source-scoped interface (staging only, disabled by default)

| Authentication | Method/path | Contract |
| --- | --- | --- |
| analytics-v1 | GET `/v1/capabilities/analytics` | #220 `analytics.aggregate.v1` capability |
| analytics-v1 | POST `/v1/intake/analytics` | #220 `submitSnapshot({schemaVersion,event,snapshotKey,metricRevision,evidence,operation})` |
| apps-script-v1 | GET `/v1/capabilities/apps-script` | #201 `{schemaVersion,source,transport,status,deploymentDigest}` |
| apps-script-v1 | POST `/v1/intake/apps-script` | #201 `buildVerifiedAppsScriptEvent` metadata-only event |

Both `BRAIN_PRIVATE_CAPABILITIES_ENABLED=true` **and** `BRAIN_PRIVATE_SERVICE_BINDINGS_VERIFIED=true` must be set through a reviewed staging configuration, otherwise HTTP 423 and no write. Those flags **do not independently prove Cloudflare Service Binding connectivity**; the operator must inspect read-only actual bindings and ingress reachability. With the current `workers_dev=true` repo configuration, **do not activate this interface** until private-only reachability and a current, unexpired deployment have been proven separately. Existing `STAGING_EXPIRES_AT=1970-01-01` disables the entire Worker as written.

Analytics requires a separate `BRAIN_CAPABILITY_RECEIPT_KEY` of at least 43 characters **before persisting a delivery**. The SHA-256 HMAC covers `audience + "\n" + JSON.stringify(unsignedEnvelope)`, where `unsignedEnvelope` contains all response fields except `receiptSignature`, including `issuedAtMs`, `audience`, `principal` and `keyId`. The verifier must obtain the secret from a trusted runtime binding, never from the request or an untrusted `verified` flag. The #220 bridge's `verifyReceipt` port can verify this signature plus exact event/snapshot/revision; code is not integrated into that team's branch. Receipt signatures alone do not establish source artifact authenticity: trusted GitHub run+artifact readback stays the Analytics team's responsibility.

### Durable state and safety boundaries

Capacity recovery counts **new deliveries within a rolling 30-day window** (10,000), not the lifetime of immutable receipts. Older deliveries, Analytics versions and Apps Script receipts are never deleted by this guard. Legacy queue capacity counts only active jobs (`QUEUED`, `RETRY_WAIT`, `RUNNING`) and their event keys, retaining all historic jobs and keys for readback/deduplication. This avoids permanent logical exhaustion, not eventual physical SQLite limits. Monitor durable storage and fail closed on real storage error; never discard historical proofs to manufacture capacity.


- Analytics validates allowlisted aggregate metrics, minimum cohort 20, no identifiers, exact source period and artifact digest, provider evidence envelope, deterministic event hash and metric revision. The **one snapshot row per source+period** is UPSERTed, never incremented; stale revisions and conflicting replays fail closed. Signed receipts reference the existing durable row. Report provenance is accepted only as a source-signed assertion, **not** independently fetched by the Brain.
- Apps Script validates the exact opaque #201 event (operation UUID, allowed phase, source/revision/evidence digests, age, deterministic ID) and stores a unique operation+phase review receipt. It **never** stores script code, tokens, project IDs, backups, trigger contents or file names. Return shape matches the existing #201 relay's five-field receipt.
- Both tables are created in **the existing** `BrainCoordinator` SQLite state with atomic `transactionSync` writes and durable audit rows; no side effects, external API calls, or AI calls. The old queue and single `ai_months`/`ai_reservations` ledger remain unchanged.
- Existing #219 build intent admission limits BUILD_A/B to two active/uncertain claims, enforces path locks and keeps unknown outcomes for explicit reconciliation. **No #213 live bridge, model execution, native provider budget calls or testing dispatch is activated** by this change. Never nest #211/#214 internal reserve/claim beneath the Brain's own reservation.

## Activation and acceptance blockers

1. Deployment SHA readback and expiry fix, independent private Service Binding proofs per analytics / Apps Script source, actual HMAC secret names and signed-response verification on staging. No changes to Cloudflare were made here.
2. Analytics #196 → #220 bridge is in a separate branch; verified GitHub private artifact reading and strict provenance through trusted ports are outstanding. No exact-head remote report ingestion or end-to-end evidence.
3. Apps Script #201/#218 private receipts must be backed by original #124 ScriptEditor, independent provider readback, verified trigger inventory and external writer exclusion. No Google writes or trigger changes.
4. Builder #213 cannot use self-billing #211/#214 adapters under a second ledger. Testing #212 must independently verify exact SHA/run/attempt/required checks; Self-Heal remains review-only.
5. Provider/model, FX, price, grant/AI billing coverage and emergency controls must be independently verified before any operator-authorized staging activation. **AI execution remains OFF**, as in main.
6. GitHub required CI, CodeQL, SonarCloud and conflict review must be checked at **this PR's actual final head SHA**. No auto-merge, production deployment, force-push, or billable AI request.

Tests: `npm run syntax --prefix brain`, `npm test --prefix brain`; CI `.github/workflows/brain-core.yml` is PR-triggered and credential-free. Other team's paths were read only.
