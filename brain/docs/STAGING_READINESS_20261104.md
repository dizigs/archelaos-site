# Central Brain staging readiness — 4 November 2026 (Europe/Athens)

Single owner/source: PR111, codex/brain-core-staging. This continues the existing
core, SQLite queue, source adapters, content pipeline and shared cost ledger.
No replacement Worker, orchestrator, schedule or production migration is made.
Existing archelaos-automation-bridge is untouched, including all encrypted secrets.

| Stage | Evidence-backed state |
| --- | --- |
| Core authentication/receipt/queue/dedupe/audit | TESTED: actual local and hosted workerd/SQLite |
| Bounded retry3, DLQ, pause/resume, crash/restart | TESTED in native runtime; remote NOT VERIFIED |
| Global AI20 and Codex/OpenAI15 budget | TESTED atomic reservations,75/90 alerts, settlement/restart/concurrency; live execution OFF |
| Read-only Cloudflare staging inventory | DONE: actual provider response through dedicated read token |
| Isolated staging Worker | NOT DEPLOYED: actual settings404/code10007; no DO namespaces listed |
| Free-plan SQLite DO entitlement and write access | BLOCKED: not established by read success; no billing/write probe or upgrade |
| Staging authentication secrets | BLOCKED: independently provisioned intake/operator keys absent; bridge secrets must not be copied |
| Remote deployment/runtime logs, DO health/event proof | NOT VERIFIED: no installed staging resource or signed remote execution |
| Real Gmail/Drive/GitHub/contribution sources | BLOCKED: authorized source ports/watch/receipts and rollback evidence not connected |
| UptimeRobot live operations / sponsorship | NOT VERIFIED; read-only transport must stay where its existing encrypted key resides |
| Programmatic paid Codex executor | OFF: reported key/credit balance does not prove verified billing/cost/interface readiness |

## Actual test/source evidence

Functional source d6562ab3af0ceeac85013135f2d36f8de5bbed1b:
[manual runtime and read-access run41746767910](https://github.com/dizigs/archelaos-site/actions/runs/41746767910),
runtime check126301628185 emits67 tests/pass67/fail0/skipped0.
Five provider Python tests, syntax24 modules and credential-free Wrangler bundle
steps pass. Source PR CI also passes; no native test is relabelled as remote proof.
Three new Codex allocation tests failed before enforcement, then passed.

The [actual read-access annotation](../evidence/staging-read-access-20261104.json)
check126301889108 establishes HTTP200 for account-settings, registered subdomain
and DO namespace listing (count0), and provider404/code10007 for exactly
archelaos-brain-staging/settings. This read-only identity is a changed condition
from earlier captured403 calls; each fixed endpoint was called once, with no
unchanged retry. No subscription/billing or existing bridge endpoint was touched.
Read authorization does not prove Workers Scripts Write or free entitlement.

## Exact external prerequisites and safe deployment sequence

1. Authorized account operator verifies current free-plan SQLite Durable Object
   entitlement and usage, without upgrading subscriptions or enabling billing.
2. Establish authorized **Workers Scripts Write** scoped to approved staging
   resources where supported, plus actual runtime-log/tail access. Existing
   dedicated read identity does not establish this. Do not repurpose or extract
   the existing bridge key/token; no new paid service is authorized.
3. Provision independent staging source/operator credentials through a supported
   secret channel; never copy bridge secrets, commit them or print them. Limit
   staging expiry and fix DEPLOY_SHA to the reviewed40-character source commit.
4. Deploy only wrangler.toml's archelaos-brain-staging plus its SQLite DO class
   migration. Confirm exact version/commit, actual provider deployment/runtime
   logs and namespace availability. No DNS route, production rename or bridge
   upload/overwrite is permitted by this step.
5. Run the existing prove_staging.mjs against that exact isolated origin using
   synthetic technical metadata. Require authenticated receipt, same receipt on
   replay, one queued logical task, attempts1/2/3, DLQ/quarantine and operator
   source/global pause/resume. Verify actual audit rows and runtime logs; retain
   only sanitized correlation/receipt evidence. Local proof already works on
   actual HTTP workerd; it is not a remote deployment assertion.
6. Roll back safely by pausing only staging sources/global dispatch and reverting
   to a reviewed staging version; preserve DO receipts/audit. Do not delete DO
   storage to clear an error or change the existing museum10-minute trigger.

## UptimeRobot port design — not live or remotely tested

The owner reports UPTIMEROBOT_MAIN_API_KEY as an encrypted secret in the existing
bridge. Its value, validity, account plan and SOLO sponsorship are unverified.
Keep it there. The brain should consume an authenticated, reviewed narrow
read-only capability from that existing infrastructure, rather than receive or
copy the key. The observed bridge source has no verified UptimeRobot route yet;
do not invent an operational endpoint or install a second Worker.

Initial allowlist: getMonitors (read-only semantics, even if provider uses POST),
fixed provider origin, bounded pagination/count/response size, sanitized status
summaries and opaque monitor IDs; never log keys, private URLs or account data.
Use bounded rate limits and no immediate retry on401/403.429/5xx read retries
remain bounded and do not create any monitor. No plan/sponsorship activation.

A later independently authorized management capability may only pause/resume
explicitly allowlisted staging monitor IDs, after revision/desired-state checks,
source/operator kill switches and durable operation receipts. Never expose a
free-form provider method, URL or delete operation. Unknown outcome after a
write requires reconciliation, not a fresh operation ID or blind retry. Synthetic
concurrent/restart tests must precede any real management change; this capability
is not implemented or enabled by a metadata-only success.

## Supervisor/executor boundary

Use approved canonical tasks from docs/AUTOMATION_PLAN.md, Issues108/71 and
verified dependencies/ownership. The separate requested evolution diagram has
not been located as a versioned artifact: SOURCE_PENDING, no invented nodes.
ChatGPT supervises; Codex receives immutable bounded task IDs, roadmap/source
hash, exact base SHA, permitted paths, existing owner/PR, acceptance tests,
time/concurrency and cost ceilings. Untrusted Gmail/issue bodies cannot supply
privileged instructions or select executors/secrets.

Issue comments are not a Codex Cloud task API. An official supported executor
(e.g. reviewed pinned Codex action) needs authorized dispatch, isolated workspace,
step-scoped key, no write-to-main/merge/deploy privileges and a separate scoped
Draft-PR publication identity. No such charged job is added here. Validate
synthetic dispatch/status/deduplication/unknown-outcome behavior first, then real
billing scope/price/FX/fixed-fee coverage and usage reconciliation. Budget controls
cannot police unseen expenditure outside the shared ledger. All OpenAI use is
conservatively included in the Codex15 allocation; total provider usage remains
bounded by the aggregate20. No key existence or prepaid UI screenshot proves
those live controls are operating.

NEXT: approved source/transport and isolated staging authority, remote proof,
then one source at a time with rollback. Remaining adapter implementation and
safe executor integration are recorded, not claimed complete. The latest security
CI tasks remain isolated in PR127, preserving P0/111/124 ownership.
