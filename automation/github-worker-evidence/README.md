# Worker Evidence Registry — read-only pilot

Issue: https://github.com/dizigs/archelaos-site/issues/243

This is an isolated **read-only** Node 22+ prototype. It maps existing GitHub Issues and PRs to current exact SHA, required checks, CodeQL/Sonar, review threads and blockers. It does **not** create Issues, push, merge, dispatch workflows, deploy Workers, write to Cloudflare, invoke AI, or modify the authoritative Brain SQLite ledger.

## Usage

Run offline tests:

    node --test automation/github-worker-evidence/test.mjs

Run evidence collection with a fine-scoped read-only GitHub token (repository metadata, pull requests, checks, rules, GraphQL review threads):

    GITHUB_TOKEN=<read-only-token> node automation/github-worker-evidence/index.mjs > worker-evidence.json

Never commit tokens or generated reports containing private data. The registry is a starter set of **existing** Issues/PRs, not proof of deployed Workers. Expand ownership mapping after checking live project state. If effective branch rules cannot be read, or CI/CodeQL/Sonar/review-thread evidence is missing, the status is BLOCKED and CLI exits 2. The collector caps pagination at five pages and per-request timeouts at 10 seconds.

A merged PR is only CODE_MERGED; Cloudflare provider deployment and private Brain receipts remain NOT_VERIFIED until a separate scoped provider readback adapter is implemented and accepted. Existing #71 handoff inbox and #108 Brain remain canonical. No new schedule, Worker, authorization or production activation is included.

## Evidence acceptance contract (v2, private Control Center proposal only)

This is a **data contract**, not an integration with #249. The consumer must read
only authorized, private reports. The public repository is never a storage
destination for signed private Brain receipts, secret-bearing Cloudflare responses,
person data, raw logs or sensitive costs.

Each `tasks[]` result contains:

- `taskId`, `worker` (registry claim), `workerIdentity.registryTaskId`,
  `workerIdentity.providerWorkerId` (**null until provider attestation**),
  `workerIdentity.identityVerified`, `version`, `environment`;
- `issueUrl`, `prUrl`, `branch`, `headSha`, `baseSha`, `mainSha`,
  `commitSha`, `verifiedAt`, `status` and `blockers[]`;
- `proofStates.code` = CODE_READY or UNKNOWN; `proofStates.ci` =
  CI_PASS or UNKNOWN; `deployment`, `connection`, `authentication` =
  UNKNOWN until **separate, independently authorized** provider readbacks;
- `evidence.source`, `observedAt`, `exactHeadSha`,
  `checks[]` (immutable GitHub check ID, app identity, commit, times),
  `statuses[]` (status ID/context/SHA/updatedAt), `runs[]`
  (run ID, job ID, attempt, SHA, source and observation timestamp),
  `reviewThreads` (count/unresolved/observedAt);
- `requiredChecks[]`, `security`, `unresolvedReviewThreads`,
  `codeMerged`, `providerDeployment=NOT_VERIFIED`, and
  `privateBrainReceipt=NOT_VERIFIED`.

Report level: `schemaVersion=2`, `generatedAt`, `repo`, `mainSha`,
`mainStable`, `mainShaSource`. Empty or changed main readback quarantines
the snapshot. A valid PR or CI result **never** provides a Cloudflare version,
deployment ID, Service Binding execution, connection, or HMAC authentication.
Provider unknowns are explicit `UNKNOWN`, not booleans defaulting to true.
A configured binding is just configuration, not an authenticated RPC test.

The GitHub collector checks exact-head check-run IDs and app identity,
GitHub Actions run/job/attempt readbacks for required checks and CodeQL where
applicable, commit status provenance, required rules, Sonar, unresolved GraphQL
threads, and re-reads the PR head after collection. A second main read prevents
false current-main snapshots. Missing, inconsistent, stale (observation older than
5 minutes), permission denied, pagination overflow, invalid provider timestamps,
failed/neutral/skipped required checks, or unavailable API data fails closed.
Historical immutable CI results are not invalidated merely because the run date
is old, provided the **current** commit and readback are still verified. The
collector does **not** perform cryptographic verification of GitHub itself;
source trust depends on the scoped GitHub API credential and HTTPS transport.
It does not currently support all enterprise rulesets/required checks provider
shapes; unsupported cases must remain BLOCKED rather than inferred successful.

## Acceptance matrix / release gates

| Gate | Pilot behavior | Acceptance |
| --- | --- | --- |
| Stable local task identity and existing Issue/PR | Included; no second registry | CONDITIONAL — real provider Worker ID and version UNKNOWN |
| CODE_READY vs CI_PASS | Separate stages, exact-head gating | CONDITIONAL — must have real required checks/run/job/attempt readback |
| DEPLOYED | No GitHub-to-Cloudflare inference | BLOCKED/UNKNOWN pending provider version and exact SHA |
| CONNECTED | Service Binding config never enough | BLOCKED/UNKNOWN pending signed private E2E |
| AUTHENTICATED | No synthetic proof accepted | BLOCKED/UNKNOWN pending HMAC/replay/receipt proof |
| Missing/stale/forged/inconsistent evidence | Explicit blockers; no fabricated PASS | CODE-GATED by offline regression suite |
| Provider 429, denied, timeout and pagination overflow | Fail closed; no unbounded retry | CODE-GATED by offline regression suite |
| Private Control Center #249 | Schema only, no import or write | ISOLATED |
| Production permissions/deployment | No changes/credentials/cron/schedules | ISOLATED |

Before acceptance run `node --check automation/github-worker-evidence/index.mjs`,
`node --test automation/github-worker-evidence/test.mjs`, fetch **exact current PR
HEAD** Actions run/job/attempts, resolve required status rules and independent
Sonar/CodeQL/review approvals. Existing general website CI is not the same as
running the isolated evidence test suite. Do not claim that this suite passed
unless its output or dedicated Actions job is actually observed.

## Reuse and no-duplication inventory

- Existing GitHub Issue #71 and `.github/workflows/tracker-handoff.yml` for
  ownership/handoffs: never create a duplicate inbox.
- Canonical Brain Issue #108 and associated durable receipts/execution/cost ledger:
  never copy its authoritative role into this GitHub evidence view.
- Existing `tools/cloudflare_deployment_evidence.py`,
  `docs/self-heal/DEPLOYMENT_EVIDENCE.md` and the current
  `cloudflare-pages-status.json` report for **Pages** deployment verification:
  adapt only through its existing owner later. **Pages proof cannot certify
  an individual Cloudflare Worker deployment.**
- Existing GitHub Actions workflow runs, CodeQL, SonarCloud PR evidence and
  PR/Issue history. Their existence does not certify production readiness.

Known residual risks: no authoritative Cloudflare Worker version/SHA/DO/binding
readback; no signed Brain receipt/HMAC/replay negative test; no accepted private
consumer endpoint; no provider-side immutable Worker ID; possible branch policy
permission gaps; optional external check providers without complete metadata;
no rate-limited retry strategy. These are *open acceptance gates*, not PASS.
