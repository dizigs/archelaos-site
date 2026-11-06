# Existing canonical Brain ↔ Self-Heal: named private RPC (CODE ONLY)

Status: **review-only candidate / all real runtime capabilities OFF**.
Owned paths: `brain/**` only. No second Worker, Brain, SQLite database, coordinator, scheduler, public HTTP endpoint, provider executor, AI ledger or cost center.

## Exact existing components

- Existing central Worker: `archelaos-brain-staging`, Durable Object `BRAIN` / `BrainCoordinator` / central SQLite.
- Existing Self-Heal: `archelaos-self-heal`, Durable Object `HEALER_MEMORY` and signed `attemptRecovery(envelope)`.
- Named export on the **existing Brain Worker**: `BrainRecoveryPort extends WorkerEntrypoint`. Its three private RPC methods are:
  - `verifySelfHealReceipt(finding)`
  - `routeSelfHealReview(plan)`
  - `recheckSelfHealHealth(probe)`

No change to the default Brain HTTP route; `workers_dev=false` and `preview_urls=false` remain defaults. Binding implementation eventually must target the **named** entrypoint; binding to the Brain's default HTTP `fetch` handler will **not** expose these RPC methods.

## CI verification and receipt, when separately approved

The Brain independently reads `GET` only from the GitHub API: the exact workflow run matching `actions:<runId>`, active default-branch ruleset **26357426**, and check runs of the exact commit. An affirmative CI receipt requires: repository identity, commit SHA, completed/failed recent run, proper branch, active required-check rule, a **failed required check from the same check suite** and bounded inventory. Missing GitHub token, HTTP error, stale/pending/unknown evidence, pagination uncertainty or unexpected data all fail closed.

Only a verified CI_FAILURE in `dizigs/archelaos-site` can record a proof. The existing BrainCoordinator SQLite transaction pauses the Brain's `source:github` automation chain and reads the pause back before returning a short-lived, immutable receipt. This does **not** terminate other independent GitHub Actions or prove that their external dependency chains have stopped. An operator must separately verify any external CI chain before considering autonomous action.

`routeSelfHealReview` rechecks the committed exact receipt, chain pause and kill switch, then stores one `PENDING_MANUAL_REVIEW` intent in the **same canonical SQLite**. Even `accepted:true` means *recorded for manual review only*: there is no Builder dispatch, no GitHub mutation, no deployment, no AI reservation and no attempt to run a fix.

`recheckSelfHealHealth` deliberately returns `verified:false`. The currently merged Self-Heal probe RPC carries no receiptId or independently verifiable origin proof, so it cannot safely attest the website's state from caller metadata alone. This is a known **blocked** capability, not a claim of live health monitoring.

## Exact runtime prerequisites (none assumed installed)

All of the following are required *before* the named port may return a positive CI receipt:

- Source code review, main SHA/build-byte provenance, complete checks and independently verified Cloudflare staging deployment with `ENVIRONMENT=staging`.
- `DEPLOY_SHA` equals the exact independently approved `BRAIN_SELFHEAL_APPROVED_SHA`, each a nonzero 40-character commit SHA.
- `STAGING_EXPIRES_AT` in the future but within the next 60 minutes.
- `BRAIN_SELFHEAL_RECOVERY_ENABLED=true` and `BRAIN_SELFHEAL_BINDING_ATTESTED=true` only after the actual private binding is inspected, plus an independently provisioned sealed `BRAIN_GITHUB_READ_TOKEN` of minimal required GitHub Actions/Metadata read scope.
- Existing Self-Heal must receive a native **service** `BRAIN_RECOVERY` binding with target `archelaos-brain-staging` and **entrypoint `BrainRecoveryPort`**, preserving every existing DO and secret setting. The Brain's signer → Self-Heal inbound `HEALER` service binding and unique sealed `HEALER_EVENT_HMAC_KEY` still need their own reviewed implementation and staging tests.
- Verify no public routes/subdomains, no cron, no autonomous execution. Keep `AI` usage paused and the total €20/month AI budget enforced centrally.

None of these flags, keys or bindings are added by this code change. All safe defaults remain OFF. No unattended Cloudflare setting writes are authorized.

## Required independent acceptance

Before reporting **CONNECTED**, prove an authentic private Service Binding and named-entrypoint RPC, correctly signed Healer delivery, matching durable receipt/readback and single-use nonce, exact required CI failure identity, Brain-source chain stop (plus separately verified external chain as relevant), negative replay/tamper/stale/timeout cases, unknown-outcome quarantine, a single manual review intent, zero unintended writes/AI charges, and rollback. Guardian and Photo agents own their existing work separately.

**Verdict for this PR: CODE-ONLY, staging/runtime still BLOCKED.**
