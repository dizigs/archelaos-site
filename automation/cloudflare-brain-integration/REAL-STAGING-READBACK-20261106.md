# Cloudflare Brain — real staging connectivity readback (2026-11-06)

Scope: `dizigs/archelaos-site`, existing PR #233, `automation/cloudflare-brain-integration/**` only.
Evidence source: read-only authenticated Cloudflare REST GET for scripts/settings/deployments/schedules/subdomains, account domains/DO namespaces/D1, zone routes, GitHub exact refs and CI logs. **No Cloudflare mutation, secret values, billed provider calls, trigger, health invocation, E2E event, production activation or new Worker.**

## Immutable snapshot and scope

- Repository `main` at inspection: `c89823a21efc1fa9f979b17a6567337a498a1969`.
- Existing staging Brain script: `archelaos-brain-staging`; deployed Cloudflare version `72d7d145-9ca1-4ad0-814b-afe52ac9da91` at 100%, deployment `6d557f57-0f35-4b60-a569-546ee38157d2` (2026-11-05T13:44:32Z).
- Staging `DEPLOY_SHA` **setting**: `d3d13b605f409bfda6f372742d629fd8eaf12145` (not independently attested as an image/source hash). GitHub compare to main: **diverged; main ahead 202 / behind 24**, merge base `0ec86ff7bd60ef0328893ec35b80219b85b6d117`. Do not claim runtime matches main.
- `ENVIRONMENT=staging`; `STAGING_EXPIRES_AT=1970-01-01T00:00:00Z` **still expired**. `STAGING_INTAKE_KEY` and `STAGING_OPERATOR_KEY` absent from *binding metadata*; workers.dev disabled.
- Actual `BRAIN` binding is type `durable_object_namespace`, class `BrainCoordinator`, namespace `6cd125319d774260aaf1c0444d6442f1`; `AI` is type `ai`. DO-backed SQLite is part of the repository design; **no live SQLite query, idempotency readback, receipt or transaction was exercised**.
- Cloudflare account has **9** Workers, **4** DO namespaces and **0** independent D1 databases, **0** Worker custom domains, **0** zone Worker routes and **0** registered cron schedules.
- Cloudflare service-type bindings: **0 across all nine deployed scripts**. Source library `client.mjs` and read-only `binding-plan.mjs` are not deployed bindings.

## Worker-by-worker matrix — current Cloudflare GET readback

All are deployed with the listed Cloudflare deployment/version identifiers and 100% latest allocation. Worker source Git commit SHA is **unverified** for all except the Brain's *unattested DEPLOY_SHA setting*; Cloudflare version IDs are not Git SHAs.

| Worker | Latest deployment ID | Cloudflare version ID | Non-secret bindings | workers.dev | Native Brain service / private receipt E2E | State |
|---|---|---|---|---|---|---|
| archelaos-automation-bridge | `e9da0b1c-99b4-4861-9a94-119732448ff0` | `9445de37-5465-4927-be71-a546359c5b21` | DO `APPS_SCRIPT_COORDINATOR`, KV `AUTH_KV` | on | 0 / none | BLOCKED — no approved provenance/identity/binding/receipt |
| archelaos-brain-staging | `6d557f57-0f35-4b60-a569-546ee38157d2` | `72d7d145-9ca1-4ad0-814b-afe52ac9da91` | DO `BRAIN`, AI `AI` | off | target, not an inter-Worker service binding / none | DISABLED — expired, misaligned SHA, missing secret names |
| archelaos-fundraising-preview | `484034ba-370a-416b-9b84-3f5c0a3df2e0` | `2c4eaadb-3b45-42b2-9442-92d69b21ff93` | none | on | 0 / none | BLOCKED — no approved event contract |
| archelaos-gitlab-controller | `05998ad4-f39f-4c89-9765-271c70736821` | `53938cc8-0c8b-4956-8df2-934721711c53` | none (secret names only) | on | 0 / none | BLOCKED — no approved scoped intent |
| archelaos-gitlab-guardian | `7ef87492-74d5-4851-b353-5d11480e9f63` | `2c37f688-4aee-44d1-b829-4dcb33a84c2f` | none (secret names only) | on | 0 / none | BLOCKED — no cron/approved event contract |
| archelaos-librarian-staging | `5e2dfa21-5f87-4308-83ea-4df84279f8f4` | `d291424c-05fd-42df-b5b3-0891339ef658` | DO `LEDGER` | off | 0 / none | BLOCKED — news/archive/Drive probe toggles false |
| archelaos-raisely-bridge | `5014a39c-b019-435b-83b4-c7e47f248711` | `c13362d5-14b2-4ea5-9da4-586d95318ce9` | none (secret names only) | on | 0 / none | BLOCKED — no approved event contract |
| archelaos-self-heal | `f768d2e8-306c-4012-b511-4cb8ce50a1da` | `fb8c26ae-f3df-46a2-8e8c-073b24785c27` | DO `HEALER_MEMORY` | off | 0 / none | BLOCKED — no verified authenticated Brain recovery transport |
| archelaos-workflow-pilot | `3ebd856d-b9e2-4b48-b3d6-424af7c007f8` | `6cacf77c-3894-4f47-96cb-90d981936b69` | Workflow `ARCHELAOS_PILOT` | off | 0 / none | BLOCKED — Workflow binding is not a Brain service binding |

