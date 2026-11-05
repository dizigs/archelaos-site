# Verified Cloudflare Workers inventory — 2026-11-05

Evidence: read-only Cloudflare REST GET against the account owning archelaos.club, using account workers/scripts, workers/scripts/{name}/settings, deployments, schedules, subdomain, workers/domains, zone workers/routes, and deployed source content/v2 route inspection. No secret values, provider calls or production modifications were performed.

Observed: **exactly 9 Worker scripts**, each with at least one deployment; **zero Worker custom domains**, **zero archelaos.club Worker routes**, **zero service-type bindings**, and **zero registered cron schedules**. A deployed Worker is not automatically running, healthy, scheduled, authorized, or integrated with Brain. Some workers.dev subdomains are enabled but endpoint responsiveness/authentication was not tested. All entries below are **Brain integration statuses**, not generic health claims.

| Existing worker | Verified configuration | Public subdomain enabled | Verified Brain integration / blocker |
| --- | --- | --- | --- |
| archelaos-automation-bridge | DO APPS_SCRIPT_COORDINATOR, KV AUTH_KV, 12 secret_text bindings, fetch; latest deployment 2026-11-05 14:46 UTC | yes | BLOCKED: no Brain service binding or real Brain receipt. Drive/Gmail adapter prepared but disabled. |
| archelaos-brain-staging | DO BRAIN, Workers AI AI, fetch; latest deployment 2026-11-05 13:44 UTC | no | DISABLED: actual STAGING_EXPIRES_AT=1970-01-01T00:00:00Z; required STAGING_INTAKE_KEY and STAGING_OPERATOR_KEY secret names absent. |
| archelaos-fundraising-preview | no bindings, fetch; deployment 2026-11-04 10:36 UTC | yes | BLOCKED: no verified Brain event source or transport. |
| archelaos-gitlab-controller | 2 secret_text bindings, fetch; deployment 2026-11-04 09:06 UTC | yes | BLOCKED: no approved Brain command intent or transport. |
| archelaos-gitlab-guardian | 2 secret_text bindings, fetch and scheduled handlers; deployment 2026-11-04 08:50 UTC | yes | BLOCKED: zero cron schedules; no Brain binding or approved GitLab event type. |
| archelaos-librarian-staging | DO LEDGER, fetch and import/check methods; deployment 2026-11-05 11:22 UTC | no | BLOCKED: all NEWS_IMPORT_ENABLED, ARCHIVE_IMPORT_ENABLED and DRIVE_LINK_PROBE_ENABLED flags are false. No Brain binding/provenance. Drive/News adapter prepared only. |
| archelaos-raisely-bridge | 4 secret_text bindings, fetch; deployment 2026-11-04 10:27 UTC | yes | BLOCKED: Raisely credentials indicated by binding names, not verified API availability or Brain transport. |
| archelaos-self-heal | DO HEALER_MEMORY, fetch and observe/diagnose/status/memory methods; deployment 2026-11-04 21:25 UTC | no | BLOCKED: no verified Brain-to-Self-Heal binding/receipt; separate PR #213 plans review-only failure forwarding. |
| archelaos-workflow-pilot | Workflow binding ARCHELAOS_PILOT, fetch; deployment 2026-11-04 18:57 UTC | no | BLOCKED: Workflow resource binding exists; no verified Brain dispatch or durable launch receipt. |

## Endpoint and route evidence

The existing Brain code (main/brain/src/worker.mjs) declares GET /healthz, POST /v1/events, GET /v1/tasks/{uuid} and operator-only /v1/control and /v1/task-intents. It is deliberately disabled/expired in the deployed staging configuration, and its workers.dev setting is disabled. A route definition in source is **not** an operable public endpoint.

Deployed source scanning found /health references in the Automation Bridge, Fundraising Preview, GitLab Controller, GitLab Guardian and Raisely Bridge; the Guardian also references /check. HTTP method, authorization requirements and actual health are not inferred. Librarian references /v3/files/ in external Drive API code, not as a verified public ingress route. Self-Heal methods use DO internals. Workflow Pilot has its own fetch handler. These candidate paths were not invoked. Zero routes/domains means no known custom-domain Worker endpoints for this account's zone. Avoid guessed workers.dev URLs as integration endpoints.

## Compatibility observations

- Durable Objects: existing bindings present on Brain, Automation Bridge, Librarian, Self-Heal. This PR introduces no DO class or migration.
- Workers AI: the Brain has an AI binding. No model availability, quota, billable request or inference readiness proved.
- Workflows: a named Workflow binding exists on the Pilot; a binding does not prove launch, successful execution or orchestration via Brain.
- Secret binding names are metadata only. Secret values/validity, OAuth grants and remote provider credentials were not inspected.
- Actual source-to-Brain authenticated receipts: **0 verified out of 9**; prepared adapters: **2**, for allowed source types only; deployed integration E2E: **not tested**.
- A source with a scheduled handler but no cron registrations should not be described as automatically scheduled.
- Previous PR boundaries preserved: #111 main, #209 scaffold, #213 integration coordinator, #201 Apps Script, #194 Librarian, #196 Analytics, #131 GitLab, #132 Raisely, #212 Testing, #211/#214 AI providers.

## Blocked next steps (separate owner approvals)

Approved source event contracts and per-worker key identity; time-bounded staging activation under Brain owner; reviewed service bindings on existing Workers; authoritative provenance receipts and durable audit storage; health/readback tests against actual Cloudflare staging, correlation evidence in logs; explicit rollback; independent CI checks. Until these gates are proven, leave adapters disabled and do not claim production/E2E success.
