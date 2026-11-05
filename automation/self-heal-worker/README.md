# Archelaos Self-Heal Worker — isolated, private healer

**Status (2026-11-05): Cloudflare reports an existing deployment (2026-11-04); this recovery upgrade is DRAFT CODE ONLY, NOT DEPLOYED OR CONNECTED TO BRAIN.**

This package prepares a dedicated `archelaos-self-heal` Cloudflare Worker with its own
SQLite-backed Durable Object. It keeps diagnostic state separate from the existing
`archelaos-automation-bridge` and Codex-owned brain [PR #111](https://github.com/dizigs/archelaos-site/pull/111).

## What this actually implements

- **Private Worker RPC only**: the default entrypoint rejects HTTP with 404; the
  `wrangler.toml` declares no `workers.dev`, preview URLs, custom routes, cron or
  outbound network connection. Only an explicitly authorized **Service binding**
  from another Worker can call `observe`, `diagnose`, or `status`.
- **Durable SQL**: one SQLite-backed `HealerMemory` Durable Object with
  `incidents`, `observations` and `reviewed_recipes`. Same incident +
  repeated evidence is deduplicated by stable SHA-256. New independent evidence
  increments observation count, not incident count. Fixed caps of **1,000
  incidents** and **10,000 observations** prevent unbounded growth.
- **Initially reviewed knowledge**: three inert references reflecting the
  reviewed `docs/self-heal/error-solution-catalog.json` (2026-11-03):
  `ARCH-HTML-ESCAPES-001`, `ARCH-LIVE-HEALTH-UNKNOWN-001`, and
  `ARCH-SONAR-SECURITY-C-001`. No recipe stores executable commands or grants
  automatic repair authority.
- **Strict metadata-only intake**: only `dizigs/archelaos-site`, fixed error
  codes, approved resource paths, 40-character source SHA, UTC timestamp and
  `actions:<run-id>` / `pages:<deployment-uuid>` evidence ID. Refuses
  raw logs, secrets, arbitrary URLs, pasted instructions and unknown keys.
- **Fail-closed decisions**: all diagnoses carry
  `INPUT_METADATA_UNVERIFIED` and `autoRepairAllowed: false`. Even the
  isolated fixture-tested HTML recipe means **reviewed draft PR only**, never
  automatic merge, deployment or rollback.

## How the healer will be triggered — without another scheduler

The existing `.github/workflows/site-watch-and-repair.yml` remains the **single**
hourly site monitor (`17 * * * *`). GitHub Actions failures, Cloudflare
deployment evidence and future site-health events should be validated by the
existing trusted central controller, normalized to the schema below and sent via
a private Cloudflare **Service binding**. This Worker does **not** independently
poll websites or wake itself every minute. When no events arrive, it consumes
no ongoing CPU. **Until the binding/producer is deployed and authenticated, the
new Worker will receive no events.**

Future connector configuration, once the brain owner approves the exact trust
contract, in the **calling** Worker (not inside this package):

```toml
[[services]]
binding = "HEALER"
service = "archelaos-self-heal"
```

```js
// Only after the caller independently checks the actual repository, run ID,
// source SHA, deployment evidence and authorization against trusted providers:
await env.HEALER.observe({
  schemaVersion: 1,
  source: 'site_watch',
  repository: 'dizigs/archelaos-site',
  code: 'HTML_ESCAPED_TEXT',
  resource: '/news.html',
  commit: '<verified-40-character-main-sha>',
  observedAt: '<verified-utc-timestamp>',
  evidenceId: 'actions:<verified-run-id>'
});
```

**Important**: well-shaped metadata is *not* authenticity proof. The caller
must verify the actual provider evidence and current-main SHA. A Worker binding
does not grant raw GitHub issue access, original data provenance or write rights
automatically. The existing append-only, trusted GitHub Issues incident ledger
remains authoritative for attempts, cooldowns, permissions, Draft PRs and
production resolution. The SQLite record is currently a restricted mirror.

## Source ownership and rollout gates

1. **Own PR**: this package touches only `automation/self-heal-worker/**`
   and its single path-filtered, read-only CI workflow. No edits to #111, #115
   or #116 owned files. No second scheduler, paid service, token or runtime action.
2. **Tests first**: `node --experimental-sqlite --test automation/self-heal-worker/test/*.test.mjs`.
   CI checks syntax, SQLite dedupe, evidence scoping, reviewed recipe immutability,
   `workers_dev=false`, no cron/public route or outbound fetch. A successful
   offline test is **not** a Cloudflare deployment proof.
3. **Staging proof**: obtain the existing owner's approval for the service binding
   contract; run a credential-free Wrangler build using pinned dependencies; deploy
   the private Worker under its own name with the new SQLite migration only after
   checking the Cloudflare Free usage/limits and whether it touches any active
   namespace. Verify actual deployment ID, build logs, accessible *internal* RPC
   calls and replay idempotency. Do not create a public route.
4. **Event wiring**: separate scoped PR connects the trusted controller to this
   Worker's Service binding after #111 owner coordination. Test simulated
   failure -> verified source receipt -> persisted SQLite lookup -> duplicate
   suppression -> correct diagnosis. Keep the existing hourly monitor, incident
   cooldown, three-attempt cap, human merge gate and budget limit.
5. **Full knowledge index**: OSV/CVE/GHSA bulk archive and external documentation
   are **not imported** here. The current Python SQLite FTS5 index is local,
   not durable Cloudflare storage. A separate source-verified, capacity-bounded,
   licensed, incremental ingest design must be approved and proven before storing
   a larger index in this Worker. Do not put big archives in Git, run network
   bulk imports per incident, or give imported text repair authority.

Sources: `docs/self-heal/GLOBAL_KNOWLEDGE_FEDERATION.md`,
`docs/self-heal/ERROR_SOLUTION_PLAYBOOK.md`, `tools/self_heal_knowledge.py`,
[Cloudflare Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/),
[Cloudflare Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

## Implementation log

- 2026-11-04: identified existing hourly self-heal and reviews #115/#116.
  Began isolated Worker skeleton, private RPC entrypoint, Durable Object SQLite
  schema, strict finding parsing, seed of three vetted solutions and offline CI.
- **Pending**: exact-head hosted CI, independent Cloudflare deployment/readback,
  authenticated producer, live incident test, durable external knowledge import,
  and safety review of any actual PR publisher. These are not represented as done.

## Bounded recovery upgrade (draft, 2026-11-05)

Branch: `feat/self-heal-bounded-recovery-20261105`. Exclusive scope:
`automation/self-heal-worker/**`. This is an additive implementation, **not**
authorization to run self-modifying code, retry failed builds, merge, deploy or
bypass a protected branch. The initial worker and the Brain #111 were read first;
open evidence PRs #115 and #116 remain untouched. PR #213 owns the separate
Brain/executor integration port and must not be edited here.

- `src/recovery.mjs` persists per-commit incident state to a separate
  `recoveries` table in the existing private SQLite Durable Object; atomic claims
  and canonical evidence fingerprints reject concurrent or changed replays.
  Completed, unknown and circuit-open states never silently restart.
- Fixed severity: **P0** security findings; **P1** CI, public-site health and
  deployment unverified; **P2** the narrowly reviewed escaped HTML text case.
- **Required CI failure always halts the current chain**. With an independently
  verified Brain authorization, it can send only a review-only, zero-retry
  Builder task intent. No CI auto-rerun, provider charge or code write.
- **Transient public-site health:** one read-only, verified recheck per
  invocation, with durable 30-second and 120-second delays. Third transient
  outcome opens the circuit. A later trusted Brain delivery must trigger a due
  attempt; this module does not introduce a cron, alarm, busy loop or unverified
  automatic wake-up. A verified healthy recheck records `RECOVERED` (health
  observation only, *not* proof of a code fix).
- **Ambiguous request timeout** is `UNKNOWN`, locked pending operator
  reconciliation, never retried; security/deployment findings need a human.
- New private RPCs: `attemptRecovery(finding)` and `recoveryStatus()`.
  `attemptRecovery` validates the existing strict finding envelope and
  requires a separately approved private `BRAIN_RECOVERY` Service binding with
  RPCs `verifySelfHealReceipt`, `routeSelfHealReview`, and
  `recheckSelfHealHealth`. The first must independently read back its own
  durable evidence/authorization, enforce pause and verified exact SHA,
  and return the receipt described in `validateVerifiedReceipt`. The latter
  two must return independently verified results. The repository does **not**
  declare or configure that binding. Missing/incompatible binding blocks safely.
  The Brain team must review this contract; **do not create an unreviewed
  second Brain or forge a verified receipt.**
- Recovery state is stored inside the existing `HealerMemory` class, so there
  is no Worker/Durable Object migration, public API, schedule or extra Worker.
  All results carry `autoMergeAllowed: false`, `deployAllowed: false`.
- Local proof: `node --experimental-sqlite --test automation/self-heal-worker/test/*.test.mjs`
  and `node --check automation/self-heal-worker/src/recovery.mjs`. Actual PR
  hosted tests and precise-SHA checks must be inspected independently.

### Verified incident evidence, not assumed production root causes

GitHub Actions failures sampled from 2026-11-05:
- [42036245146](https://github.com/dizigs/archelaos-site/actions/runs/42036245146)
  and [42003377805](https://github.com/dizigs/archelaos-site/actions/runs/42003377805):
  Chromium installation failed with `Playwright does not support chromium on ubuntu26.04-x64`.
  Treat this as a repeatable runner/browser incompatibility, not a network retry.
- [42022399427](https://github.com/dizigs/archelaos-site/actions/runs/42022399427):
  failed validation on a missing biography sitemap URL; source fix and exact-SHA
  tests required, not blind CI reruns.
- [42037064619](https://github.com/dizigs/archelaos-site/actions/runs/42037064619):
  separate Apps Script synthetic E2E failure with
  `PROVIDER_INVENTORY_UNVERIFIED`; human/integration-owner reconciliation.
- Cloudflare read-only deployment inspection found an
  `archelaos-self-heal` deployment `f768d2e8-306c-4012-b511-4cb8ce50a1da`
  dated 2026-11-04 21:25 UTC and a newer Brain-staging deployment dated
  2026-11-05. Cloudflare observability issue listing returned zero issues;
  that does **not** prove zero errors. Service-binding connectivity, internal
  RPC function tests and live Brain receipts are **unverified**.

### Release gates and handoff

1. Exact-head CI and peer review of this PR; verify no conflicts with #115,
   #116 or the unmerged #213 integration adapter.
2. Independent Brain owner implements authenticated readback and reviewed
   `BRAIN_RECOVERY` Service binding, preserving its existing budget and task
   authorizations. **No caller-provided `verified: true` as authorization.**
3. Staging-only test: verified failed CI -> chain halt -> one approved
   review-only Builder intent -> independently verified receipt; transient
   health -> bounded backoff -> circuit on third attempt; unknown outcome ->
   human reconciliation. Test restart persistence and exact commit attribution.
4. No production deploy, auto-merge or required-check override in this PR.
