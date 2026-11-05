# Brain execution authority — 2026-11-05 (staging-only)

**Repository:** dizigs/archelaos-site. **Single durable authority:** existing
`brain/src/worker.mjs` / `BrainCoordinator` / SQLite Durable Object `central-v1`.
This increment does not create a second Brain, Worker or billing ledger.

## Exclusive ownership and conflicts
- This branch owns only `brain/src/exec_authority.mjs`,
  `brain/test/exec_authority.test.mjs`, `brain/src/worker.mjs`,
  `brain/src/budget.mjs` and this document.
- PR #111 has merged; the implementation extends that runtime rather than
  replacing it. PR #209 owns the inert Build/Testing scaffold. PR #213 owns
  `automation/brain-worker-executors/integration/**`; PR #214 owns Gemini,
  PR #211 owns Gemma and PR #212 owns Testing.
- None of those open PR files, deployment workflows, Cloudflare settings,
  OAuth grants, Apps Script projects or protected branches are touched.
- PR #202's separate event-boundary validator and PR #201's Apps Script relay
  are independent and are **not** represented as integrated.

## Admission and state machine
1. Operator HMAC, already present in `contract.mjs`, signs a bounded
   `POST /v1/exec/intents` payload. It is stored immutably with a SHA-256
   fingerprint and returned as `PENDING_REVIEW`. A duplicate returns the same
   durable receipt; contradictory reuse returns HTTP 409.
2. A distinct, signed `POST /v1/exec/approvals` must include the exact
   taskId, fingerprint and independent approval-evidence SHA-256. Only then
   may the task enter `QUEUED`. This is an operator authorization receipt,
   **not** an automated security review or verified third-party approval.
3. Claims use `POST /v1/exec/claims`: strict path scopes, subtree overlap
   locks, at most 2 active/uncertain AI builds and atomic reservation from the
   existing `ai_months` / `ai_reservations` ledger (EUR 20 hard ceiling).
   The Brain budget module has explicit Gemini and Gemma model price keys.
4. A single `POST /v1/exec/begin` claims one possible external attempt
   *before* the transport. `POST /v1/exec/complete` requires exact owner,
   durable evidence digest and cost readback; settlement releases locks.
   This package includes **no** provider transport, GitHub writer or direct
   code execution.
5. An expired claimed/in-flight lease becomes
   `RECONCILE_REQUIRED`, retaining path locks and uncertain reserved
   funds. No blind retry is allowed. Operator-only
   `POST /v1/exec/reconcile` requires a verified outcome and amount.
   The coordinator alarm rechecks leases even when the source-event queue
   is empty. Audit rows are append-only.
6. `GET /v1/exec/intents/:uuid` and `GET /v1/exec/diagnostics`
   expose non-sensitive metadata only, under operator HMAC.

Allowed task classes: BUILD_A, BUILD_B, TESTING, SELF_HEAL, APPS_SCRIPT,
ANALYTICS, LIBRARIAN. Routes are **logical target labels**, not active
Service Bindings. Intents are scoped to 1–12 explicit repository paths and
one immutable 40-character commit SHA. Path traversal, code commands and
extra fields fail closed; no auto-merge or production action exists.

## Compatibility with integration PR #213
Only an already `CLAIMED` BUILD_A, BUILD_B or TESTING task with a live,
non-expired durable lease and a scope outside protected `brain/**` and
`automation/brain-worker-executors/integration/**` may receive a signed
`GET /v1/exec/authorizations/:uuid` readback. Operator HMAC protects the
endpoint; a *separate* `BRAIN_EXECUTOR_SIGNING_KEY` (minimum 43 characters)
HMAC-signs the exact `timestampMs + "\\n" + raw` body for PR #213's verifier.
The returned `issuer`, `audience`, `repository`, `receiptId`, `taskId`,
`commitSha`, `type`, `lane`, `allowedPaths`, expiry and permissions match
#213's fail-closed shape. This does **not** install the key, establish a
Service Binding or bypass PR #213's mandatory independent durable Brain
readback. No external task can claim that a receipt exists by constructing
the JSON itself.

The Brain's existing reservation has already been made at claim time.
An integration executor must reuse that EXACT reservation and must not
reserve again in its own SQLite ledger or inside a Gemini/Gemma adapter.
Until #213's billing/coordination ports accept this exclusive authority,
live execution remains blocked.

## Operational interlock
- Default: `BRAIN_EXECUTION_ADMISSION` is absent and claims are **OFF**.
- Staging-only admission requires `BRAIN_EXECUTION_ADMISSION=enabled`,
  `CENTRAL_LEDGER_VERIFIED=true` and trusted server-side
  `BRAIN_EXECUTION_CONFIG`. Actual AI remains paused in the existing
  coordinator; an enabled admission flag alone cannot launch it.
- `BRAIN_EXECUTION_ADMISSION=synthetic` + `TEST_BUDGET=true` is an
  explicitly instrumented offline test mode only. No API calls or secrets.
- The external HMAC operator route is not an executor service identity.
  **Before live activation**, PR #213 must verify a separate executor
  transport identity, immutable receipt readback and proof that the Brain
  ledger is the *only* reservation/settlement authority. Do not run another
  independent EUR20 ledger in PR #213 or the model adapters.

## Required handoff gates
- Independently verify model IDs, enabled provider bindings, price caps,
  billing+FX evidence and entitlements for Gemini/Gemma and other paid AI
  paths. A free daily quota is not proof of account-wide spending control.
- Wire PR #213 only after source/service authorization, exact-commit checks,
  proper dependency order and verified mutual receipt contracts. Do not
  auto-promote a model proposal into a GitHub commit or PR.
- Stage the actual Worker with isolated secrets and DO SQLite readback,
  then prove signed operator → durable intent → single controlled executor →
  trusted result → budget settlement / recovery. This PR claims no E2E.
- Obtain exact-head GitHub Actions, required check provenance and review;
  explicitly no auto-merge, production deployment, new cron or Codex.

### Local checks
```sh
npm ci --prefix brain --ignore-scripts --no-audit --no-fund
npm run syntax --prefix brain
npm test --prefix brain
python -m unittest discover -s brain/test -p '*_test.py' -v
```
