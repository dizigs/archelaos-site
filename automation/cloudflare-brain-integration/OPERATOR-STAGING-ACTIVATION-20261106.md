# Operator approval packet — existing private Brain staging only (2026-11-06)

**Status: BLOCKED / NOT AUTHORIZED TO EXECUTE.** This file is a change plan, **not** an API mutation, deployment, working E2E connection, or authorization. Ownership: `automation/cloudflare-brain-integration/**`. Preserve the canonical Brain, its DO/SQLite ledger, existing nine Workers and their other bindings. This plan requires cross-owner review; do not change other owners' files.

## Live release snapshot (non-secret readback)

Account: `898359728b3dfe8c3a3f56e3d19eecd1`. Project zone: `393d05924628b794e8345e36eab41857`.
- GitHub `main`: `c89823a21efc1fa9f979b17a6567337a498a1969`.
- Existing Brain staging: version `72d7d145-9ca1-4ad0-814b-afe52ac9da91`, deployment `6d557f57-0f35-4b60-a569-546ee38157d2`, configured `DEPLOY_SHA=d3d13b605f409bfda6f372742d629fd8eaf12145`, diverged from current main (main ahead 202/behind 24).
- `BRAIN` DO namespace `6cd125319d774260aaf1c0444d6442f1`, class `BrainCoordinator`; Workers AI `AI`. `STAGING_EXPIRES_AT=1970-01-01T00:00:00Z`. No `STAGING_INTAKE_KEY` or `STAGING_OPERATOR_KEY` secret names. No service binding from either source Worker.
- Bridge version `9445de37-5465-4927-be71-a546359c5b21` (deployment `e9da0b1c-99b4-4861-9a94-119732448ff0`); Librarian version `d291424c-05fd-42df-b5b3-0891339ef658` (deployment `5e2dfa21-5f87-4308-83ea-4df84279f8f4`).
- Nine scripts; four DO namespaces; one unrelated standalone D1 database `archelaos-photo-archive`; no active cron triggers, Worker routes or Worker custom domains.

## Compatibility is an absolute pre-deployment blocker

The existing adapter signs requests with key ID `staging-v1`, and source type `drive`, `gmail` or `news`. Current main Brain maps that key ID to `staging`, while `validateEvent` mandates equality with the event's real source type. Therefore real intake would be rejected with `INVALID_IDENTITY` (422) **if reached**; no remotely observed 422 is claimed.

Draft Brain #234 `47c86ecaa12acf1a4029433c7dd7557653583505` adds **Analytics** and **Apps Script** identities but not `drive`, `gmail`, `news`. Do not incorrectly assume that #234 repairs this. Brain owner must approve & merge a genuine per-source/per-caller identity contract with HMAC key ID, event scope, proof provenance and receipt-readback authorization, then publish the exact reviewed Brain release SHA and API schema. This Cloudflare lane must adapt only its own client/binding-plan code to that finalized contract; never alias drive/news as GitHub or staging. Only the source owners can approve data provenance and caller configuration.

## Staging-only proposed native bindings — NOT installed

| Existing caller Worker | Proposed native binding (unchanged target) | Approved candidate sources, subject to Brain owner identity proof | Actual installed? |
|---|---|---|---|
| `archelaos-automation-bridge` | `{ "type": "service", "name": "BRAIN_PRIVATE", "service": "archelaos-brain-staging" }` | Drive: `source.file.created/updated`; Gmail: `source.message.received` | NO |
| `archelaos-librarian-staging` | `{ "type": "service", "name": "BRAIN_PRIVATE", "service": "archelaos-brain-staging" }` | Drive: `source.file.created/updated`; News: `news.search.completed` | NO |

This proposes two existing Worker **source-side** service bindings, not a second Brain, public domain, HTTP proxy, new Worker, generic operator credential, or cron. Do not infer ability to patch `settings.bindings` without a release: Cloudflare changes can publish a version or alter active script settings and require separately approved deployment/change control. Never replace whole settings with a partial binding array; preserve existing DO, KV, AI, Workflow, secrets, environment and compatible version settings. Verify exact target script identity and settings readback before/after any future approved change. Do not use `workers.dev` as a fallback.

## Explicit approvals — each requires its own operator decision

| Approval | Owning authority | Exact proposed change | Current state |
|---|---|---|---|
| A1 canonical auth/receipt contract | Brain owner | Reviewed source-scoped HMAC identities; signed or independently authenticated durable receipt+readback; reject spoofing, replay and operator escalation | BLOCKED |
| A2 exact staging release | Brain + Release Captain | Align existing `archelaos-brain-staging` deployed source to reviewed commit; verify executable hash/provenance and DO schema/migration safety | NOT APPROVED |
| A3 temporary staging configuration | Brain + Security operator | Nonpublic, time-bounded expiry (≤60 minutes) and per-source secret metadata via Cloudflare secret control, never GitHub/chat/log | NOT APPROVED |
| A4 private source bindings | Each source Worker owner + operator | Preserve existing bindings; add `BRAIN_PRIVATE` to existing Bridge and/or Librarian only after A1–A3 | NOT APPROVED |
| A5 deterministic synthetic event E2E | Operator + source/Brain owners | Allow one approved non-private source fixture with provenance and durable audit; no Google/Gmail/GitLab/News imports, no billed model | NOT APPROVED |
| A6 rollback rehearsal | Release Captain + operator | Snapshot previous deploy IDs/versions/bindings; prepared restore/remove temporary bindings, expire staging, read back controls, log receipts | NOT APPROVED |

**No approval in this task constitutes permission to perform another approval's change.** A source binding does not authorize operator actions. Default adapter `enabled=false`, staging expired, Librarian import/probe flags false, AI/provider execution OFF, cost guardrails in force. No secrets or plaintext credentials are stored in this file.

