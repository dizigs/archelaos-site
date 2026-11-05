# Brain ↔ Workers: staging enablement and rollback (NO LIVE CHANGE)

Owner/scope: `automation/cloudflare-brain-integration/**`. Applies to existing `archelaos-brain-staging`; **not** a request to create or deploy another Worker. Last observed: 2026-11-05, Cloudflare API **GET only**. No execution evidence or secrets included.

## Evidence and decision

- 9 deployed scripts in the account containing `archelaos.club`; 0 service bindings; 0 registered cron schedules; 0 Worker routes or custom Worker domains.
- `archelaos-brain-staging`: `BRAIN` Durable Object namespace + `AI` binding; `ENVIRONMENT=staging`; `DEPLOY_SHA=d3d13b605f409bfda6f372742d629fd8eaf12145`; `STAGING_EXPIRES_AT=1970-01-01T00:00:00Z`. Neither `STAGING_INTAKE_KEY` nor `STAGING_OPERATOR_KEY` secret **binding name** exists. workers.dev disabled.
- Four registered Durable Object namespaces: BrainCoordinator, MuseumScriptCoordinator, LibrarianLedger and HealerMemory. D1 list is empty. SQLite Durable Objects do **not** require an independent D1 database.
- Workers account default usage model is `standard`. Billing subscription lookup returned 403, so the Workers Paid subscription **was not independently verified** by this inventory.
- `archelaos-librarian-staging`: NEWS_IMPORT_ENABLED, ARCHIVE_IMPORT_ENABLED and DRIVE_LINK_PROBE_ENABLED all `false`.
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
