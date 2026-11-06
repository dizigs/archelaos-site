# Brain ↔ Workers: staging enablement and rollback (NO LIVE CHANGE)

Owner/scope: `automation/cloudflare-brain-integration/**`. Applies to existing `archelaos-brain-staging`; **not** a request to create or deploy another Worker. Last observed: 2026-11-05, Cloudflare API **GET only**. No execution evidence or secrets included.

## Evidence and decision

- 9 deployed scripts in the account containing `archelaos.club`; 0 service bindings; 0 registered cron schedules; 0 Worker routes or custom Worker domains.
- `archelaos-brain-staging`: `BRAIN` Durable Object namespace + `AI` binding; `ENVIRONMENT=staging`; `DEPLOY_SHA=d3d13b605f409bfda6f372742d629fd8eaf12145`; `STAGING_EXPIRES_AT=1970-01-01T00:00:00Z`. Neither `STAGING_INTAKE_KEY` nor `STAGING_OPERATOR_KEY` secret **binding name** exists. workers.dev disabled.
- Four registered Durable Object namespaces: BrainCoordinator, MuseumScriptCoordinator, LibrarianLedger and HealerMemory. D1 list is empty. SQLite Durable Objects do **not** require an independent D1 database.
- Workers account default usage model is `standard`. Billing subscription lookup returned 403, so the Workers Paid subscription **was not independently verified** by this inventory.
- `archelaos-librarian-staging`: NEWS_IMPORT_ENABLED, ARCHIVE_IMPORT_ENABLED and DRIVE_LINK_PROBE_ENABLED all `false`.
- GitHub commit comparison of the deployed Brain SHA `d3d13b605f409bfda6f372742d629fd8eaf12145` against current `main` `bddc3defd78c3a2bd18c7772d4bcc97092cfb5be` returned **diverged** (21 ahead, 24 behind). This staging runtime **must not be treated as a current main build**, even after its expiry and bindings are repaired. A separately reviewed release alignment/redeploy must precede any connectivity test; no deploy is authorized here.
- Current Brain authentication accepts the shared `staging-v1` HMAC secret; a Cloudflare service binding narrows network reachability, **but neither provides unique per-worker cryptographic authorization under the current Brain contract**. No E2E claim is allowed.

**Decision: BLOCKED.** This repo-only PR cannot safely flip the actual staging settings or establish end-to-end integration without explicitly controlled access to both existing source Worker settings and the Brain owner's approval.

## Minimum staged enablement gate (requires owner coordination)

1. Freeze and record each existing Worker deployment/version, binding names, `STAGING_EXPIRES_AT`, approved source event types and approved rollback owner. Check the exact main Brain release SHA against the deployed `DEPLOY_SHA`.
2. Brain owner approves a time-bounded window and trusted HMAC identity model. Provision secrets through Cloudflare secret management **only**; never in GitHub commits, test fixtures, logs or chat. A single shared staging identity must not be represented as secure per-worker authorization.
3. Source Worker owner approves a **service-type** binding to the existing `archelaos-brain-staging`; do not replace unrelated bindings or inadvertently redeploy production scripts. No public URL fallback.
4. First verify `GET /healthz` via a private service binding. It must report `service=archelaos-brain`, `environment=staging`, exact approved commit and `aiExecutionEnabled=false`. A passing health probe proves *identity/reachability only*, not readiness or connectivity from every Worker.
5. Restrict to one approved, deterministic non-private test source with external provenance attestation and a durable audit sink. Do **not** turn on Librarian imports or live GitHub/GitLab/Gmail/Drive automation merely to test transport. Keep all AI/provider execution disabled and maintain the agreed €20/month AI budget ceiling.
6. Submit exactly one authorized event with a stable eventId/correlationId; verify HMAC source scope, 202 durable receipt, exact correlation and event identity. Perform authenticated readback to the same receiptId and require matching correlationId; persist minimal audit metadata. Test one same-event replay for 200 duplicate with no second side effect.
7. Capture the exact remote deployment identifiers, timestamped request/receipt/readback traces (redacted), Durable Object evidence, CI/head SHA and expected result. Do not classify as CONNECTED or TESTED without these.
8. If intake times out or returns malformed success, record `UNKNOWN`, retain the original eventId and **do not automatically retry**. Reconcile using only approved readback/audit, not a replacement eventId.

