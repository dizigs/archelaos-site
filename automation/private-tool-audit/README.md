# Private Tool Audit — HMAC receipts and SQLite Durable Object contract

**SOURCE ONLY / NO LIVE ENDPOINT / NO DEPLOYMENT / NO MCP INSTALL / NO PAID AI CALL.**

This is a separate, inert implementation proposal for the existing
Archelaos Canonical Brain / tool coordination work (issues #71 and #108).
It deliberately does NOT edit Brain, Self-Heal, existing Cloudflare Worker
wrangler configs, Google Apps Script, scheduled tasks or GitHub release paths.
The existing [Agent Kit draft PR #280](https://github.com/dizigs/archelaos-site/pull/280)
contains a public-safe catalog and manual local log. This module adds
a future PRIVATE, durable and authenticated remote receipt contract.

## Intended topology (not active)

1. Existing trusted agent or GitHub workflow generates one minimal signed
   receipt after an actual operation (not a plan). It records only approved
   tool/command IDs, outcome, stable task ID, optional public GitHub evidence
   URL and optional exact commit SHA. Never raw prompts, logs, tokens, PII or
   private Google Drive links.
2. Existing authenticated Brain-controlled private service boundary uses
   an HMAC signer ID and a secret held in an existing trusted secret store.
   The signed envelope includes a unique v4 UUID nonce and issuedAt.
3. A reviewed service-bound Durable Object is the only persistence writer.
   No direct public HTTP, unauthenticated MCP or direct tool-to-DO binding.
4. The source-only receiver verifies HMAC, source allowlist, 5-minute clock
   window, exact fields, evidence host, command allowlist, per-source quotas,
   unique nonce and idempotency in one synchronous SQLite transaction.
5. A separately authenticated Admin/Brain reader may call listAuthorized.
   It is a storage method, **not** itself a read-authorization mechanism.
6. A future Control Center can display concise, private receipts and use
   this evidence for analysis without revealing credentials.

## Source

- receiver.mjs: exact-schema HMAC verification, atomic SQLite store, bounded
  authorized read query, replay/rate/idempotency protections.
- receiver.test.mjs: REAL SQLite in-memory transactions via Node's
  node:sqlite, including injected mid-transaction rollback.
- No Worker entrypoint, Service Binding, Durable Object class, migrations,
  secret names or live API routes are installed.

## Local checks

    node --check automation/private-tool-audit/receiver.mjs
    node --check automation/private-tool-audit/receiver.test.mjs
    node --test automation/private-tool-audit/receiver.test.mjs

## Limits and security gates before live work

- The code uses node:crypto; confirm the EXISTING Worker compatibility
  date and nodejs_compat support separately before any integration.
- SQLite transactionSync and SQL bindings are mandatory. An in-memory Map
  or KV is not an equivalent durable source of truth.
- A successful offline test is NOT proof of a real Cloudflare DO deployment
  or signed service-to-service exchange. Existing Brain/Self-Heal lifecycle
  gates remain unchanged.
- The receipts contain a server-side SHA-256 predecessor chain, but a database
  administrator could rewrite the entire chain. Independent time-stamped
  hash anchoring, retention, backup/recovery and immutable evidence storage
  require separate design and approval.
- No untrusted request may construct the secrets map, command allowlist,
  Admin reader or server clock. Do not export listAuthorized through HTTP.
- Stable event ID collisions with changed signed content fail closed.
  Duplicate event ID with a NEW valid nonce returns the original receipt;
  the exact original nonce is rejected as a replay.
- Missing/invalid HMAC, rate limit, storage errors and capacity overflow
  never generate a fake PASS or silently release a budget reservation.
- Privacy/legal review and source scoping are required before registering
  private Google, email or child-related events; IDs must never encode PII.
- This only logs operations explicitly forwarded by trusted agents after
  their execution. It cannot automatically observe every ChatGPT plugin,
  Antigravity session, mobile device or external API without integration.
- Keep local Agent Kit + private Google access registry and LIVE Sheet logs
  as existing historical sources; do not overwrite or duplicate them.
- Establish exact deployment SHA, source/secret authority, disaster recovery,
  private auth, cost budget, staging E2E, tests, review and rollback before
  enabling any service.

## Current state

CODE_PREPARED; CI_PENDING until specific exact-head runs prove PASS.
NO_CLOUDFLARE_DEPLOY, NO_REMOTE_LOG_SYNC, NO_AUTOMERGE.

References:
- https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
- https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/
