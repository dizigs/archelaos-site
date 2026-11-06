# Canonical Brain ↔ Build A/B / Testing — review-only integration

**Owner:** `automation/brain-worker-executors/integration/**`. This directory is the only change proposed by PR #213. The existing canonical `brain/**` owns all authorizations, Durable Object/SQLite state, path locks, two-Builder concurrency and the sole EUR 20/month AI ledger.

**Status (2026-11-06): CODE-ONLY / FAIL-CLOSED / NOT LIVE.** No Cloudflare Worker deployment, service binding, provider inference, native provider budget settlement, GitHub draft writer, independent acceptance pass, automated merge or production activation is claimed. Integration is not imported by an active Worker. `runIntegration()` is intentionally inert and returns `CANONICAL_BRAIN_ONLY` with zero side effects.

## Owned modules

- `index.mjs`: immutable task/path/signed-receipt primitives, strict required Testing checks, default-disabled integration contract. The earlier `SqlCoordinator`, duplicate SQLite ledger, parallel dispatcher and legacy simulation are **removed**; none may be reintroduced for execution.
- `canonical-review.mjs`: read-only evaluation of an independently HMAC-verified, live Brain receipt and **two** durable claim readbacks (before and after asynchronous review); rejects expired, paused, mutable or UNKNOWN/reconciling claims. Does **not** claim, begin, reserve, call, settle, publish or release a task.
- `compat.mjs`: normalize untrusted Gemini/Gemma code suggestions to `PROPOSAL_REVIEW_ONLY`, and native Testing reports to provisional readback-needed states; neither a model suggestion nor `approved:true` becomes a GitHub commit or approval.
- `github-readback.mjs`: read-only independent GitHub Actions run/attempt/job verification for the eight required workflow paths, exact repository and commit SHA; disallows missing/skipped/pending/wrong-SHA, duplicate IDs, misleading native report and stale green claims.
- `*.test.mjs`: native Node tests for rejection/fail-closed cases including HMAC tamper, immutable scope, budget reservation mismatch, receipt expiry after asynchronous readback, conflicting GitHub job identity and recovery boundaries.

## Explicit trust & budget boundaries

1. A trusted Brain port must authenticate `readSignedReceipt(taskId)`, verify HMAC, issuer, audience, repository, exact base commit, taskId/receiptId, lane, allowed paths, expiration, permissions and authorization from the **existing** Brain. No caller-supplied approval, widened path or generated signature is sufficient.
2. `readClaim(taskId)` must return a current `CLAIMED` canonical record with matching taskId, baseCommit, executor, task type, `scopeDigest`, immutable reservation ID and `productionAllowed=false` / `autoMergeAllowed=false`. A second durable readback and final receipt-expiry recheck are mandatory. Missing/changed/UNKNOWN/`RECONCILE_REQUIRED` means BLOCKED, without retry or releasing a potentially billed claim.
3. Build A's untrusted native `reservationId` must exactly match the already reserved `budgetReservationId` in the Brain claim. No second `reserve`, second `settle`, per-provider shadow ledger or duplicate `claimBudgetCall` is permitted. A genuine billable provider attempt is **not wired here**.
4. Build B remains blocked: the merged native Gemma output does **not** carry independently attested `commitSha`. `compat.mjs` deliberately rejects it rather than copying the task SHA as fabricated output provenance. The Gemma owner must implement and prove that contract in its own scope.
5. Testing cannot PASS until the external GitHub readback verifies exact workflow path, run ID, attempt, status, every required job and repository/commit identity, including distinct job IDs. No CI-waiver, implied success or synthetic check can substitute for GitHub's authoritative record.
6. Self-Heal receives only separately verified, bounded failure metadata; no inference that a missing/skipped/pending check is a confirmed failure, and no independent repair, deploy or retry loops.
7. All runtime Builder execution and autonomous actions stay OFF. Any future enablement requires independent acceptance, controlled staging, signed transport identity, single-ledger budget/FX reconciliation, source-owned service bindings, a reviewed draft-PR writer and Release Captain approval.

## Verification

Run the actual owned tests from the repository root:

```sh
node --check automation/brain-worker-executors/integration/index.mjs
node --check automation/brain-worker-executors/integration/canonical-review.mjs
node --check automation/brain-worker-executors/integration/compat.mjs
node --check automation/brain-worker-executors/integration/github-readback.mjs
node --test automation/brain-worker-executors/integration/*.test.mjs
```

An earlier local Node 22 run verified **40/40 tests** at SHA `dc3d5b64a5c4a72142d919516d446741c6ee0ff4`; this is **not** proof of hosted exact-head integration tests or live E2E. The ordinary Brain Build/Testing workflow's top-level test glob does not cover this directory. The owner of PR #217 must pin the **latest exact #213 head** in both `acceptance/sources.json` and its hosted acceptance workflow, run the native integration tests, and independently attest exact-SHA required CI including path-filtered rebuild/axe runs.

## Release Captain handoffs and blockers

- **Canonical Brain owner (#219, merged):** its `brain/src/exec_authority.mjs` provides durable intent/approval/claims, max-two builds, locks, single SQLite reservation, lease reconciliation and optional signed integration authorization. Integration has **not** proven private live transport, signing key provisioning, a verified budget/price/FX mapping or trusted per-provider callbacks. No runtime end-to-end is established.
- **Gemini owner (#214, merged):** provider-native attempt authorizations and reservations must reuse the *same* Brain reservation/one-shot attempt, not create additional costs; unknown charge outcomes stay reserved.
- **Gemma owner (#211, merged):** return real immutable `commitSha` and reuse the Brain reservation with verifiable USD→EUR budget reporting; no inferred commit or double settlement.
- **Testing and acceptance owners (#212/#217):** verify native tests, required exact-head GitHub runs/attempts/jobs, and independent acceptance without suppressing absent path-filtered rebuild/axe evidence.
- **Release Captain:** reconcile stacked #228 provenance with #213 (the readback bridge is already integrated here), and separately gate code-only merge. Do not independently merge duplicate #228 paths. Preserve production OFF, no paid calls, no auto-merge/force-push/deployment.

A code-only merge can be evaluated separately from live authorization, but only after exact-head CI and ownership/review gates. A green code check **never** means that canonical Brain → provider → GitHub → Self-Heal is connected.