## Immediate rollback / stop conditions

- Unauthorized scope, missing or changed binding, wrong commit, bad receipt or correlation, missing audit/provenance, unexpected AI call, alarm flood, rate limit, timeout, nonzero unintended cost, failed required CI or any uncertain effect: stop at once.
- Expire staging again, disable the source integration flag, remove any temporary service bindings or staging-only secrets through the *owning* change process, and verify readback after rollback. Do not alter unrelated Worker routes, cron or deployments.
- No production enablement, merge, deploy or account-billing change is authorized by this document.

## Honest status semantics

`DEPLOYED`: a Cloudflare deployment exists, **not** evidence of connectivity. `CONNECTED`: approved, authenticated transport + real matching durable receipt and readback. `TESTED`: repeatable staging trace for that exact deployment and CI SHA. `BLOCKED`: required trust, binding, or staging gate missing. `DISABLED`: a verified explicit shutdown flag/expiry prevents the Brain integration. These are not mutually exclusive infrastructure facts, but the per-worker report publishes one **Brain integration** state and lists deployment separately.

## Additional hard gate — current Brain cannot authenticate Drive/Gmail/News source identity

2026-11-05 code-level compatibility inspection established that `authenticate()` maps the `staging-v1` HMAC key to logical source `staging`; `POST /v1/events` passes that authenticated source to `validateEvent(event, source)`, which requires equality with `event.sourceType`. Thus the existing `drive`, `gmail`, `news` adapter policies cannot pass real Brain admission even if staging is unexpired, its secret is installed, and a Service Binding is added. Expected rejection: HTTP 422 `INVALID_IDENTITY`. This is **not** an authorization issue to bypass by relabelling source events as `staging`.

Before enabling staging: #219 Brain owner must approve a distinct cryptographic per-caller identity mapping to explicitly allowlisted sources and event types, with replay resistance and receipt readback authorization. #224 adapter owner must match the final contract, preserving true `event.sourceType`. Re-run strict synthetic identity rejection tests and the exact-head CI after both changes. Only then attempt a scoped, deterministic private Worker → Brain → receipt → Worker test in a time-bounded approved staging release. Until then, no remote E2E attempt and no deployment/expiry change.


## 2026-11-06 — current addendum (supersedes older snapshot claims, no live changes)

Fresh Cloudflare GET on all nine Worker settings, deployments, versions, schedules, subdomains and secret binding *metadata* confirmed **9/9 deployed, 0/9 native Brain Service Bindings, 0 remote authenticated receipts, 0 crons, 0 custom Worker routes/domains**. The Brain `BRAIN` DO and `AI` bindings still exist; `STAGING_EXPIRES_AT=1970-01-01T00:00:00Z` remains disabled, `DEPLOY_SHA=d3d13b605f409bfda6f372742d629fd8eaf12145` remains divergent from `main=c89823a21efc1fa9f979b17a6567337a498a1969`. No staging intake/operator secret binding names are present.

**Correction since previous inventory:** Cloudflare now reports **1 standalone D1** database `archelaos-photo-archive`, independent of the existing canonical Brain DO's SQLite. The previous zero D1 observation is historical, not a current assertion. The four DO namespaces are unchanged. Neither this update nor its plan uses or mutates the photo archive.

**Identity gate still blocked:** `staging-v1` resolves to `staging` in current Brain, not `drive`/`gmail`/`news`; draft Brain #234 only introduces `analytics` and `apps_script` identities. Never bypass `INVALID_IDENTITY` by forging event sources. Brain owner must approve source-scoped authorization and independently authenticated receipt readback before any staged private event is sent.

Current [operator activation packet](./OPERATOR-STAGING-ACTIVATION-20261106.md) limits a proposed staging window to **at most one hour**, preserves all other bindings/flags, requires per-owner separate approval of source-side service bindings, exact Brain redeploy, secrets, window, deterministic non-billable E2E, negative security/replay/restart and rollback evidence. The associated read-only eligibility checker now rejects non-boolean approvals, wrong `BRAIN` DO class and unbounded expiry. The contract tests are mock/offline only; **no actual Cloudflare health or E2E call was made**. Retain **BLOCKED / NO GO** until independent proof and operator approval.
