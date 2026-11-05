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

## Revalidation of live metadata and classifications (2026-11-05, read-only)

A second Cloudflare REST GET inspection on the `archelaos.club` account confirmed the existing inventory against **all 9 script settings, secret metadata listings, deployments, schedules, subdomain settings, Worker routes/domains**, plus the account's DO namespaces and D1 database list. No changes were made. Read-only checks found:

- Latest deployments: Automation Bridge `2026-11-05T14:46:48Z`; Brain `2026-11-05T13:44:32Z`; Fundraising `2026-11-04T10:36:02Z`; GitLab Controller `2026-11-04T09:06:42Z`; GitLab Guardian `2026-11-04T08:50:14Z`; Librarian `2026-11-05T11:22:24Z`; Raisely `2026-11-04T10:27:59Z`; Self-Heal `2026-11-04T21:25:44Z`; Workflow Pilot `2026-11-04T18:57:51Z`. These prove **DEPLOYED**, not running, accessible, or CONNECTED.
- The **only non-secret resource bindings** across these scripts are four Durable Object bindings (`APPS_SCRIPT_COORDINATOR`, `BRAIN`, `LEDGER`, `HEALER_MEMORY`), one KV (`AUTH_KV`), Workers AI (`AI`), and Workflow (`ARCHELAOS_PILOT`); **zero service bindings** and **zero D1 bindings**.
- Registered DO namespaces: `archelaos-automation-bridge_MuseumScriptCoordinator`, `archelaos-brain-staging_BrainCoordinator`, `archelaos-librarian-staging_LibrarianLedger`, `archelaos-self-heal_HealerMemory`. D1 database listing returned **0**. Existing Brain DO SQLite persistence does not imply a D1 database.
- Secret **metadata only**: Automation Bridge has 12 `secret_text` bindings; GitLab Controller 2; GitLab Guardian 2; Raisely Bridge 4; the other 5 Workers 0. No secret values read or reproduced here.
- `archelaos-brain-staging` exact deployed config: `ENVIRONMENT=staging`, `DEPLOY_SHA=d3d13b605f409bfda6f372742d629fd8eaf12145`, `STAGING_EXPIRES_AT=1970-01-01T00:00:00Z`; no `STAGING_INTAKE_KEY` or `STAGING_OPERATOR_KEY` metadata. The staging HTTP entrypoint therefore rejects even its own health endpoint before matching routes. It cannot be used for honest E2E.
- Librarian flags verified as `false`: `NEWS_IMPORT_ENABLED`, `ARCHIVE_IMPORT_ENABLED` and `DRIVE_LINK_PROBE_ENABLED`.
- The deployment SHA `d3d13b605f409bfda6f372742d629fd8eaf12145` was resolved as a real GitHub commit, but comparing it to current `main` (`bddc3defd78c3a2bd18c7772d4bcc97092cfb5be`) returned **diverged**, 21 commits ahead and 24 behind. Hence staging release alignment is an **additional blocker**, distinct from its expired setting and absent keys/bindings.
- Workers account settings returned `default_usage_model=standard`. Account subscription listing returned HTTP 403, so **Workers Paid billing entitlement was not independently confirmed**; no new metered resource was created or invoked.
- All 9 script cron registrations empty; Workers custom domains and `archelaos.club` Worker routes empty.

### Strict per-worker Brain connection outcome

| Worker | Cloudflare deployment | Brain integration result | Real E2E verified |
| --- | --- | --- | --- |
| archelaos-automation-bridge | DEPLOYED | **BLOCKED** — native Brain binding, approved identity/provenance and receipts missing | No |
| archelaos-brain-staging | DEPLOYED | **DISABLED** — expired, intake/operator secret metadata missing | No |
| archelaos-fundraising-preview | DEPLOYED | **BLOCKED** — no approved event/intent contract or binding | No |
| archelaos-gitlab-controller | DEPLOYED | **BLOCKED** — no operator-approved command scope or binding | No |
| archelaos-gitlab-guardian | DEPLOYED | **BLOCKED** — no cron or approved GitLab source event contract/binding | No |
| archelaos-librarian-staging | DEPLOYED | **BLOCKED** — import/probe flags off; no binding or authoritative proof | No |
| archelaos-raisely-bridge | DEPLOYED | **BLOCKED** — no approved Raisely event contract/binding | No |
| archelaos-self-heal | DEPLOYED | **BLOCKED** — no verified Brain task-intent contract/binding/receipt | No |
| archelaos-workflow-pilot | DEPLOYED | **BLOCKED** — workflow binding exists, but no Brain launch contract/receipt | No |

