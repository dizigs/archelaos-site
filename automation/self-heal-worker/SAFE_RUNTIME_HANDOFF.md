# Self-Heal ↔ canonical Brain — private staging integration / rollback

**Status: CODE READY only after exact-head tests; RUNTIME BLOCKED until the independent Brain owner signs off and validates an authenticated internal Service binding.** This package owns ONLY `automation/self-heal-worker/**` and `automation/brain-security/**`. It does not configure Cloudflare, start a scheduler, change `brain/**`, enable AI providers, merge a PR or deploy.

## 1. Existing components, not a new control plane

- Existing `HealerMemory` SQLite Durable Object stores incidents, observations, recoveries and now a bounded nonce-replay table. A persisted `CLAIMED` or `UNKNOWN` outcome is NEVER resumed automatically after restart.
- Existing `RecoveryLedger`: at most **3 read-only health probes per incident**, with 30-second and 120-second durable delays; after the third transient outcome the circuit is OPEN. No alarms or autonomous retry loops.
- Existing `brain-security` guards still wrap the **canonical BrainCoordinator storage** and `brain/src/budget.mjs`; there is NO extra financial ledger. AI remains disabled until Brain owner confirms one ledger, provider admission and scoped cost/alerts.
- **No production repairs**. CI failure may create at most an authorized, review-only Brain intent, with no direct GitHub write. P0/security and deployment drift always require human intervention.

## 2. Exact private authentication handoff requested from Brain owner

**Transport:** approved Cloudflare Service bindings in staging only; `archelaos-self-heal` receives a direct RPC `attemptRecovery(signedEnvelope)` from its approved caller. Self-Heal independently checks HMAC-SHA256 using a fresh per-environment **secret** `HEALER_EVENT_HMAC_KEY` (never commit/log it). Missing secret, disabled binding, invalid signature, wrong scope, clock drift, unsupported source or nonce-store failure must fail closed. The Brain owner must implement the signer; this PR does **not** install a binding, secret or signing key in production.

**Exact envelope (one argument to RPC):**
- `schemaVersion: 1`, `issuer: "canonical-brain"`, `scope: "selfheal.recover"`
- `issuedAtMs`: integer UTC epoch milliseconds within ±300,000 ms
- `nonce`: fresh random 32-char lowercase hex, single-use in the healer's existing SQLite Durable Object
- `payload`: exact UTF-8 JSON string (up to 1,200 bytes) accepted by the EXISTING `parseFinding` allowlist
- `signature`: lowercase hex HMAC-SHA256 over the UTF-8 bytes of `["selfheal.recover","canonical-brain",String(issuedAtMs),nonce,payload].join("\\n")`

The signer and verifier must agree on the **literal newline separators**, not JSON canonicalization. Replay is rejected even after a Durable Object restart. No plain `finding`, caller `verified:true`, public HTTP endpoint or secret-bearing query parameters are accepted. The public `fetch` returns 404. Brain must restrict who may obtain the outbound Service binding, not simply rely on HMAC.

**After HMAC**, Self-Heal invokes only `env.BRAIN_RECOVERY.verifySelfHealReceipt(finding)` against the independently approved and authenticated private Brain port. Its response MUST be a receipt retrieved from Brain-owned durable evidence, not merely a caller-provided boolean:
- `verified: true`, `issuer: "central-brain"`, `bindingScope: "selfheal.recover"`, `provenanceVerified: true`, `killSwitchesVerified: true`
- exact `repository`, `source`, `commit`, `evidenceId`, `code` and `resource` matching the verified finding; `receiptId` UUID; unexpired `expiresAtMs` no more than five minutes into the future
- `paused: false`, `incidentAuthorized: true`, `repairWritesAllowed: false`
- specific `builderRoutingAllowed` or `readOnlyProbeAllowed` permission, not a blanket administrator capability
- **for `CI_FAILURE`**: `requiredCi: {verdict:"FAILED",required:true,commit,evidenceId,runAttempt,chainHaltReadback:true}`, where Brain independently verifies the exact required-check run/attempt/job, correct commit SHA, and has durably STOPPED the corresponding chain **before** returning this receipt. Missing, pending, skipped, cancelled, wrong-SHA or unknown check evidence is NOT an authorized CI failure.

Review-only port `routeSelfHealReview(plan)`: verify the same receipt; accept only `reviewOnly:true`, `autoMerge:false`, `deploy:false`, `retryBudget:0`, `ledgerOwner:"canonical-brain"`, `bindingScope:"selfheal.recover"`. Read back `accepted:true`, same `receiptId`, `verifiedReadback:true`, `reviewOnly:true`, `ledgerOwner:"canonical-brain"`, and for CI `requiredCiHaltedReadback:true`. No AI reservation or provider action may be initiated by Self-Heal; if a later review uses AI, it MUST go through Brain's single atomic ledger and global 20€ monthly cap.

