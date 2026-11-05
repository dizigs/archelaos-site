# PRIVATE CONNECTIVITY — audited read-only revalidation + owner handoff (2026-11-05)

**Scope:** automation/cloudflare-brain-integration/** only. Repository dizigs/archelaos-site. #224 merged. No live settings, secret, binding, route, cron, staging or production changes are authorized.

## Fresh Cloudflare evidence

Account with the nine workers: 898359728b3dfe8c3a3f56e3d19eecd1, archelaos.club zone 393d05924628b794e8345e36eab41857. Requeried each script's settings, latest deployments/versions, secret binding names/types, schedules, workers.dev flag and account domains; zone routes, Durable Object namespaces and D1 listing. No secret plaintext was accessed. Full nine-Worker latest deployment/version-ID table remains in [INVENTORY.md](./INVENTORY.md) and was unchanged on this fresh check.

**Result:** 9/9 DEPLOYED; **0/9 CONNECTED**, **0/9 remote E2E TESTED**. One DISABLED (Brain staging), eight BLOCKED. Zero type=service bindings, Worker routes, custom domains, cron schedules or D1 databases. Four DO namespaces (BrainCoordinator, MuseumScriptCoordinator, LibrarianLedger, HealerMemory); AI binding on Brain, KV on Automation Bridge, Workflow binding on Pilot. The Librarian's NEWS_IMPORT_ENABLED, ARCHIVE_IMPORT_ENABLED and DRIVE_LINK_PROBE_ENABLED flags remain false. Cloudflare version IDs must not be misreported as GitHub SHA identifiers for each worker.

Current repo main at inspection: c89823a21efc1fa9f979b17a6567337a498a1969.

## Critical staging blockers

Existing archelaos-brain-staging has DEPLOY_SHA d3d13b605f409bfda6f372742d629fd8eaf12145, ENVIRONMENT staging, and STAGING_EXPIRES_AT 1970-01-01T00:00:00Z. Existing BRAIN DO and AI bindings are present, but STAGING_INTAKE_KEY and STAGING_OPERATOR_KEY secret *binding names* are absent; workers.dev disabled. Compared to current main, deployed SHA is **diverged**: main 202 commits ahead and 24 behind (GitHub compare, merge base 0ec86ff7bd60ef0328893ec35b80219b85b6d117). Do not just unexpire staging: it must be aligned to an explicitly approved reviewed release.

The existing Brain contract (brain/src/contract.mjs) maps staging-v1 HMAC authentication to source "staging". Its POST /v1/events passes that identity to validateEvent, which requires equality with event.sourceType. Approved Drive, Gmail and News source events fail with INVALID_IDENTITY (422). Network-level Cloudflare Service Binding alone does not repair per-caller authorization. Do not falsely relabel events as staging or lower validation.

## Cross-owner interface handoff — do not edit their files

1. **Canonical Brain owner (#219 successor, brain/**):** design and review versioned per-caller HMAC key IDs, allowing exact authenticated caller, sourceType, eventType and route/audience; support source-scoped receipt readback. Preserve timestamp, HMAC over method/path/timestamp/exact raw body, source equality, validation, bounded payload, durable SQLite receipt and idempotency. Publish accepted headers, stable error codes and identity mapping. Never create second Brain, DO, D1 or unaudited global key.
2. **Automation Bridge owner:** prove authentic Drive source.file.created/updated and Gmail source.message.received provenance, durable audit and approved scope. Prepare owner-reviewed native Cloudflare service binding BRAIN_PRIVATE to the existing archelaos-brain-staging and a distinct scoped secret only after Brain contract approval. Preserve existing DO, KV, secrets, and disabled default.
3. **Librarian owner:** prove authentic Drive source.file.created/updated and News news.search.completed provenance and durable audit. Prepare separate reviewed BRAIN_PRIVATE service binding and scoped identity. Preserve disabled import/probe toggles.
4. **Other owners:** Fundraising, Raisely, GitLab Controller/Guardian, Self-Heal, Workflow Pilot must first obtain explicit Brain task-intent/event contracts. No GitLab-as-GitHub forgery, operator-only command usage, or autonomous merges. They are intentionally not approved by this event adapter.
5. **Release/security owners:** approve exact Brain SHA and temporary staging window, identities/keys, reviewed binding changes, rollback, no public URL fallback, paused AI/provider activity and no unintended costs. Only owners may apply settings in a separately approved change.

The read-only [binding-plan.mjs](./binding-plan.mjs) proposes a native binding only for the two approved source workers (type=service, name=BRAIN_PRIVATE, service=archelaos-brain-staging), and checks inventory, conflict, pinned SHA, staging expiry, canonical DO, intake secret metadata, source identity, provenance, durable audit and owner approval. Its READY_FOR_OWNER_REVIEW result **never means CONNECTED or TESTED**. It does not perform API calls or mutate settings.

## Safe staging runbook (future separate approval, NOT executed here)

1. Freeze exact Cloudflare version IDs, approved Brain Git SHA, relevant bindings, source/event allowlist and rollback owner.
2. First private GET /healthz via native service binding; verify canonical service, staging, pinned commit and disabled AI. Health alone does not prove E2E.
3. Submit one known non-private, provenance-verified HMAC signed event with stable eventId and correlationId, revision and SHA256; verify 202 and durable receipt with matching identity.
4. Do authenticated GET /v1/tasks/{receiptId} verifying correlation, receipt/status and durable audit; replay the exact event once to prove 200 duplicate and no second side effect.
5. Retain redacted request/receipt/readback logs, Cloudflare deployment/version IDs and exact-head GitHub CI. On unknown delivery or malformed acknowledgment audit UNKNOWN, never blindly retry. Stop immediately for identity mismatch, missing proof, failed required CI, cost/AI activity or other uncertainty. Owner disables adapter and restores only approved temporary settings, then verifies rollback.

## Execution evidence / status

Nine deterministic offline tests of binding-plan.test.mjs were run locally under Node, **9 passed / 0 failed**. Existing client.test.mjs carries 18 authored mock tests, but these have not been independently re-executed in this task; remote E2E has not been run. No new Worker, database, deployment, secret read, live binding/cron change, main merge, or force-push occurred.