## Minimal future staging E2E: evidence requirements, not executed

0. **Prerequisites:** A1–A6 signed off in the normal owner process; final exact-head required CI, CodeQL/security/quality gates green; no side-effecting scheduled triggers; release SHA/DO migration reviewed. Capture allowed identity/event and source metadata before test. Ensure nonprivate deterministic fixture, zero billed AI.
1. Freeze all original script deployment+version IDs, binding types, flags, expires-at, route state and existing 4 DO namespaces. Pre-declare 60-minute maximum TTL and independent rollback operator. Pin exact canonical SHA, verify deploy/provenance **not only a `DEPLOY_SHA` variable**.
2. Apply only approved **staging** changes using owning release procedure. Verify native `service` binding readback on exactly the approved callers; no public fallback, no other bindings modified. Verify scoped secret-name metadata without retrieving values.
3. Through the approved source Worker's **private Service Binding**, perform `GET /healthz`, expecting `service=archelaos-brain`, `environment=staging`, committed approved SHA, `aiExecutionEnabled=false`. Health alone does not prove intake, source auth or SQLite durability.
4. Send exactly one allowlisted HMAC signed event with stable UUID `eventId`, `correlationId`, immutable source digest/revision, signed route/method/timestamp/exact raw bytes. Verify the source identity, event type, provenance and 202 persisted receipt with matching receiptId/eventId/correlationId. Require a trusted, independently authenticated receipt/readback verification method as approved in A1. No direct AI, no provider writes.
5. Do authorized `GET /v1/tasks/{receiptId}` readback, verify identity, exact correlation/status and authoritative DO audit; re-send **the same exact event** once to get 200 duplicate and the **same receipt**, no extra durable task/side effect. Unknown delivery cannot be retried blindly.
6. Negative tests (all should fail closed): missing/invalid key, HMAC body/path/method tampering, stale timestamp, wrong source identity/caller, unauthorized event, missing provenance, forged/mismatched or unsigned receipt, replay with altered payload, mismatched commit, missing binding, global/source kill switch, communication failure/timeout, restart/DO rehydration, uncertain ACK and missing audit. Test kill switches without turning on providers. Reconciliation of UNKNOWN uses authenticated audit/readback only, no newly generated event ID.
7. Redact and retain Cloudflare script/version/deployment IDs, exact GitHub commit+CI, UTC timestamps, request IDs, allowed source and event IDs, signed receipt fingerprints (not credentials), DO audit evidence, duplicate/restart proof, aborted/negative case results and operator rollback readback. Without these, classification is **NOT CONNECTED**.
8. Restore any temporary staging expiry and source flags (OFF), remove only approved temporary service bindings/secrets through their owners, confirm effective settings/routes/crons and worker versions. On identity mismatch, uncertain cost, unexpected AI, wrong SHA, missing receipt, failed CI or unauthorized action **STOP immediately** and audit `UNKNOWN`, do not silently retry.

## Snapshot classification and release rule

**Deployment metadata: PASS (9/9).** **Native private bindings: BLOCKED (0/9).** **Actual private health: NOT TESTED.** **Authenticated durable receipt readback: NOT TESTED.** **Real DO SQLite replay/restart E2E: NOT TESTED.** **Offline mock negative tests: CI evidence tracked per exact PR commit, not remote proof.**

**Final: BLOCKED / NO-GO for staging activation; NO-GO for production.** Only the Release Captain may decide merge after exact-head CI and independent review; Cloudflare/operator approval remains separate from merge.


## FINAL PUSH — superseding current #234 contract (2026-11-06; this section overrides older observations)

**New Brain #234 head:** `0920e5e720c10be93c0d5a1c1baf8e0436090f58`. Unlike the earlier head quoted in the historical section, this newer draft **does implement source-scoped `drive-v1`, `gmail-v1`, `news-v1` HMAC identities**, separate secrets `BRAIN_DRIVE_INTAKE_KEY`, `BRAIN_GMAIL_INTAKE_KEY`, `BRAIN_NEWS_INTAKE_KEY`, and source-scoped signed ACK + readback. **It is still NOT merged into `main` or deployed to staging.** Current main snapshot `237863f70fe5af1ecc4a7315741dcfe386e97c36` is also not aligned with staged `DEPLOY_SHA=d3d13b605f409bfda6f372742d629fd8eaf12145`.

The existing #233 adapter is now prepared to send true `sourceType + '-v1'` key IDs (never `staging-v1` aliases); `GET /v1/source-receipts/{receiptId}` replaces the previous `/v1/tasks` operator-only path; a separate `receiptVerificationKey` (expected Brain `BRAIN_CAPABILITY_RECEIPT_KEY`) verifies the HMAC-signed `source.receipt.ack.v1` and `source.receipt.readback.v1` envelopes. The read-only binding eligibility checker requires `selectedSource` plus the exact corresponding `BRAIN_{SOURCE}_INTAKE_KEY` metadata and the shared Brain receipt-signing key metadata, not generic `STAGING_INTAKE_KEY`. All such staging key names are still absent in real Cloudflare GET results.

**Do not use the previous text suggesting #234 lacks Drive/Gmail/News identities as an up-to-date blocker.** The outstanding blockers are: #234 pending review/merge/immutable SHA, no staged source secrets, no native Service Bindings, expired staging, no independently verified E2E or receipts. The complete current version/SHA matrix and operator GO/BLOCKED checklist is [FINAL-STAGING-E2E-READINESS-20261106.md](./FINAL-STAGING-E2E-READINESS-20261106.md). Leave all runtime flags and billing/AI providers OFF until separate operator approvals.
