# Archelaos Self-Heal Worker — isolated, private healer

**Status: IMPLEMENTATION IN A SEPARATE PR; NOT DEPLOYED, NOT CONNECTED.**

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