Secret binding *metadata count*, not values: Automation Bridge 12, GitLab Controller 2, GitLab Guardian 2, Raisely Bridge 4; all others 0. No secret value, operational key validity or OAuth permission was verified. No per-Worker runtime health check was invoked.

## Authentication and release blockers

- At the inspected main, `brain/src/contract.mjs` authenticates `staging-v1` as logical source `staging`; approved Drive/Gmail/News adapters use their true source types. `validateEvent` rejects a mismatched source with HTTP 422 `INVALID_IDENTITY`. This is a source-level and offline synthetic proof, **not remote 422 evidence**.
- Signed receipt validation, source-scoped readback, timestamped HMAC, provenance checks, bounded delivery and failure-to-audit behavior exist in adapter/library tests. There is **no trusted deployed receipt ID, correlation trace, signed readback or verified service invocation**.
- The only proposed native private binding in this owner lane is `{ type: 'service', name: 'BRAIN_PRIVATE', service: 'archelaos-brain-staging' }`, for `archelaos-automation-bridge` and `archelaos-librarian-staging` **after** Brain/source-owner signoff and review. These are proposals, not installed settings. Other Workers need distinct independently approved contracts.

## Test evidence — distinguish three levels

1. **Offline synthetic:** GitHub Actions run [42119484822](https://github.com/dizigs/archelaos-site/actions/runs/42119484822), job `127567784940`, checked commit `5248f099b04c1b9ad89517a8e2018ef91ce256de`: **31/31 PASS, 0 FAIL**. Includes previously omitted nine binding-plan tests, a one-call timeout/abort with UNKNOWN audit/no retry, synthetic adapter re-instantiation + mock durable duplicate/readback and HTTP 423 emergency pause, plus forged receipts, HMAC and identity mismatch. These exercises use **mock Service Binding/Brain**; the mock Map does not prove real DO restarts/SQLite or cloud transaction durability.
2. **Deployed metadata:** Cloudflare script settings, versions, binding types, DO namespace registrations and disabled staging were independently fetched successfully. This proves installation/configuration, not an operating route.
3. **Remote private staging health / authenticated E2E:** **NOT EXECUTED / NOT PROVEN**. There is no installed service binding; the target is deliberately expired and has no intake/operator secret names. No remote health, signed event, duplicate, receipt readback, restart or paid AI model request was attempted. Every remote E2E receipt/run ID is **NONE**.

The above run is pinned to its own tested SHA; after any later documentation or code commit, recheck the final head's independent GitHub Actions runs and required security checks. No passed CI job implies Cloudflare E2E.

## Explicit operator-approval queue — no execution in this PR

1. Brain owner resolves source-identity mapping, signed readback and exact-source envelope compatibility; approve an immutable canonical release SHA and staging-only key IDs. Preserve one DO/SQLite state and single AI ledger.
2. Release/security owner reviews exact-head required CI and authorizes a short staging window, zero AI/provider execution, cost guardrails and rollback plan.
3. Existing Brain owner **separately approves** redeploying the already-existing staging Brain to the reviewed SHA; **separately approves** setting temporary expiry and safely provisioning scoped secret bindings via Cloudflare secret management (no secrets in code/logs).
4. Existing two source Worker owners **separately approve** a non-public `BRAIN_PRIVATE` Service Binding each; changes must preserve existing DO/KV/flags/secrets/routes. No public HTTP fallback and no automatic cron activation.
5. Within an approved window, the authorized operator checks private GET `/healthz` (identity/reachability only), one non-billable deterministic signed event, 202 receipt with exact identity and correlation, authenticated readback, replay duplicate 200 without second side effect, then negative auth, timeout/restart and kill-switch evidence with remote deployment/version IDs and redacted audit proof.
6. Any wrong SHA, 4xx identity mismatch, unknown delivery, forged/absent receipt, failed CI, absent source provenance, unexpected AI/model invocation, unsafe cost or broken rollback immediately yields **STOP / UNKNOWN** and operator-controlled rollback/readback. Do not re-send with a fresh ID on uncertainty.

**Final assessment:** 9/9 deployed; 0/9 native service-bound; 0/9 authenticated-and-receipted; 0/9 proven remote E2E. **Production authorization: NO.** No second Brain, ledger, Worker, trigger or database created.
