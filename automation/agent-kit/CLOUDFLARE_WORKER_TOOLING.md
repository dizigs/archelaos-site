# ARCHELAOS — Worker tooling by proof gate (07/11/2026)

**Purpose:** practical commands and install decisions grounded in the actual repository.
This file is public-safe, source-only documentation. **No Worker, secret, route,
MCP OAuth, deployment, merge or paid AI call is activated here.**

## Verified source inventory (main at the time of inspection)

| Fact | Direct source |
|---|---|
| Brain: `brain/wrangler.toml` (not .jsonc) | `name=archelaos-brain-staging`; `workers_dev=false`; `preview_urls=false` |
| Self-Heal: `automation/self-heal-worker/wrangler.toml` | `name=archelaos-self-heal`; `workers_dev=false`; `preview_urls=false` |
| Pinned Wrangler | `brain/package.json` declares `4.157.0`; `brain/package-lock.json` exists |
| Actual implementation | JavaScript `.mjs` with `WorkerEntrypoint` and Durable Objects, not TypeScript |
| RPC bindings declared | Brain `HEALER`, Self-Heal `BRAIN_RECOVERY` to `BrainRecoveryPort` |
| SQLite Durable Objects | `BrainCoordinator` and `HealerMemory` in `new_sqlite_classes` migrations |
| Existing observability | `[observability.logs] enabled=true` on both; Brain sampling 1.0, Self-Heal 0.1 |
| Safety at source | Brain recovery/dispatch/durable-ACK flags `false`; Self-Heal ACK `false`; staging expiry at 1970 |

Use `node automation/agent-kit/worker-gates.mjs` **from repository root**
for offline inspection. This checks the safety-of-config snapshot only, not
actual Cloudflare state. For live versions and proof use approved Cloudflare
read-only access to the **correct account** with exact resource ID and timestamp.

## Stage 01 — CODE_READY

**Already installed in repository:** Wrangler 4.157.0, existing syntax/ESLint/
CodeQL and native Node tests. Do not add a second global Wrangler installation
or a duplicate linter just because another report recommended one.

Optional local RPC type inspection after installing the existing locked
`brain/` dependencies on a trusted development machine:

```sh
cd brain
./node_modules/.bin/wrangler types -c wrangler.toml -c ../automation/self-heal-worker/wrangler.toml
```

The output describes bindings and may create a generated type file, but the
existing JavaScript methods do not magically acquire TypeScript compiler
verification. A dedicated typed interface migration would need separate scope
and tests. Use CodeQL/ESLint and existing exact-envelope validators first;
do NOT add `Zod` or `oxlint` without a proven validation gap.

## Stage 02 — CI_PASS

Existing native tests and GitHub CI are first-line checks. Introduce
`@cloudflare/vitest-pool-workers` (or the currently recommended official
Workers Vitest integration) only in a **separate reviewed testing PR** when
real `workerd` DO-alarm/restart/RPC behavior cannot be proven with the current
tests. The `runInDurableObject` and `runDurableObjectAlarm` helpers can be
valuable, but a successful unit test does not prove a live Worker is deployed.
When instrumenting coverage, use Istanbul instead of assuming native V8
coverage is supported by the Workers Vitest plugin.

The pinned Wrangler version supports Local Explorer. On a **trusted local
checkout only**, with safe test fixtures and no production bindings, the
multi-config development command can be:

```sh
cd brain
./node_modules/.bin/wrangler dev -c wrangler.toml -c ../automation/self-heal-worker/wrangler.toml
```

Visit `http://localhost:8787/cdn-cgi/local/explorer` only once a local server
is running. Local Explorer can **edit local storage** and invoke test flows:
use `SELECT` queries for inspection, do not substitute a real production
DO ID, and do not bind real recovery/AI accounts to experimental code.
The local REST API is `/cdn-cgi/local/explorer/api`; it is NOT a protected
remote control-plane endpoint to publish on the internet.

## Stage 03 — DEPLOYED

Keep deployments OFF until the existing Brain/Self-Heal independent security
acceptance and staging approval. A successful CI workflow, Wrangler config,
service binding name, or prepared secret name does NOT prove DEPLOYED.
Use the existing Cloudflare account's actual deployed version/commit proof.

`secrets.required` is useful, but changing it changes the deploy gate; first
inventory the precise **existing binding names**, environment and ownership.
Do not commit values, output secrets in logs, or run `wrangler secret put`
without explicit stage approval (it may deploy immediately). Local
`.dev.vars.<env>` must be excluded from Git and have environment isolation.

`wrangler preview base-config secret put` is not a harmless audit command:
it copies keys to **new** previews. Do not execute until the owner approves
that scope and the isolation policy.

## Stage 04 — CONNECTED

The declared `HEALER` and `BRAIN_RECOVERY` service bindings are source
configuration only. Multi-config local `wrangler dev` is a useful smoke
test, but only a real service-to-service request with exact version/identity,
a verified response and trusted logs can establish CONNECTED.

Cloudflare Access Service Auth should protect any separately authorized
staging URL when one actually exists; here `workers_dev=false` and
`preview_urls=false` were observed in source, so no new public hostname is
needed for this work. Playwright/Browser Run may test public site quality
separately; a `debugId` is correlation metadata, not authentication.

## Stage 05 — AUTHENTICATED

The remaining gate is an independently verified, private HMAC challenge and
durable ACK readback: exact SHA, key ID, nonce and expiry, authenticated
service binding, storage persistence after restart, and fail-closed
`UNKNOWN` handling without retrying unsafe recovery. Nothing in this
Agent Kit requests that authorization.

Use existing Workers Observability / Logs, read-only provider log queries and
approved readback before adding Tail Workers, Sentry or new event pipelines.
Production logs may contain personal or sensitive security information.
Cloudflare Durable Objects Data Studio is powerful and may allow **writes**;
grant least-privilege inspector roles where supported and use `SELECT`
only. Do not automatically change Head Sampling Rate to 1 for all
environments; it can increase exposure/volume.

## Cross-tool MCP state

The PR's project file `.agents/mcp_config.json` is **not a local installation**.
It declares GitHub read-only + public Cloudflare docs (configured, OAuth/runtime
unverified), while Cloudflare account API and Firecrawl dedicated search MCP
remain DISABLED. Firecrawl's dedicated `/v2/mcp-search` endpoint requires
its own OAuth audience for authenticated calls; this is **different** from
Firecrawl's keyless limited full `/v2/mcp` offering. Do not infer cost-free
or authenticated search-only operation from a URL.

Existing ChatGPT GitHub and Cloudflare connectors are different credentials
and have been read-tested independently; do not duplicate their scopes in
Antigravity without approval.

## Decision rule

Keep the layers separate:

`CODE_READY` → reviewed source; `CI_PASS` → exact-head CI log;
`DEPLOYED` → Cloudflare deployed version evidence; `CONNECTED` →
real binding request/response; `AUTHENTICATED` → signed challenge, durable
storage and independent readback. Missing proof means `UNKNOWN`.

The shared AI budget stays capped at €20/month. Local source inspection,
offline tests and repo documentation do not incur AI-provider calls.

Official technical references:
- https://developers.cloudflare.com/workers/runtime-apis/rpc/typescript/
- https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/
- https://developers.cloudflare.com/workers/local-development/local-explorer/
- https://developers.cloudflare.com/workers/configuration/secrets/
- https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/
- https://github.com/firecrawl/firecrawl-mcp-server/blob/main/docs/search-profile.md
