# STATUS UPDATE — 2026-11-06 (single-ledger exact-reservation hardening)

- Build A review now requires the native `reservationId` to exactly equal the canonical Brain claim's immutable `budgetReservationId`; mismatches are blocked before any provider or ledger call. This validates review metadata only and does **not** authorize Gemini invocation or prove ledger settlement.
- Build and Testing second readbacks re-verify task ID, base commit, executor, type and no-merge/no-production policy, in addition to scope and reservation identity. Changed/UNKNOWN claims remain blocked.
- Three focused synthetic Node regression cases were added. The 34/34 GitHub-hosted integration Node tests at #217 were for the **previous** pinned integration SHA `d98b32f361126a6029c2457d2d55335130c368de`; independent acceptance and CI evidence must be regenerated for this new commit. Never reuse those results as exact-head proof.
- The native Gemma #211 output still has no independently attested `commitSha`; it remains blocked. Brain task intent does not yet authorize production Builders/Testing; no actual Cloudflare E2E is established.

# STATUS UPDATE — 2026-11-05 (post #209/#211/#212/#214/#219 merges)

- **Gemma #211 integration is intentionally blocked**: current native Build B result does not include immutable commitSha. Review-only shape acceptance requires exact-SHA attestation; never substitute the caller task SHA. The Gemma owner must extend the output contract separately.


**Canonical Brain owns all financial and execution state.** This integration branch has folded in the two GitHub Actions provenance files from stacked PR #228, and adds canonical-review.mjs (read-only). All changes remain confined to integration/**. The branch is not merged, and no inference, Worker deploy, GitHub draft writer or provider-native billing callback is activated.

## Single-ledger safety boundary

- Use only Brain's existing SQLite Durable Object claim, max-two Builders, file/subtree locks, and single EUR20 monthly AI budget ledger. No integration SqlCoordinator, separate dispatcher, native provider-side independent reserve, or parallel budget is authorized for live use.
- canonical-review.mjs checks Brain HMAC receipt, exact task/scope/hash, durable CLAIMED status, unpaused controls, the ONE budgetReservationId, provider type, and re-reads the claim. Any UNKNOWN or RECONCILE_REQUIRED status blocks and preserves existing Brain reservations and locks.
- #228 github-readback.mjs is copied at identical Git blob SHAs from PR #228 and provides independently fetched GitHub Actions workflow/run/attempt/job provenance for #212 Testing. Missing, skipped, forged or wrong-SHA required checks cannot become success.
- Gemini and Gemma adapter outputs, if supplied as untrusted JSON, are normalized only to PROPOSAL_REVIEW_ONLY. No claimed GitHub draft PR, successful CI, actual inference or settled billing is inferred.
- Older index.mjs runIntegration/SqlCoordinator illustrate the isolated legacy mock contracts and MUST NOT be wired into live Worker routing. No live imports are present. The real single-ledger execution callback/receipt contract needs a separate, reviewed owner handoff.

## Required interfaces from other owners (no cross-ownership edits)

