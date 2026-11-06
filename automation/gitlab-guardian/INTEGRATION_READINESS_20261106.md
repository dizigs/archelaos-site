# Existing GitLab Guardian — code-only readiness and private Brain handoff (2026-11-06)

**Status: GUARDIAN CODE-READY / RUNTIME-BLOCKED. No merge, cron, production activation or secret changes.**
Repository: `dizigs/archelaos-site`; existing draft PR [#131](https://github.com/dizigs/archelaos-site/pull/131); existing Cloudflare Worker `archelaos-gitlab-guardian`; file ownership **`automation/gitlab-guardian/**` only**.
This is **not** a generic Site Guardian. The separate `archelaos-gitlab-controller` owns optional GitLab issue writes and is out of scope. Do not create a second Guardian.

## Read-only live inventory, 2026-11-06

- The Cloudflare account containing the Archelaos Workers reports nine scripts. Guardian latest deployment: `7ef87492-74d5-4851-b353-5d11480e9f63` from 2026-11-04 08:50:14 UTC, 100% version `2c37f688-4aee-44d1-b829-4dcb33a84c2f`. This proves uploaded/deployed version, **not** runtime success, code SHA alignment or live monitoring.
- Guardian settings contain **exactly two secret_text bindings** by name: `GITLAB_READ_TOKEN` and `GUARDIAN_CHECK_KEY`. Values/validity were not inspected. There are **zero native Service Bindings and zero registered cron schedules**. workers.dev subdomain setting is enabled; /health and /check have not been freshly authenticated end-to-end through the public ingress during this audit.
- Brain staging has a Durable Object binding `BRAIN`, no secret metadata and no Guardian Service Binding. Self-Heal has a `HEALER_MEMORY` Durable Object binding, not a Guardian link. Neither runtime integration is proven.
- GitLab project **88488684** is a private GitHub pull mirror. At the audit snapshot, GitLab and GitHub `main` both pointed to `746ea65abaca5cff6c5cbe90bb4d0c65ccfbec92`. This is independent connector readback, **not a successful authenticated Guardian /check**. The GitLab project pipeline list returned zero in the requested sample.
- Canonical Brain #234 and Security/Self-Heal #235 were observed **MERGED**. Cloudflare #233 was observed **CLOSED / NOT MERGED**; do not infer Service Binding readiness from a code-only handoff. #131 is **OPEN / DRAFT**, divergent and hundreds of commits behind main; the Release Captain must reconcile its mixed-scope history without force-push or modifying other owners' files.

## Existing monitoring systems to **reuse**, not duplicate

- **GitHub Live Site Guard**: `.github/workflows/live-site-guard.yml` defines a six-hour UTC schedule (`17 */6 * * *`), validates the public website with Playwright, and maintains a GitHub incident issue upon failure. This is site QA, **not** the GitLab Guardian. The workflow's scheduled presence in source is not proof of its latest run outcome.
- **GitHub automation-health**: `.github/workflows/automation-health.yml` defines independent six-hour schedule evidence (`11 */6 * * *`), checks stale/missing workflow runs and publishes a report. It must remain the schedule observer; do not add competing Guardian polling for it.
- **UptimeRobot**: existing `automation/uptimerobot/monitor-bridge.mjs` is an operator-scoped adapter for public-site monitor inventory. It is not a GitLab source and its API/alerts are not silently imported into the Guardian.
- **Existing self-heal observation**: `tools/self_heal_monitor.py` and the deployed `archelaos-self-heal` Worker already have distinct evidence and recovery boundaries. The Guardian only reports GitLab mirror signals, never selects a patch or repair.
- **Cloudflare runtime inventory**: exactly nine scripts were re-read, with **zero registered Worker crons**, **zero Service Bindings**, **zero Worker custom domains/routes** for archelaos.club. These counts concern Cloudflare Workers, not GitHub Actions schedules. Brain staging still advertises `STAGING_EXPIRES_AT=1970-01-01T00:00:00Z` and `DEPLOY_SHA=d3d13b605f409bfda6f372742d629fd8eaf12145`; it is not a usable accepted staging target.

## What the Guardian currently implements

`GET /health` is only **process/liveness** information, not GitLab health. Authenticated `GET /check` reads exactly three fixed upstream GET URLs for GitLab mirror configuration, GitLab main branch and GitHub main commit; it computes mirror-state codes and HEAD mismatch/staleness. Its `scheduled()` exists in source, but no cron is registered.

Existing and strengthened safety: no caller-provided URL, GET-only, strict secret-backed check authorization, 8-second upstream abort, 120,000-byte streaming response cap, unknown provider statuses rejected as alerts, malformed source flags refused, **configured mirror URL pinned to the exact canonical GitHub repository**, unknown branch filtering rejected, missing success history and upstream failure reported **UNKNOWN**, future mirror timestamp alert, provider errors scrubbed, and bounded operational console logs without GitLab SHAs or raw error bodies. Missing/invalid API data or auth must not become an OK status.

Local exact-source validation: `node --check src/index.mjs`; `node --test test/guardian.test.mjs`. **18/18 tests PASS on Node.js 22** for the updated source/test blobs, including unknown status, invalid safety flags, oversized multibyte body, bad schemas, unauthorised check, missing GitLab token, fixed upstream URLs, and duplicate deterministic observation; additionally origin spoofing/misconfiguration, restricted branch-filter coverage, missing mirror success, and scrubbed provider failure. Controller's separate issue-only source now rejects incomplete paginated duplicate searches (**19/19 exact-source Node tests**); no GitLab issue was created. Local PASS does not prove provider credentials, hosting or current exact-HEAD GitHub CI.

## Explicitly out of scope (requires separate contracts)

| Desired signal | Guardian state | Required owner/contract |
| --- | --- | --- |
| GitHub ↔ GitLab mirror HEAD / mirror safety | Implemented read-only | Current Guardian only; live authenticated /check still unproven |
| GitHub CI failures, check-run attempts and unresolved reviews | **Not implemented here** | GitHub source owner, authoritative run+attempt+SHA evidence, approved Brain `github-v1` contract |
| Cross-Worker health, logs, cron state or incidents | **Not implemented here** | Cloudflare/observability source owner, consent/identity, fixed allowlist and private Service Binding contract |
| Repeating incident history and deduplication | **No Guardian database or scheduler** | Existing canonical Brain SQLite ledger and stable evidence-based `dedupeKey` after a source contract is approved |
| Guardian → Canonical Brain | **Blocked** | Brain owner must approve a distinct `gitlab` source identity/event allowlist before any delivery |
| Brain → Self-Heal recovery | **Blocked** | Security/Self-Heal owner and release captain approve signed recovery intents and real CI provenance |
| Guardian → private Control Center | **Blocked** | Center reads Brain verified receipts/health, not unchecked direct Guardian output |

The canonical Brain private source contract, `brain/docs/PRIVATE_SOURCE_CONTRACT_20261106.md`, currently whitelists `drive`, `gmail`, `news`, `site` and `github` (plus separate analytics/apps-script capabilities) — **not `gitlab` or a Guardian event**. Do not reuse `github-v1`, mislabel `github.ci.failed`, bypass its allowlist, or grant the Guardian an operator key. Until an approved `gitlab-v1` or equivalent source-scoped contract exists, the Guardian must **not** POST to Brain. No inactive fake adapter is described as connected.

## Future connection order — separate owners, OFF until proven

1. Release Captain resolves #131's large merge-base gap and mixed Controller/workflow diff, checks no active file owner conflicts and exact final SHA, required CI, CodeQL, SonarCloud and reviews; no merge just because Guardian's unit tests are green.
2. Brain owner approves a **separate least-privilege GitLab event type and identity**, bounded metadata schema, source-scoped intake HMAC, audience, 5-minute timestamp/replay tolerance, immutable `dedupeKey` and readback receipts. Preserve fixed source identity, no user URLs or PII, and keep AI paused. Do not extend the GitHub source principal to GitLab.
3. Cloudflare owner alone validates current, unexpired, exact-SHA Brain staging and establishes a **private native Worker Service Binding** under the approved name, key metadata and non-public ingress. Never enable arbitrary HTTP calls to operator/admin paths.
4. Security/Brain owners independently verify Guardian input provenance: actual GitLab pull-mirror permissions, read-only token scope, GitHub exact-SHA readback and status freshness. Prove signed authenticated event ACK and immutable, source-scoped signed readback after restart using a single authorised staging test; an ACK by itself is not proof.
5. Reconcile `UNKNOWN`, timeout, transport loss and duplicate evidence by signed readback before any bounded retry. Brain retains only one durable ledger, kill switches, source isolation and the 20 EUR/month AI limit; no Guardian credential can trigger Self-Heal. Recovery remains review-only until separately authorized failure evidence, attempt limits, locks, rollback and safe chain halt are tested.
6. Only then enable the minimum approved polling/trigger on the **existing** Worker, measure cost/noise, and expose *Brain-verified* state to the private Control Center. Disable immediately on provenance, freshness, secret or receipt failures.

**Never** create another Worker, coordinator, scheduler or durable ledger; never install secrets, register crons, turn on Service Bindings, run AI, modify source code, create GitLab tickets or deploy from the Guardian as part of this code-only preparation.
