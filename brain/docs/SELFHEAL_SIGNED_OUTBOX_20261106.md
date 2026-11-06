# Brain → Self-Heal signed sender — CODE ONLY, DEFAULT OFF

This is a proposed internal helper for the **existing canonical Brain** and **existing Self-Heal Worker**, not a second Worker, coordinator, database, scheduler, signing service or AI budget.

## Supplied in this PR

- `brain/src/selfheal_signed_outbox.mjs`: exact compatible `selfheal.recover` / `canonical-brain` HMAC-SHA256 envelope signing and a one-shot, fail-closed delivery helper.
- `brain/test/selfheal_signed_outbox.test.mjs`: exercises interoperability against the REAL `automation/self-heal-worker/src/contract.mjs` verifier, canonical SQLite proof/controls, missing gates, retries, tampered proof and network UNKNOWN.
- `SELFHEAL_OUTBOX_SCHEMA`: **one table inside existing BrainCoordinator SQLite**, never a parallel ledger. Only durable independently verified `selfheal_ci_proofs` + `source:github` pause + global unpaused + AI paused permit one outbox claim.

## Critical constraints and limitations

1. **NO runtime entrypoint or event trigger has been wired.** No import into `brain/src/worker.mjs`, no `SCHEMA` migration, no public or private endpoint, and no Worker/Cloudflare modifications. Neither signing nor delivery can occur in deployed code from this PR alone.
2. Both `BRAIN_SELFHEAL_DISPATCH_ENABLED` and recovery/binding flags must explicitly equal `true`; `ENVIRONMENT=staging`; approved and deployed nonzero SHA match; staging expires within 60 minutes; sealed `HEALER_EVENT_HMAC_KEY` and the existing `HEALER` native Service Binding are mandatory. **None are provisioned or enabled by this PR.**
3. Every attempted dispatch commits an immutable `UNKNOWN` barrier **before** HMAC signing or calling the Healer. The helper does **not** treat a successful RPC response as authenticated durable downstream readback. This deliberately sacrifices automatic retry to avoid duplicate or uncontrolled recovery. It cannot report `CONNECTED`, `RECOVERED` or `ROUTED` as trusted outcomes.
4. Actual positive `selfheal_ci_proofs` must be generated solely through existing `BrainRecoveryPort.verifySelfHealReceipt` and independently verified GitHub provider evidence. Caller-supplied `verified:true` / arbitrary finding fields do not authorize this helper.
5. Existing `source:github` pause is a canonical Brain scheduling halt, **not proof that independent GitHub Actions were halted**. Any later autonomous repair requires independent external chain-halt evidence.
6. This module itself does not invoke AI, create issues/PRs, edit GitHub, run tests, change routes/crons, deploy or execute repair commands. Any automatic repairs are **still forbidden**.

## Next owner-controlled gates (NOT implemented here)

- Brain and Security review exact SHA and add `SELFHEAL_OUTBOX_SCHEMA` to the single canonical BrainCoordinator schema only after approving the recovery authorization/trigger contract.
- Choose a narrowly scoped, authenticated source-originated trigger (no privileged operator scope to Guardian or other sources), bind existing `HEALER` privately and install the sealed HMAC key in short-lived staging. Never expose a public HTTP trigger.
- Authorize and attest the existing Self-Heal → named `BrainRecoveryPort` binding, cross-Worker key consistency, exact executable bytes/SHA, zero public routes, bounded expiry and rollback.
- Run real private E2E signed event → independently verified GitHub CI failure → canonical ledger halt/receipt → one Healer dispatch → immutable downstream readback; exercise tamper, replay, stale SHA, missing token, timeout/UNKNOWN and rollback. **No AI billable call, GitHub write, auto-repair or merge** during this staging exercise.
- Guardian and Photo Worker remain separately owned and untouched.

**Verdict: SIGNER/ONE-SHOT OUTBOX CANDIDATE; LIVE CONNECTION AND DELIVERY NOT VERIFIED.**