1. Brain owner (#219): authenticated private readSignedReceipt(taskId), readClaim(taskId), readControls(); retain existing atomic claim/begin/complete under the SAME durable ledger and lock namespace. Return scopeDigest, exact allowed paths, budgetReservationId, status, and confirmed billable usage; preserve UNKNOWN until independently reconciled. Prove 2-Builder concurrency and file/subtree exclusions under contention.
2. Gemini owner (#214): authorizeAttempt and recordAttempt must reuse Brain's ALREADY reserved attempt/one-shot call, never request another cost reservation; second attempt currently conflicts with canonical one-shot admission and must fail closed or receive a distinct approved Brain claim.
3. Gemma owner (#211): injected budget.reserve must only read back the already committed Brain claim, not create another ledger entry. budget.settle is a trusted Brain completion handoff; unknown upper-bound costs stay reserved, including USD->EUR FX proof.
4. Testing owner (#212): bind github-readback.mjs to real trusted read-only GitHub REST and #212 native runner with exact SHA/repo/run attempt/job proof. Missing path-filtered workflow results are blockers.
5. Scaffold/writer owner (#209): only an independently authorized draft-PR writer may turn a proposal into GitHub changes; no writer is present in this branch.

## Tests

Requested direct offline suite: node --test automation/brain-worker-executors/integration/*.test.mjs
On the pushed integration SHA the existing Brain Build/Testing workflow can succeed while only running automation/brain-worker-executors/*.test.mjs (top-level). That workflow does NOT exercise the integration/*.test.mjs suites. An owner-scoped workflow change or explicitly authorized hosted test is required; never label integration tests hosted PASS without its logs.

## Release gate

Review #213 and #228 together: #228 is stacked against an earlier #213 SHA and the readback files are now already present in #213, so the central coordinator must not merge both independently. Keep all work review-only pending approved adapter contracts, exact-head hosted tests, Sonar/CodeQL, scoped private bindings and staging-only end-to-end proof.

---

## Historical design notes (prior to the above merges)
# Central Brain → Build / Testing / Self-Heal integration (draft, fail closed)

**Owner:** integration coordinator only. This folder is the **only** changed path in this branch. The module is not imported by the live Brain, does not deploy Cloudflare Workers and does not execute paid AI by itself.

## Verified source snapshot, 2026-11-05

- `main` at `a1b9434a82fe4def1421049c1edd6df14fcd3b41` did not contain `automation/brain-worker-executors/`. It does contain the separate `automation/self-heal-worker/` service contract.
- PR [#111](https://github.com/dizigs/archelaos-site/pull/111) at `d3d13b605f409bfda6f372742d629fd8eaf12145`: staging Brain, Durable Object SQLite queue, `brain/src/budget.mjs` shared EUR20/month ledger, `brain/src/task_intents.mjs` approval intake. **Draft and not a deployed/build-authorizing service.** The current task intent whitelist is `STAGING_PROOF`, `SOURCE_ADAPTER_REVIEW`, `SECURITY_REVIEW`; it does **not** authorize Build/Testing. Adapting this requires the Brain owner's separate PR and review.
- PR [#209](https://github.com/dizigs/archelaos-site/pull/209) at `6a64701344b3f392d17bc634bc898c5c22cd69db`: independent inert Build/Testing scaffold; its `approved: true` client flag is **not proof of Brain authorization**. Its checks list is a starting point only. This integration module deliberately does **not** import from that PR pending merge/review.
- The current public `automation/self-heal-worker/src/worker.mjs` exposes private `observe(finding)`, with source-scoped `CI_FAILURE` evidence in `src/policy.mjs`. No service binding or live routing is claimed.
- Dedicated provider PRs are now identified, but deliberately **NOT connected**: [#214 Build A/Gemini](https://github.com/dizigs/archelaos-site/pull/214) head `2381cacaa4dc3720fb06aa30157617e8205a8488`, [#211 Build B/Gemma](https://github.com/dizigs/archelaos-site/pull/211) head `b65d89477336be7e1043ffe1ab5a7b30a632f37f` and [#212 Testing](https://github.com/dizigs/archelaos-site/pull/212) head `04d8f50502c58b5f1fe7753a2bbde6bea10dc170`. Their source-scoped file lists were inspected; exact-head required CI and real adapter compatibility remain blockers. #214 and #211 return proposal-only outputs, **not** verified draft PR diff/results. #212 returns a read-only `passed`/`blocked` report with workflow/job evidence; it is **not** the `readVerified` normalized record contract used here.

## Contracts implemented

1. **Verified Brain authorization.** A **trusted, injected** `brain.verifyTaskReceipt(task)` must authenticate the Brain, verify the signed envelope (helper `verifySignedBrainEnvelope`), and read the *durable* `taskId`/`receiptId` back from Brain storage. It must return the exact approved repository, audience, commit SHA, lane, time limit, allowed paths and draft-only/no-merge/no-deploy permissions. Caller-supplied `approved` is ignored. The shared secret is runtime-only; it must not appear in PRs, logs, requests or tests.
2. **Task-intent adapter.** `normalizeIntent` accepts a small Build A/B or Testing task, commit SHA and explicit file scopes. `confirmBrainReceipt` enforces exact equality to the authoritative Brain receipt; source paths cannot traverse, touch `brain/**`, or touch this integration folder. Directory scopes require a trailing slash; files must be exact matches.
3. **Atomic idempotency and file-scope locking.** `SqlCoordinator` requires a single SQLite Durable Object `storage.transactionSync`. It persists fingerprint, claim state and scopes. Identical replay has no side effects; changed task payload is rejected. Overlapping paths are blocked. At most **2 build claims** are active globally, across A and B. `UNKNOWN` is retained and counts toward capacity: no unsafe lock expiry or automatic retry.
4. **One shared ledger.** Build providers *must* call the existing Brain ledger's atomic reserve → once-only claim → settle ports; no local second budget, no assuming free tokens and no authorized provider call unless pricing/model attestation and reservation are verified. Integer micro-EUR, cap `20_000_000` monthly. Uncertain invoice/outcome retains the lock for reconciliation. The Brain ledger is the financial source of truth.
5. **Testing gate.** `evaluateTestingGate` uses read-only, trusted GitHub run/check provenance for the **exact commit SHA** and repository. Required set aligned to #212: rebuild, axe-accessibility, Lighthouse, ESLint, CodeQL (JavaScript and Python jobs), JavaScript syntax, release QA and validate-site, including each expected successful job. The additional visitor-experience workflow from #209 should be assessed separately in the next owner review. Missing, duplicated, failed, skipped, in-progress or unverified required checks **fail closed**; a successful gate is still review-only, never merge permission.
6. **Self-Heal route.** Failed Testing attempts may pass *verified* GitHub Actions run IDs as a metadata-only `CI_FAILURE` to the existing private Healer service. If run ID is absent/unverified, no fictional evidence is created. No auto-repair, merge, deploy, raw logs or source code are sent.
7. **No implicit execution.** `runIntegration` defaults `BLOCKED`. To move past the gate, server-only policy must explicitly enable `staging-approved`, set `providersAttested` and `centralLedgerConfirmed`, then provide trusted Brain, SQLite, CI, builder and Healer ports. These flags alone are insufficient: all individual port proofs are independently checked.

## Trust / release boundary

- There is **no live adapter import or callback wiring** in this module. The currently existing PR #111 task intent shape cannot yet authorize Build/Testing and its ledger method arguments are not identical to the new normalized build charge port. A reviewed compatibility adapter is required before enabling anything.
- `ports.checks.readVerified` MUST retrieve provider-authoritative GitHub Actions data, authenticate provenance and handle pagination plus workflow run attempts; **never accept a caller-supplied checks array** in production.
- `ports.builders.A/B` are trusted server-side imports only after adapter PRs are reviewed and CI-passed, with pinned commit/version and an explicit per-task allowlist. The returned changed-files list must be reconciled to a real GitHub draft PR diff by the adapter; returned `verified` booleans are not sufficient evidence.
- **Concrete incompatibility:** PR #111 `reserveBudget` currently permits provider IDs `cloudflare`, `azure`, `openai`, not `gemini`; its task intent whitelist excludes `build` and `testing`. PR #214 reserves/records **per Gemini attempt**, while #211's Gemma adapter independently reserves/settles in USD. A naive wrapper around either adapter and this integration's own reserve/claim/settle would **double-reserve** budget. The Brain owner must approve a unified *single-charging* adapter contract (one authoritative reserve per attempt and one settlement/unknown reconciliation), never introduce a second ledger.
- The single SQLite coordinator must be wired in the same Durable Object routing namespace for both lanes. Two separate DO names/instances would each permit two builds and violate the cap. Do not enable until this is proven in staging.
- A production cap must be enforced inside Brain SQLite (not the mock quote), and must include all OpenAI/Codex and other paid providers in the shared EUR20 total. Actual charges and unknown billings must be reconciled before retry.
- Use only new scoped follow-up PRs for dispatcher imports, service bindings and workflows **after** all protected owner PRs are merged/reviewed. Never edit other active branches, never bypass CI.

## Mock tests

```sh
node --test automation/brain-worker-executors/integration/*.test.mjs
```

Tests cover invalid paths, forging an approval flag, default-OFF, replay, conflicting payloads, two-build cap, UNKNOWN retention, skipped/missing/wrong-commit checks, metadata-only Self-Heal finding, success in the synthetic ledger, ambiguous provider failure and HMAC tamper/freshness. No actual Gemini, Gemma, paid AI, Cloudflare deployment or GitHub write is invoked by tests.

## Safe integration order / blockers

1. Review #111 and #209 head SHAs and successful required CI; do not rewrite them. Confirm their provenance and align Brain task intent whitelist, signed authorization readback and ledger port contract in an **owner-approved follow-up**.
2. Review #214, #211 and #212 at their exact head SHAs; check mock test logs, provider availability, actual runtime credentials, model IDs, verified prices/FX and all required CI jobs. Missing/failed/skipped = blocked. The adapters' returned structures and budget interfaces are currently incompatible with this integration port contract, so no imports or invocation are allowed.
3. Pin and contract-test each adapter in a separate reviewed integration step. Until then: **disabled**. Prove shared SQL state and two concurrent builds using one durable coordinator, plus simultaneous budget reservations using the *same* Brain ledger.
4. Exercise staging-only synthetic flow: duplicate receipt, lock contention, unavailable provider, reserved/claimed unknown cost, wrong SHA/skipped checks, authenticated Healer binding and pause behavior. Capture real GitHub Actions and Wrangler logs before claiming E2E or Cloudflare staging proof.
5. Review only; preserve manual merge/deploy governance. No Codex, paid provider calls without confirmed budget, auto-merge or production deploy.

**No live proof claimed:** No credential inventory, Cloudflare staging service binding, shared-ledger runtime, adapter-compatibility E2E or provider billing is verified by this PR.


## Compatibility handoff (2026-11-05, after provider revisions)

New source-only `compat.mjs` and `compat.test.mjs` are restricted to this
integration directory. They normalize *actual* outputs from #214 Build A
(`proposal.changes[].content`, `DRAFT_REVIEW_REQUIRED`) and #211 Build B
(`proposal.files[].replacement`, `proposed`) into one immutable
`PROPOSAL_REVIEW_ONLY` record. They require a valid, independently read-back
Brain approval before accepting the task, check the exact immutable commit SHA,
model ID, task ID and authorized replacement-file scope and reject forged
write/merge/deploy claims. They DO NOT create a GitHub PR, attest provider identity
or confirm financial settlement: `draftPrCreated`, `testsPassed` and
`ledgerReconciled` remain **false**. Do not treat this as an operational adapter.

The native #212 Testing report returns `{status,sha,checks:[{workflow,runId,
conclusion,jobs,state}]}`. `inspectNativeTestingReport` can validate these
fields, but #212 currently does NOT return run-attempt or repository provenance
evidence in this report. Consequently it returns
`NEEDS_AUTHORITATIVE_RUN_ATTEMPT_READBACK` for a locally successful report,
`TESTING_BLOCKED` for failure/missing/skipped, and always keeps
`testingGatePassed:false`. The independently authenticated GitHub readback
contract in `evaluateTestingGate` remains mandatory; never synthesize
`runAttempt` or `provenanceVerified`.

The coordinator now sends `CI_FAILURE` to Self-Heal **only** when a completed
failed/cancelled required run has an exact-SHA trusted run ID and run attempt.
Missing, skipped, pending or unauthenticated runs stay blocked without a
fabricated failure finding. The separate Self-Heal service is still NOT bound.

#211 has advanced to head `b7dd45d9cf34b1bd0f49106980f0c3f73c18645c`.
A read-only GitHub commit-check inspection observed SonarCloud Code Analysis,
GitGuardian Security Checks and CodeQL marked successful at this exact head.
Earlier failure evidence belonged to an older revision; review current head
before merging. The dedicated Gemma Node tests were not run here.

**Test honesty:** 18/18 non-HMAC mock checks across `index.test.mjs` and
`compat.test.mjs` passed when evaluated against the fetched GitHub source
using a JS/V8 assertion harness; this is NOT the exact Node `node --test`
runner. The HMAC/WebCrypto case was not run in that harness, and no real
Cloudflare/AI E2E test or hosted integration-specific Node job has been
verified. The generic repository Actions checks do not substitute for this.

### Remaining owner changes / strict stop conditions

- #111 Brain owner must explicitly authorize Build A/B and Testing task types,
  paths and trusted durable receipt readback; the current 3 review-only task
  types cannot grant executor work.
- Budget owner must unify #214 per-attempt EUR reservations and #211 USD
  reserve+settle to **one** shared Brain EUR20/month ledger with verified FX,
  reconciliation and no double charge. **No wrapping these providers in a
  second reservation**. Missing attestation means no AI inference.
- #209 executor owner must supply a scoped review-only GitHub draft writer and
  exact-SHA CI readback/attempts; the integration coordinator cannot forge a
  draft PR reference from a proposal.
- Pin modules after reviewed merges; run exact-head Node mock tests and staging
  end-to-end checks with auditable logs. Keep all live toggles OFF until then.
- No Codex, automatic merge, production deploy or unapproved spend.

The active `runIntegration` path now **hard-rejects** any provider builder
that lacks `billingContract: 'central-preclaimed-v1'` together with explicit
`reservesInternally:false` and `settlesInternally:false`, *before* any central
reservation. Both current native providers own their internal reservations and
must NOT be wrapped by this path. The guard is verified by an additional mock
test with zero ledger reservations and zero provider calls; it is not an
independent audit of a future wrapper. Only the Brain/budget owner can approve
an adapted single-charge implementation.