**Roll-up:** DEPLOYED 9/9; **CONNECTED 0/9, TESTED E2E 0/9**, integration BLOCKED 8/9 and DISABLED 1/9. `client.mjs` is an **unpublished integration library** with enabled=false as default, not a deployed transport. For activation prerequisites, exact success evidence, stop conditions and rollback refer to [STAGING-RUNBOOK.md](./STAGING-RUNBOOK.md). Never represent CI mock tests as remotely CONNECTED.

## Version IDs revalidated 2026-11-05 — Cloudflare GET only

This is a concrete, non-secret trace of latest deployed **version** and **deployment** IDs (100% allocation at read time). These are Cloudflare release identifiers, **not** verified GitHub commit SHAs for each Worker. Only the Brain exposes a `DEPLOY_SHA` setting, which must not be conflated with Cloudflare version ID.

| Existing Worker | Latest deployment ID | Latest version ID | Deployed? | Native Brain Service Binding? | Authenticated + receipt readback? | Remote E2E? | Integration state |
| --- | --- | --- | --- | --- | --- | --- | --- |
| archelaos-automation-bridge | `e9da0b1c-99b4-4861-9a94-119732448ff0` | `9445de37-5465-4927-be71-a546359c5b21` | yes | no | no | no | BLOCKED |
| archelaos-brain-staging | `6d557f57-0f35-4b60-a569-546ee38157d2` | `72d7d145-9ca1-4ad0-814b-afe52ac9da91` | yes | n/a (target) | no | no | DISABLED |
| archelaos-fundraising-preview | `484034ba-370a-416b-9b84-3f5c0a3df2e0` | `2c4eaadb-3b45-42b2-9442-92d69b21ff93` | yes | no | no | no | BLOCKED |
| archelaos-gitlab-controller | `05998ad4-f39f-4c89-9765-271c70736821` | `53938cc8-0c8b-4956-8df2-934721711c53` | yes | no | no | no | BLOCKED |
| archelaos-gitlab-guardian | `7ef87492-74d5-4851-b353-5d11480e9f63` | `2c37f688-4aee-44d1-b829-4dcb33a84c2f` | yes | no | no | no | BLOCKED |
| archelaos-librarian-staging | `5e2dfa21-5f87-4308-83ea-4df84279f8f4` | `d291424c-05fd-42df-b5b3-0891339ef658` | yes | no | no | no | BLOCKED |
| archelaos-raisely-bridge | `5014a39c-b019-435b-83b4-c7e47f248711` | `c13362d5-14b2-4ea5-9da4-586d95318ce9` | yes | no | no | no | BLOCKED |
| archelaos-self-heal | `f768d2e8-306c-4012-b511-4cb8ce50a1da` | `fb8c26ae-f3df-46a2-8e8c-073b24785c27` | yes | no | no | no | BLOCKED |
| archelaos-workflow-pilot | `3ebd856d-b9e2-4b48-b3d6-424af7c007f8` | `6cacf77c-3894-4f47-96cb-90d981936b69` | yes | no | no | no | BLOCKED |

Current account ID `898359728b3dfe8c3a3f56e3d19eecd1`; zone ID `393d05924628b794e8345e36eab41857`. Four DO namespaces, zero standalone D1 databases, zero Worker routes/domains and zero active cron schedules were independently confirmed. The Brain's own `BRAIN` Durable Object binding is **not** a Service Binding to another Worker. Named secrets were inspected as metadata only; no plaintext credential was retrieved.

**New critical dependency:** current Brain `staging-v1` authentication resolves to `staging` and `validateEvent` rejects `drive`/`gmail`/`news` source identities. See #219 handoff and the additional scoped contract regression test. No staging replay/log evidence exists yet; do not infer authentication or E2E from local mocks.
