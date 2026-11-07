# ΑΡΧΕΛΑΟΣ — Private Tool Registry → Cloudflare Workers

**Status: STAGED / NOT LIVE (2026-11-04).** Canonical source is the private Google Doc owned by admin@archelaos.club: https://docs.google.com/document/d/1b0yXDHUmS2kt5_18ppcILX-lcWSvmV4FwwqpCn9LEeU/edit

## Purpose

`reader.mjs` reads only the machine-readable catalog between `ARCHELAOS_WORKER_REGISTRY_V1_BEGIN` and `ARCHELAOS_WORKER_REGISTRY_V1_END` in the same private Doc. It strictly validates the feed, returns only metadata and deliberately excludes the rest of the private document.

`rpc-entrypoint.mjs` defines a **named Cloudflare WorkerEntrypoint** for the EXISTING `archelaos-automation-bridge`. Other Workers may call its `getCatalog()` only after an explicitly configured Service Binding. There is NO public endpoint, no extra Worker, no cron and no new paid service in this PR.

The catalog is **NOT AUTHORIZATION**. A label such as `admin_verified` records a past provider observation, NOT a permission or credential for a Worker. Every actual provider action must independently verify current scopes, account and task authorization. No private keys, OAuth tokens, passwords, user emails or unrestricted document text may be exposed through RPC.

## Operator setup — pending, no secrets in GitHub/chat

1. Enable Google Docs API in a suitable Google Cloud project administered by `admin@archelaos.club`. Create a dedicated service account for **read-only registry access** and disable domain-wide delegation. If verified keyless Workload Identity Federation is available, prefer it; the staged reader currently supports only PKCS8 service-account credentials.
2. Grant that account **Viewer** on this ONE private Google Doc (share to its `...iam.gserviceaccount.com` address). Keep existing private sharing intact; never enable “anyone with link” or broad domain access.
3. On the EXISTING Worker, add encrypted `REGISTRY_GOOGLE_SERVICE_ACCOUNT` (JSON containing `client_email` and `private_key`) and `REGISTRY_DOCUMENT_ID`. Use Cloudflare secrets, never a public variable or source file. Do not reveal secret values via audit/logs.
4. Coordinate with Worker/Apps Script and brain teams via [Issue #71](https://github.com/dizigs/archelaos-site/issues/71) before importing/exporting `ToolRegistryEntrypoint` in the existing Worker bundle. Preserve all existing routes, Durable Objects, migrations, credentials, and version rollback. Do not deploy automatically just because this PR has been merged.
5. Configure each explicitly authorized consumer Worker with Cloudflare Service Binding: `binding=TOOL_REGISTRY`, `service=archelaos-automation-bridge`, `entrypoint=ToolRegistryEntrypoint`. Then call `await env.TOOL_REGISTRY.getCatalog()` from private server-side code. Never proxy the raw catalog from unauthenticated HTTP.
6. Verify a genuine Worker-to-Worker RPC call; observe expected catalog count and version, no full private document, missing credential rejection, and revoked/disabled entry reflected on next read. Audit the exact Cloudflare deployment/version and any blockers. Do not claim production readiness without provider evidence.

## Feed maintenance and update semantics

The Google Doc includes the exact typed JSON feed. Schema: `{schema_version:1, updated_at:"YYYY-MM-DD", tools:[{id,name,family,state,access,use_when}]}`. Each addition/removal/permission change must update both this feed and the document's changelog. A removed tool stays in the feed with `state:"disabled",access:"none"` for historical audit; separately revoke its actual grant at the provider.

The reader fetches the **current Doc on each RPC call**, caching only the OAuth access token while valid. No schedule is needed. Updates are visible at the next successful request; there is not a universal event listener for edits in private ChatGPT conversations. Missing, duplicated, malformed or sensitive entries cause an error (fail closed) rather than falling back to stale authority.

## Checks and current limits

Run: `node --test automation/tool-registry/tests/reader.test.mjs`. No npm dependencies. Tested offline for strict schema, duplicate IDs, tampered input, JWT signature, missing credentials, and credential leakage.

2026-11-04 evidence: Cloudflare lists the existing bridge and its Google OAuth secrets, **but those do not authorize reading this Google Doc**. Google Drive metadata reported the Doc owner-only. Actual Google Docs service-account grant, live API token exchange, production Worker import/deployment and consumer Service Bindings are **NOT DONE**. Requires operator-supplied identity and reviewed integration, no shortcuts.

No direct main pushes, no changes to active PRs #111/#124/#136, and no quality gate bypass.
