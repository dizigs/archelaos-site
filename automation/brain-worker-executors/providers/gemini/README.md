# Build A — Gemini Flash-Lite provider (isolated)

Status 2026-11-05: SOURCE-ONLY, DISABLED by default, mock-tested; no API invocation, paid usage, merge or deploy.

Ownership is strictly automation/brain-worker-executors/providers/gemini/**. This PR does not alter the shared dispatcher, the independent PR #209 scaffold, PR #111 Brain, workflows or other teams' files. The module returns review-only complete-file proposals; it has NO GitHub writer, CI executor, autonomous publication or deployment.

## Model IDs and secrets (verified versus pending)

- Official stable Google model IDs: gemini-3.5-flash-lite and gemini-2.5-flash-lite. See https://ai.google.dev/gemini-api/docs/models and https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite.
- An authenticated read-only Cloudflare check (2026-11-05) confirmed a secret BINDING named GEMINI_API_KEY on the existing archelaos-automation-bridge Worker and did NOT find that binding on archelaos-brain-staging. Only binding presence was checked; NO secret value was read or displayed.
- The bridge secret is NOT automatically available to the new Build A executor. Actual key validity, Google API project entitlement, account/model access, tier, quotas and Gemini billability have NOT been verified by a live request. No paid or free provider calls were made.

## API and safety boundaries

The public exports in adapter.mjs are FLASH_LITE_MODELS, BUILD_A_OPERATION, inspectGeminiBuildAJob(job) and executeGeminiBuildA(options).

Options must be passed by a trusted server-side central Brain: job (taskId, immutable 40-character commitSha, approved:true, paths, instruction and sourceFiles), modelId from verified inventory, key from the authorized runtime secret environment, liveEnabled, authorizeAttempt, recordAttempt, optional injected fetchGoogle/sleep/now for tests and bounded timeoutMs.

liveEnabled defaults to false. The caller must supply a trusted authorizeAttempt callback that issues a DISTINCT committed budget reservation before EACH provider call and matches request SHA-256, exact allowed paths SHA-256, task, commit, model and attempt. The grant must prove model access, credential binding, verified current pricing and EUR FX, calendar month, durable ledger reservation and remaining budget. It must NOT be constructed from user-controlled HTTP JSON. Monthly budget cap is at most EUR 20; per-attempt reservation must be EUR 0.02-0.20 and >= verified maximum quoted price. The provider adapter does NOT invent prices, convert FX, settle reservations or bypass the shared central ledger.

A mandatory trusted recordAttempt callback persists success, rejected_429 or uncertain/invalid-output usage receipts. On a receipt failure, execution stops. Missing permissions, ledger or price/FX evidence always fail closed before the network. Billing reservations and unknown outcomes stay in the Brain for reconciliation; they are NOT silently released.

The adapter sends POST only to the fixed Google generateContent origin with manual redirect policy, structured JSON schema, max 4,096 output tokens and 10-second timeout (maximum configurable 15 seconds). It retries at most ONCE solely after explicit HTTP 429 with Retry-After <= 2 seconds and a NEW reserved attempt. Timeouts, transport errors, HTTP 5xx, non-JSON, bad usage or malformed/truncated structured output NEVER retry automatically.

Accepted input is a single approved, size-bounded code proposal task: 1-6 exact safe paths under automation/, rebuild/, assets/, functions/ or tests/ with bounded source snippets. Embedded source code is treated as untrusted text. Returned changes must match the exact allowlist, cannot duplicate paths, and are capped in number/content size; tests are only suggestions and never executed.

Successful result status is DRAFT_REVIEW_REQUIRED. No testsPassed, PR, GitHub write, merge, publication or deploy claim is made. Integration must independently verify source privacy, service authentication, protected paths, signed ledger receipts, reviewer authority, generated changes and CI.

## Offline tests (Node built-in test runner)

    node --check automation/brain-worker-executors/providers/gemini/adapter.mjs
    node --test automation/brain-worker-executors/providers/gemini/adapter.test.mjs

13 synthetic mock tests cover disallowed paths, missing credentials, budget tampering, receipt failure, valid structured output, 429 bounded retry with distinct reservations, long Retry-After deferral, ambiguous 500/timeout, malformed envelope/usage/output and duplicate proposals. No real API key or Gemini network call is used.

## Integration blockers

1. Verify a Gemini secret in the intended Build A runtime, model entitlement and billing/quota/price+FX without exposing keys.
2. Independently connect this module to PR #111's authenticated Brain and durable shared Gemini budget authorization/receipt settlement. Never change the Brain from this isolated PR.
3. Add reviewed service-to-service identity, idempotent task receipts, explicit path ownership and approved source/privacy scope.
4. Add independent GitHub scoped writer, existing CI proof and draft-PR approval in the owning integration PR.
5. Get an explicit, verified cost cap and staging approval before ANY live Gemini request, including nominally free requests.

This README records the adapter's readiness, NOT a deployed/connected executor or completed live CI.
