# ARCHELAOS — Antigravity LOCAL source-code repair handoff (PR #288)

## Work mode: LOCAL WORKSPACE, NOT ZIP / WEB PAGE / REMOTE GEMINI

Open the actual checked-out Git repository `dizigs/archelaos-site` as a folder in the locally installed Google Antigravity IDE. Read full source files directly, edit and execute tests in the local workspace. Follow repository root `AGENTS.md` and `docs/LIVE_TASK_TRACKING.md`.

**Repository:** https://github.com/dizigs/archelaos-site
**Existing Draft PR:** https://github.com/dizigs/archelaos-site/pull/288
**Branch:** `assistant/selfheal-dormant-private-ports-20261107`
**Issue:** https://github.com/dizigs/archelaos-site/issues/71

## Objective

Fix the *real* Cloudflare Brain ↔ Healer isolated private HMAC handshake without weakening authentication, expiry/replay detection, service binding isolation or failure-closed behavior. Do NOT create a new PR. Make minimal source changes on the existing PR branch, **after local reproduction and diagnosis**, and provide proof. Do not merge, deploy to production, turn on recovery, or log secrets.

### Verified real Cloudflare observations

1. One-shot isolated Cloudflare QA run [42378268809](https://github.com/dizigs/archelaos-site/actions/runs/42378268809): both QA Workers deployed, named bindings verified, localhost operator-runner reachable, invalid capability denied 404, authorized RPC invoked; returned `REMOTE_HMAC_UNVERIFIED`. Both QA Workers revoked/deleted with provider readback.
2. Later run [42378626973](https://github.com/dizigs/archelaos-site/actions/runs/42378626973): same path to authorized RPC, returns `LIVE_HMAC_GENERIC_UNKNOWN`; both QA Workers revoked/deleted with readback.
3. Normal Brain/Healer deployed scripts remain unchanged; all recovery/dispatch/ACK flags OFF and no public routes. Local tests passed (165+ historical; recheck exact current HEAD).
4. New diagnostic branches in `brain/src/private_hmac_candidate.mjs`, `brain/qa/cloudflare_isolated_acceptance.py` and local runner are currently insufficient because the runner receives generic UNKNOWN. Investigate where the code is lost: whether `BrainHmacAcceptancePort.runChallenge()` returns generic or the `private_hmac_operator_runner.mjs` swallows a thrown remote RPC error. Do not infer the reason.

### Source files to read as a unit

- `brain/src/private_hmac_candidate.mjs`
- `brain/src/private_hmac_protocol.mjs`
- `brain/src/worker.mjs`
- `automation/self-heal-worker/src/worker.mjs`
- `brain/qa/cloudflare_isolated_acceptance.py`
- `brain/qa/private_hmac_operator_runner.mjs`
- `brain/qa/wrangler.operator-local.toml`
- `brain/test/private_hmac_operational_rpc.test.mjs`
- `brain/test/private_hmac_operator_runner.test.mjs`
- `brain/test/private_hmac_acceptance.test.mjs` (if present)
- `brain/wrangler.toml`
- `automation/self-heal-worker/wrangler.toml`
- `.github/workflows/brain-core.yml`
- `.github/workflows/self-heal-worker-ci.yml`

### Local workflow

1. `git status --short`; `git log -1 --oneline`; `git fetch origin`; check out `assistant/selfheal-dormant-private-ports-20261107`, and ensure it is current without discarding uncommitted user work.
2. Read root `AGENTS.md`, the referenced documents, and source files. Validate the actual exports, local runner, service bindings, DO nonce migrations, and exact failure logic; investigate RPC transport/capability/binding, remote workerd semantics, untrusted error suppression and any mismatch of schemas.
3. `npm ci --prefix brain --ignore-scripts --no-audit --no-fund`; run `npm test --prefix brain`, and `node --experimental-sqlite --test automation/self-heal-worker/test/*.test.mjs`. Run the existing Python evidence tests and Wrangler **dry-runs** for both Workers.
4. Add a narrowly scoped reproduction test that proves the exact defect and verifies the correction. Keep negative controls for wrong key, replay, expired permit, wrong SHA, missing binding, unknown response, and 0 actions executed. Never convert unknown errors into success.
5. Update the **existing PR #288** only if local tests pass. Record evidence with commit SHA, test count/log, and a concise explanation in **Issue #71**, and canonical private Sheet LOG when authorized.
6. For real remote proof use the existing **one-shot QA workflow** only after independent safe review of its lifecycle, stage gates and cleanup. Do not run `wrangler deploy` locally, use Cloudflare secret values, expose an HTTP endpoint, or activate autonomous repair.

## STOP conditions

Any failed test or uncertain security boundary = STOP, preserve evidence, explain blocker, no unauthorized retry. Do not touch main, production Workers, global Antigravity config, API tokens, unrelated files or concurrent agent branches. Do not send GitHub/Cloudflare/Google secrets to Gemini or commit them. No background task claims without an active runner.

## Completion criteria

A valid completion report needs the exact-head source/test proof AND authenticated **remote** `REAL_CLOUDFLARE_HMAC_PASS` with `actionsExecuted=0`, followed by proven revoke/delete of both isolated QA Workers. Passing local tests alone is **not** the remote acceptance.
