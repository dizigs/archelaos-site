# Automation Bridge → Canonical Brain: first scoped handoff

Status: **CODE-ONLY / OFF / NO LIVE E2E**. Scope is the existing `archelaos-automation-bridge` caller and canonical `archelaos-brain-staging`, **not** Self-Heal, Librarian, Analytics or other Workers.

## Evidence checked (read-only, 6–7 November 2026)

- GitHub `main` inspected at `edb817f5077caec5a1495be11f0f90ba66d91e02`. Both `brain/src/contract.mjs` and the existing source-only `automation/cloudflare-brain-integration/client.mjs` were inspected. The canonical current source contract maps `drive-v1` and `gmail-v1` explicitly; historical notes asserting only a `staging-v1` contract are superseded **for source code**, not for deployed runtime.
- Fresh authenticated **Cloudflare GET**, not a deployment or an RPC: `archelaos-automation-bridge` deployment `e9da0b1c-99b4-4861-9a94-119732448ff0`, version `9445de37-5465-4927-be71-a546359c5b21`, existing Durable Object `APPS_SCRIPT_COORDINATOR`, KV `AUTH_KV` and 12 pre-existing secret bindings. **No `BRAIN_PRIVATE` service binding**, no `BRAIN_DRIVE_INTAKE_KEY`, no `BRAIN_GMAIL_INTAKE_KEY`, no `BRAIN_CAPABILITY_RECEIPT_KEY` binding metadata on this caller.
- `archelaos-brain-staging`: current deployment `bac07481-10c6-4c82-8251-8dfb2ce8a0a6`, version `e565910f-bbb4-44f6-b0b5-3463906ce495`, configured `DEPLOY_SHA=5c5401d57fda3a3d1a815c48b43f55a2741a8ded` (**configuration text, not executable-byte attestation**). `STAGING_EXPIRES_AT=1970-01-01T00:00:00Z` remains expired. `BRAIN` DO and `AI` bindings exist. Its **`HEALER` service binding to `archelaos-self-heal` exists**, unlike older nine-Worker inventory snapshots. That unrelated service binding must be preserved; it is **not** evidence of Brain ↔ Self-Heal E2E success. No Brain Drive/Gmail intake or receipt HMAC secret names were observed.
- No credentials, secret values, real source data or private Drive/Gmail content were read or logged. No route, cron, public URL, binding, Worker, AI inference or live secret was changed.
- This readback alone does **not** prove the public/worker source code is the deployed Bridge code. The current GitHub source adapter is a library and is not evidence that the Bridge has imported or enabled it.

## Isolated hardening in this Draft PR

In `client.mjs`, `ready()` now fails with `HMAC_TRUST_DOMAINS_NOT_SEPARATED` if the configured request HMAC key and Brain receipt-verification HMAC key are **identical**, before any private RPC. The new synthetic regression in `client.test.mjs` proves zero remote calls in that case. Distinct keys are necessary but **not sufficient** proof of independent receipt provenance or Cloudflare connectivity.

Do not add an adapter call to the deployed Bridge or enable the integration merely because this test passes. Existing data/provenance verification and durable auditing must remain strict.

## Ordered operator-only release gates

1. Independently validate current Brain source, CI and installed executable version; pin an approved exact SHA and preserve the canonical `BRAIN` Durable Object/SQLite. Do not unexpire staging casually.
2. Verify real trusted **Drive** or **Gmail** revision/receipt provenance, distinct scoped request identities, source-specific event allowlists, an independent receipt verification trust domain and durable local audit. Keep private document contents out of events and logs.
3. Review a **complete** proposed Bridge binding configuration preserving its existing Durable Object, KV, 12 secret bindings and routes. A future native caller-side `BRAIN_PRIVATE` → `archelaos-brain-staging` requires separate release-owner approval; do not send partial Cloudflare settings mutations.
4. In a bounded, approved **private-only staging** window, verify configured Brain version, independently signed event acceptance, immutable receipt and readback, duplicate/replay rejection, source identity isolation, restart preservation, kill switch, UNKNOWN reconciliation and rollback. Do not count local tests, healthy status or an installed Service Binding as E2E proof.
5. No auto-retry of UNKNOWN deliveries, no public fallback, no Google writes, no AI spend, no merge/deployment or new DO/ledger under this PR. STOP on failed required CI or missing evidence.

Release handoff: **Code review may proceed; runtime integration remains BLOCKED** until the independent operator and source-owner gates above pass.

## Deployed-source capability cross-check (read-only)

The authenticated Cloudflare GET for `archelaos-automation-bridge/content/v2` returned a readable Worker source payload. A **Boolean/literal search only** was performed; no source body or personal material was copied to GitHub. The current deployed source contains literal OAuth scopes:
- `https://www.googleapis.com/auth/userinfo.email`
- `https://www.googleapis.com/auth/script.projects`

It also contains route literals including `/auth/start`, `/oauth/callback`, `/api/apps-script/` and `/api/apps-script/operator-probe`. The inspected payload **does not contain literal** `BRAIN_PRIVATE`, `submitToBrain`, `source.file.created`, `source.message.received`, Drive or Gmail OAuth scope strings. A negative source-string check **cannot prove every possible runtime capability absent**, and listed scopes **cannot establish actual authorized OAuth grants**. This is not provider access proof.

**Revised first rollout choice:** since the actual deployed Bridge visibly contains Apps Script integration but no confirmed Drive/Gmail source event emitters, first validate **trusted Apps Script provider receipt → private Brain capability** before considering Drive/Gmail. The current `brain/src/worker.mjs` source has separate `/v1/capabilities/apps-script`, `/v1/intake/apps-script` and `/v1/apps-script/readback` capability routes guarded by `apps-script-v1` identity and OFF-by-default private flags. The generic `validateEvent()` still intentionally excludes `apps_script`; that **does not invalidate the separate capability intake**. Neither code route proves the deployed Brain version is runtime-ready.

`apps-script-readiness.mjs` now provides a *pure, non-authorizing* operator preflight. It verifies supplied metadata about the existing Brain/Bridge bindings, scoped secrets, preserved `APPS_SCRIPT_COORDINATOR` and `AUTH_KV`, executable version attestation, bounded staging expiry, real Google OAuth grant verification, trusted external receipt, source code mount, durable audit, trust separation, immutable capability and write lock, plus explicit owner/operator release approvals. It always reports `liveConnectionVerified:false` and `liveGoogleWritesAuthorized:false`, even for synthetic inputs satisfying all predicates.

The synthetic negative suite `apps-script-readiness.test.mjs` is imported by the existing Cloudflare Brain adapter CI suite. **Runtime remains BLOCKED** with the actual Cloudflare metadata; there is no approved bridge source deployment or native Service Binding. Tests are not live connectivity evidence.

## Source-owner handoff needed before any real service binding

1. Capture a vetted, reproducible copy of the *currently deployed* Automation Bridge source in its designated private maintainer workspace, so imports can be reviewed and installed without overwriting the existing Worker.
2. Produce independent Google Apps Script readback/provenance and authorized OAuth grant evidence, with no scripts, tokens, project identifiers or private document bodies in public logs.
3. Import the existing approved `automation/apps-script-brain-relay/` contract into the existing Bridge under a separate release-owner PR. Keep all existing HTTP routes, DO/KV and 12 secret binding names unchanged.
4. Require a fresh complete Cloudflare bindings inventory, exact-sha runtime attestation and a tested rollback before operator consideration of `BRAIN_PRIVATE`. No partial settings PUT/PATCH, no public proxy and no new scheduler.