Read-only port `recheckSelfHealHealth(probe)`: return a separately verified `{verified:true,readOnly:true,resource,health:"HEALTHY"|"TRANSIENT"|"NON_RETRYABLE"}`. No side-effecting network operations, no auto-corrections. A lost/uncertain receipt or transport timeout leaves durable `UNKNOWN` and needs operator reconciliation.

## 3. Staging activation procedure (operator + Brain owner only)

1. Independently inspect current `main`, this PR's **exact head SHA**, required checks/CodeQL/SonarCloud, diff ownership and merge conflicts. Ensure no ongoing conflicting service-binding changes. Do not merge without central merge owner.
2. Read-only inspect the deployed `archelaos-brain-staging` and `archelaos-self-heal` deployment IDs/SHAs, current bindings, DO migration tags, routes, cron, secret **names only**, kill switches and staging expiry. **If staging is expired, SHA differs, any binding is missing or authenticity uncertain: STOP.** A successfully deployed Worker is not a successfully linked Worker.
3. With approved operator access, separately provision a unique staging `HEALER_EVENT_HMAC_KEY` in a sealed secret store; confirm the expected Brain sender uses the same value without logging it. Configure minimal-scoped `BRAIN_RECOVERY` and HEALER Service bindings **in the owning integration team's files only**. No public routes or workers.dev and no second Brain/DO/AI ledger.
4. Keep provider calls and repair writes disabled, global emergency-pause switch on until staged test authorization is explicitly agreed. Run credential-free module tests before activating any staging service.
5. Turn on staging communication only for a single synthetic, exact-SHA verified event. Verify valid HMAC succeeds once; altered payload, wrong scope, expired timestamp and repeated nonce reject. Read back durable `recoveryStatus()` after a DO restart.
6. Test CI failure chain halt before review intent; missing required-check proof rejects, no GitHub write. Test lost Brain receipt, emergency pause, staging SHA drift, unknown timeout and three bounded health probes/circuit-open, with fresh trusted triggers for each due retry. Verify correlation and receipt IDs without exposing logs/prompts/secrets.
7. Verify the only possible AI usage is routed through the **single canonical Brain ledger**; no provider call or reservation should occur during this Self-Heal test. Review Cloudflare billing/limits and logs, then ask the central merge owner for explicit decision. No automatic production enablement.

## 4. Emergency pause and rollback

- **Emergency stop:** set canonical Brain global/AI/source and Self-Heal authorizations to paused in the trusted Brain state; revoke or disable the staging HEALER/BRAIN_RECOVERY Service binding and rotate the staging HMAC secret if compromise suspected. Do not retry ambiguous events.
- **Rollback trigger:** any auth/nonce failure, unexpected RPC exposure, missing receipt, exact-SHA mismatch, CI chain continuing after failed required check, ledger drift, unknown spend or transient probe escalation.
- **Rollback execution:** stop staging ingress, keep all production routes/deployments untouched, revert staging Worker to its previously verified deployment ID using the owning Cloudflare change process, and inspect readback. Do not roll back SQLite durable tables by deleting them: preserve receipts/nonces for audit and reconciliation.
- **Post-rollback proof:** verify no new Service binding publicly exposed, no schedule, no direct GitHub write, no AI charge, no repair, no new production deployment. Retain evidence, incident IDs, check run/attempt/jobs and actual Cloudflare deployment IDs; mark state `RUNTIME BLOCKED` pending review.

## 5. Verification commands (repository root)

```sh
node --check automation/self-heal-worker/src/contract.mjs
node --check automation/self-heal-worker/src/recovery.mjs
node --check automation/self-heal-worker/src/worker.mjs
node --test automation/self-heal-worker/test/*.test.mjs
node --test automation/brain-security/*.test.mjs
```

These tests are **offline/synthetic**. They are not staging tests and cannot prove deployed Cloudflare bindings, secrets, external receipts or actual required-check provenance.

## 6. Explicit handoff / remaining blockers

**Brain core owner:** supply signer, independently authenticated `verifySelfHealReceipt`/review/probe RPCs, durable exact-SHA required CI halt readback, source-specific kill-switch readback, receipt lease and ledger provenance. Must reject unsupported events rather than mint optimistic receipts.

**Cloudflare binding owner:** approve least-privilege staging Service bindings and secret distribution, verify runtime SHA, staging expiry, internal-only routing, audit and rollback. Must not modify these from this PR.

**Central merge owner:** inspect full exact-head checks, SonarCloud, CodeQL and conflicts; merge only when satisfied. PRODUCTION remains paused until separate controlled approval.
