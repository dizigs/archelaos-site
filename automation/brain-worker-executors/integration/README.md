# Central Brain → Build / Testing / Self-Heal integration (draft, fail closed)

**Owner:** integration coordinator only. This folder is the **only** changed path in this branch. The module is not imported by the live Brain, does not deploy Cloudflare Workers and does not execute paid AI by itself.

## Verified source snapshot, 2026-11-05

- `main` at `a1b9434a82fe4def1421049c1edd6df14fcd3b41` did not contain `automation/brain-worker-executors/`. It does contain the separate `automation/self-heal-worker/` service contract.
- PR [#111](https://github.com/dizigs/archelaos-site/pull/111) at `d3d13b605f409bfda6f372742d629fd8eaf12145`: staging Brain, Durable Object SQLite queue, `brain/src/budget.mjs` shared EUR20/month ledger, `brain/src/task_intents.mjs` approval intake. **Draft and not a deployed/build-authorizing service.** The current task intent whitelist is `STAGING_PROOF`, `SOURCE_ADAPTER_REVIEW`, `SECURITY_REVIEW`; it does **not** authorize Build/Testing. Adapting this requires the Brain owner's separate PR and review.
- PR [#209](https://github.com/dizigs/archelaos-site/pull/209) at `6a64701344b3f392d17bc634bc898c5c22cd69db`: independent inert Build/Testing scaffold; its `approved: true` client flag is **not proof of Brain authorization**. Its checks list is a starting point only. This integration module deliberately does **not** import from that PR pending merge/review.
- The current public `automation/self-heal-worker/src/worker.mjs` exposes private `observe(finding)`, with source-scoped `CI_FAILURE` evidence in `src/policy.mjs`. No service binding or live routing is claimed.
- Dedicated Build A Gemini Flash-Lite, Build B Gemma and Testing PR IDs, model/adapter version attestations and head-SHA CI results must be **discovered/read back** before adapters can be connected; no assumptions from names or unverified reports.

## Contracts implemented

1. **Verified Brain authorization.** A **trusted, injected** `brain.verifyTaskReceipt(task)` must authenticate the Brain, verify the signed envelope (helper `verifySignedBrainEnvelope`), and read the *durable* `taskId`/`receiptId` back from Brain storage. It must return the exact approved repository, audience, commit SHA, lane, time limit, allowed paths and draft-only/no-merge/no-deploy permissions. Caller-supplied `approved` is ignored. The shared secret is runtime-only; it must not appear in PRs, logs, requests or tests.
2. **Task-intent adapter.** `normalizeIntent` accepts a small Build A/B or Testing task, commit SHA and explicit file scopes. `confirmBrainReceipt` enforces exact equality to the authoritative Brain receipt; source paths cannot traverse, touch `brain/**`, or touch this integration folder. Directory scopes require a trailing slash; files must be exact matches.
3. **Atomic idempotency and file-scope locking.** `SqlCoordinator` requires a single SQLite Durable Object `storage.transactionSync`. It persists fingerprint, claim state and scopes. Identical replay has no side effects; changed task payload is rejected. Overlapping paths are blocked. At most **2 build claims** are active globally, across A and B. `UNKNOWN` is retained and counts toward capacity: no unsafe lock expiry or automatic retry.
4. **One shared ledger.** Build providers *must* call the existing Brain ledger's atomic reserve → once-only claim → settle ports; no local second budget, no assuming free tokens and no authorized provider call unless pricing/model attestation and reservation are verified. Integer micro-EUR, cap `20_000_000` monthly. Uncertain invoice/outcome retains the lock for reconciliation. The Brain ledger is the financial source of truth.
5. **Testing gate.** `evaluateTestingGate` uses read-only, trusted GitHub run/check provenance for the **exact commit SHA** and repository. Required set: rebuild, axe-accessibility, visitor-experience, Lighthouse, ESLint, CodeQL. Missing, duplicated, failed, skipped, in-progress or unverified required checks **fail closed**; a successful gate is still review-only, never merge permission.
6. **Self-Heal route.** Failed Testing attempts may pass *verified* GitHub Actions run IDs as a metadata-only `CI_FAILURE` to the existing private Healer service. If run ID is absent/unverified, no fictional evidence is created. No auto-repair, merge, deploy, raw logs or source code are sent.
7. **No implicit execution.** `runIntegration` defaults `BLOCKED`. To move past the gate, server-only policy must explicitly enable `staging-approved`, set `providersAttested` and `centralLedgerConfirmed`, then provide trusted Brain, SQLite, CI, builder and Healer ports. These flags alone are insufficient: all individual port proofs are independently checked.

## Trust / release boundary

- There is **no live adapter import or callback wiring** in this module. The currently existing PR #111 task intent shape cannot yet authorize Build/Testing and its ledger method arguments are not identical to the new normalized build charge port. A reviewed compatibility adapter is required before enabling anything.
- `ports.checks.readVerified` MUST retrieve provider-authoritative GitHub Actions data, authenticate provenance and handle pagination plus workflow run attempts; **never accept a caller-supplied checks array** in production.
- `ports.builders.A/B` are trusted server-side imports only after adapter PRs are reviewed and CI-passed, with pinned commit/version and an explicit per-task allowlist. The returned changed-files list must be reconciled to a real GitHub draft PR diff by the adapter; returned `verified` booleans are not sufficient evidence.
- The single SQLite coordinator must be wired in the same Durable Object routing namespace for both lanes. Two separate DO names/instances would each permit two builds and violate the cap. Do not enable until this is proven in staging.
- A production cap must be enforced inside Brain SQLite (not the mock quote), and must include all OpenAI/Codex and other paid providers in the shared EUR20 total. Actual charges and unknown billings must be reconciled before retry.
- Use only new scoped follow-up PRs for dispatcher imports, service bindings and workflows **after** all protected owner PRs are merged/reviewed. Never edit other active branches, never bypass CI.

## Mock tests

```sh
node --test automation/brain-worker-executors/integration/index.test.mjs
```

Tests cover invalid paths, forging an approval flag, default-OFF, replay, conflicting payloads, two-build cap, UNKNOWN retention, skipped/missing/wrong-commit checks, metadata-only Self-Heal finding, success in the synthetic ledger, ambiguous provider failure and HMAC tamper/freshness. No actual Gemini, Gemma, paid AI, Cloudflare deployment or GitHub write is invoked by tests.

## Safe integration order / blockers

1. Review #111 and #209 head SHAs and successful required CI; do not rewrite them. Confirm their provenance and align Brain task intent whitelist, signed authorization readback and ledger port contract in an **owner-approved follow-up**.
2. Find dedicated Build A Gemini, Build B Gemma and Testing PRs; review changed-files ownership, mock test logs, provider availability, model ID, verified prices/FX and CI at exact head SHAs. Missing/failed/skipped = blocked.
3. Pin and contract-test each adapter in a separate reviewed integration step. Until then: **disabled**. Prove shared SQL state and two concurrent builds using one durable coordinator, plus simultaneous budget reservations using the *same* Brain ledger.
4. Exercise staging-only synthetic flow: duplicate receipt, lock contention, unavailable provider, reserved/claimed unknown cost, wrong SHA/skipped checks, authenticated Healer binding and pause behavior. Capture real GitHub Actions and Wrangler logs before claiming E2E or Cloudflare staging proof.
5. Review only; preserve manual merge/deploy governance. No Codex, paid provider calls without confirmed budget, auto-merge or production deploy.

**No live proof claimed:** No credential inventory, Cloudflare staging service binding, shared-ledger runtime, adapter-compatibility E2E or provider billing is verified by this PR.
