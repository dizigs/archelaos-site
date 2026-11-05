# Existing Cloudflare Workers -> existing Brain (review-only)

Owner: isolated automation/cloudflare-brain-integration/** only. This PR introduces a library and tests, **not** a new Worker, a route, a trigger, a deployment, a shared dispatcher or a live integration. The existing Brain is in brain/ (merged PR #111, main bddc3defd78c3a2bd18c7772d4bcc97092cfb5be). Never represent this as deployed E2E.

## Usage and trust contract

Import createBrainWorkerAdapter from ./client.mjs. Supply the **existing** Cloudflare service binding to archelaos-brain-staging (not an HTTP URL), an approved staging intake secret, workerName, sourceType, a trusted provenance verifier and a durable audit sink. The constructor is disabled by default and requires explicitly enabled=true before source submission. Only source types and event types accepted by the current canonical Brain contract are supported. It does not create hashes, identities, trigger rules or source events.

The adapter signs METHOD + newline + PATH + newline + seconds + newline + raw JSON with HMAC-SHA256; headers match brain/src/contract.mjs. POST /v1/events requires proven source revision and blob hash, confirms durable 200/202 receipt + matching eventId and correlationId, and writes an audit record. Malformed or mismatched successful acknowledgements are audited as **UNKNOWN**, never blindly retried. Canonical WAITING_REVIEW is an accepted state. Authenticated GET /v1/tasks/{uuid} checks readback and requires expectedCorrelationId so every readback is matched to its original event. GET /healthz verifies staging service identity and optionally pins expectedBrainCommit, but **never** asserts readiness, entitlement or E2E. Upstream timeout/unknown outcome is audited as UNKNOWN and not retried automatically, since the Brain may already have persisted the event. Preserve event IDs on manual reconciliation.

The approved source-worker adapters are limited to:
- archelaos-automation-bridge: Drive source.file.created/updated and Gmail source.message.received;
- archelaos-librarian-staging: Drive source.file.created/updated and News news.search.completed.

The source allowlist is an interface preparation, not proof of authoritative provenance. verifyProvenance must validate a genuine external source receipt/revision and return a matching attestation, never a permissive stub. auditSink must durably commit minimal metadata before it returns true; failures block reporting success. No external document text, private URLs or secrets may be logged. Cloudflare service binding plus shared staging HMAC does not prove **distinct per-worker cryptographic identities**. Per-worker identities and scoped keys need a separate Brain-owner review for multitenant production use.

## Tests

From repo root:

    node --check automation/cloudflare-brain-integration/client.mjs
    node --test automation/cloudflare-brain-integration/client.test.mjs

Earlier PR iteration: **14/14 local Node 22 mock tests reportedly passed**. The revised source now contains **18 authored tests**, including four new cases for malformed-success UNKNOWN auditing, WAITING_REVIEW, correlation-bound readback and pinned staging health. The revised suite has not yet been independently executed locally in this session; check exact-head GitHub CI separately. These are synthetic tests, never remote staging E2E. Cross-folder import is read-only from brain/src/contract.mjs; no changes to the canonical Brain.

## Required handoffs before activation

1. Existing Brain staging currently expires in 1970 and its actual Cloudflare settings do not contain STAGING_INTAKE_KEY or STAGING_OPERATOR_KEY. Brain owner must approve a bounded staging-only enablement and source-scope/key review. No secret values belong in a PR.
2. All nine deployed Workers have zero service bindings. Source-Worker owner must separately create reviewed bindings to the existing Brain; this PR changes no deployed settings.
3. Librarian import/probe toggles are all false; original receipts and source scopes must be verified by its owner, not inferred from deployment.
4. Fundraising, Raisely, GitLab, Self-Heal and Workflow require separate Brain-owned event/intent contracts. Never mislabel GitLab CI as GitHub CI to force admission. Separate owner PR #213 provides a review-only Self-Heal route.
5. Staging E2E requires a real event, audited HMAC delivery, durable Brain receipt/readback and actual Cloudflare logs, with release approval and rollback readiness. Neither local mocks nor a deployment listing meets this gate.
6. Other PR-owned scopes (not modified): #209, #213, #212, #211, #214, #201, #196, #194, #131, #132.

See INVENTORY.md for the real 2026-11-05 account evidence and status of all nine Workers.

## Read-only evidence refreshed 2026-11-05

Requeried all 9 existing Worker settings, deployment records, secret-binding **names/types only**, cron registrations, script subdomains, `archelaos.club` routes, custom Worker domains, account DO namespaces and D1 listing. All nine remain DEPLOYED; **0 service bindings, 0 cron, 0 custom Worker domains/routes, 0 D1 databases**. Four DO namespaces are registered. The Brain staging `DEPLOY_SHA` is `d3d13b605f409bfda6f372742d629fd8eaf12145`, but staging is expired since 1970 and its required intake/operator secret binding names are missing. Workers account settings show the `standard` default usage model; the subscription endpoint denied access with 403, so Workers Paid billing entitlement cannot be claimed independently. No Workers AI model call occurred.

The deployed Brain staging GitHub commit is **diverged** from the current `main` (GitHub compare: 21 ahead, 24 behind), so it must also be release-aligned before activation; merely changing `STAGING_EXPIRES_AT` is insufficient.

Before any enablement the separate Brain and source owners must approve scope, identity, bindings, time-limited staging activation, authoritative provenance, and auditable rollback. See [staging runbook](./STAGING-RUNBOOK.md) and [per-worker evidence](./INVENTORY.md). **No Cloudflare settings have been changed, and no real integration is connected or E2E tested.**
