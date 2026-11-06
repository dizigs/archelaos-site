# FINAL: Cloudflare private Brain staging E2E readiness — 2026-11-06

Repository `dizigs/archelaos-site`, existing draft PR **#233**. Exclusive file ownership: `automation/cloudflare-brain-integration/**`.

**Decision: BLOCKED / NO-GO for an actual staging deployment/E2E and production activation.** This is an evidence-based read-only deployment inventory + code-only staged contract preparation. No Worker installation, deployment, Cloudflare config write, secret value read, public endpoint, billable AI call, scheduler, autonomous action, merge or live E2E was performed.

## 1. GitHub SHA and exact source compatibility (snapshot)

| Component | Actual Git SHA | Result |
|---|---|---|
| `main` observed 2026-11-06 | `237863f70fe5af1ecc4a7315741dcfe386e97c36` | Newer than start-of-task `0136921b5f5c9160187a830fb0950373a8f376ab`; recheck immediately before rollout |
| Canonical Brain draft #234 HEAD | `0920e5e720c10be93c0d5a1c1baf8e0436090f58` | Draft, not merged; source-scoped auth and signed receipt contract exists in PR source |
| #233 base implementation before this final push | `75b46bf8e60fc619dce01da10ccd88d506d8fc82` | Legacy `staging-v1` source header was incompatible |
| Staging Brain `DEPLOY_SHA` **plain-text setting** | `d3d13b605f409bfda6f372742d629fd8eaf12145` | **DIVERGED** from latest inspected main: main 229 ahead / 24 behind, merge base `0ec86ff7bd60ef0328893ec35b80219b85b6d117` |

The script's `DEPLOY_SHA` is a configured string **not independently verified executable source provenance**. Cloudflare version IDs are not Git commit SHAs. Main and #234 can change again; no deployment to an unreviewed SHA is authorized. The release candidate must incorporate approved #234 code, go through exact-SHA quality/CI checks and independently attest the resulting built Worker bytes/version.

## 2. Verified real Cloudflare API GET readback

**Actual account:** `898359728b3dfe8c3a3f56e3d19eecd1`, `archelaos.club` zone `393d05924628b794e8345e36eab41857`. For all **nine** current Workers, GET readbacks of settings, deployment, version history, schedules, subdomain and secrets **metadata only** returned successfully, with no endpoint errors. Separate reads checked Worker domains, zone routes, DO namespaces and D1 list.

| Installed Worker | Latest deployment ID | Active Cloudflare version ID (100%) | Existing non-secret bindings | Real service to Brain / authenticated receipt | Brain integration |
|---|---|---|---|---|---|
| `archelaos-automation-bridge` | `e9da0b1c-99b4-4861-9a94-119732448ff0` | `9445de37-5465-4927-be71-a546359c5b21` | DO `APPS_SCRIPT_COORDINATOR`, KV `AUTH_KV` | none / none | BLOCKED |
| `archelaos-brain-staging` | `6d557f57-0f35-4b60-a569-546ee38157d2` | `72d7d145-9ca1-4ad0-814b-afe52ac9da91` | DO `BRAIN`, Workers AI `AI` | target, not service binding / none | DISABLED |
| `archelaos-fundraising-preview` | `484034ba-370a-416b-9b84-3f5c0a3df2e0` | `2c4eaadb-3b45-42b2-9442-92d69b21ff93` | none | none / none | BLOCKED |
| `archelaos-gitlab-controller` | `05998ad4-f39f-4c89-9765-271c70736821` | `53938cc8-0c8b-4956-8df2-934721711c53` | none beyond secrets | none / none | BLOCKED |
| `archelaos-gitlab-guardian` | `7ef87492-74d5-4851-b353-5d11480e9f63` | `2c37f688-4aee-44d1-b829-4dcb33a84c2f` | none beyond secrets | none / none | BLOCKED |
| `archelaos-librarian-staging` | `5e2dfa21-5f87-4308-83ea-4df84279f8f4` | `d291424c-05fd-42df-b5b3-0891339ef658` | DO `LEDGER` | none / none | BLOCKED |
| `archelaos-raisely-bridge` | `5014a39c-b019-435b-83b4-c7e47f248711` | `c13362d5-14b2-4ea5-9da4-586d95318ce9` | none beyond secrets | none / none | BLOCKED |
| `archelaos-self-heal` | `f768d2e8-306c-4012-b511-4cb8ce50a1da` | `fb8c26ae-f3df-46a2-8e8c-073b24785c27` | DO `HEALER_MEMORY` | none / none | BLOCKED |
| `archelaos-workflow-pilot` | `3ebd856d-b9e2-4b48-b3d6-424af7c007f8` | `6cacf77c-3894-4f47-96cb-90d981936b69` | Workflow `ARCHELAOS_PILOT` | none / none | BLOCKED |

Additional account readback: **4** existing DO namespaces, **1 separate D1 database `archelaos-photo-archive`** (unrelated to Brain DO SQLite), **0** Worker custom domains, **0** archelaos.club Worker routes, **0** registered cron triggers and **0** service-type bindings. Existing Bridge has **12** secret binding names; GitLab Controller **2**, GitLab Guardian **2**, Raisely **4**, Brain staging and Librarian **0**. Secret metadata does not prove credential validity. All three Librarian import/probe flags `NEWS_IMPORT_ENABLED`, `ARCHIVE_IMPORT_ENABLED`, `DRIVE_LINK_PROBE_ENABLED` remain `false`.

Brain staging has `ENVIRONMENT=staging`, `STAGING_EXPIRES_AT=1970-01-01T00:00:00Z` (expired), **no** intake/operator/receipt key binding names, `workers.dev=false`, and no route. The `BRAIN` DO binding points to class `BrainCoordinator`, namespace `6cd125319d774260aaf1c0444d6442f1`. This is an installed namespace, **not** live SQLite transaction/restart proof. No deployed health request was attempted.

## 3. #234 source-scoped Brain interface — exact cross-owner handoff

**Observed, not merged/deployed:** #234 head `0920e5e720c10be93c0d5a1c1baf8e0436090f58` defines:
- HMAC key IDs `drive-v1` → `BRAIN_DRIVE_INTAKE_KEY`, `gmail-v1` → `BRAIN_GMAIL_INTAKE_KEY`, `news-v1` → `BRAIN_NEWS_INTAKE_KEY` (also site/github, not requested for the initial E2E).
- Request HMAC exact bytes: `METHOD + "\\n" + PATH + "\\n" + UNIX_SECONDS + "\\n" + RAW_BODY`. 10-digit seconds and ±5-minute verification window. Source type must equal authenticated identity. Strict per-source allowed event types; no source impersonation and no operator access.
- `POST /v1/events` for approved sources requires both `BRAIN_PRIVATE_EVENT_SOURCES_ENABLED=true` and `BRAIN_PRIVATE_SERVICE_BINDINGS_VERIFIED=true`, plus `BRAIN_CAPABILITY_RECEIPT_KEY` configured on Brain. These flags **do not prove** a binding is installed and must stay OFF until the operator confirms a real private source Worker binding.
- Positive 200/202 source ACK is signed with `audience=source.receipt.ack.v1`; per-source `GET /v1/source-receipts/{receiptId}` returns a signed readback using `audience=source.receipt.readback.v1` and a source-scoped DO query. The signed envelope contains `schemaVersion=1`, `principal=<source>-v1`, `keyId=brain-capability-receipts-v1`, `issuedAtMs`, `receiptSignature`. MAC input: `audience + "\\n" + JSON.stringify(envelopeWithoutReceiptSignature)`. The verifier key must be trusted and independent from the request, and the caller must verify exact event/receipt/correlation/status.
- Draft #233's `client.mjs` has been adapted in owner scope: source-specific key ID, private `/v1/source-receipts/` route and mandatory HMAC verification before claiming persisted receipt/readback; integration defaults OFF. The current `main` still rejects `drive-v1` as UNKNOWN; do not deploy this adapter against current main to suppress authentication.

**Cross-owner action:** Handoff sent to Brain #234 review thread: confirm source ACK duplicate 200 retained ID/correlation, strict source receipt authorization, HMAC serialization, signed readback, key version/rotation, DO idempotency, and release scope. Brain owner alone may change `brain/**`. No changes to others' files were made by #233.

## 4. Proposed private-only Service Binding plan — NOT installed

These are **source-side bindings on existing Workers**, no new Brain/service/public proxy:
- On existing `archelaos-automation-bridge`: `{"type":"service","name":"BRAIN_PRIVATE","service":"archelaos-brain-staging"}`. Preserve all twelve existing secret names, `APPS_SCRIPT_COORDINATOR` DO, `AUTH_KV` KV and existing unrelated routing.
- On existing `archelaos-librarian-staging`: the same `BRAIN_PRIVATE` binding to `archelaos-brain-staging`. Preserve `LEDGER` DO, all three import/probe flags OFF, and disabled workers.dev.
- Source identities must be **separate signed keys** appropriate for each source; do not reuse `staging-v1`, operator key, another source's key or an untrusted `sourceType` header. Do not install both until each source owner has approved their actual provenance/audit.
- For the first controlled smoke test, choose **one** approved existing caller and one verified nonprivate source fixture only. Do not pretend an invented Drive/Gmail/News event has real external provenance; independent source-owner attestation is a gate. Avoid actual provider writes and paid AI calls.
- Cloudflare settings changes must use a reviewed complete binding configuration preserving all existing resources and active version semantics. Do not PUT/PATCH a partial binding list without an authoritative preview of resulting settings, do not touch other Workers, enable public fallback, change routes/crons, or create another ledger.

## 5. Sequential readiness checklist — every item required for future operator GO

- [x] Read live Cloudflare scripts, settings, deployments, active versions, secret names, DO, routes, crons and domains (**read-only**).
- [x] Compare configured staging `DEPLOY_SHA` to current GitHub main and identify **divergence**.
- [x] Discover Brain #234 source-scoped HMAC + receipt interfaces; prepare and exercise source adapter offline, default OFF.
- [ ] Brain owner reviews/merges #234 and confirms source signature format, event allowlists, signed readback, dedup/correlation and key rotation. Recheck latest exact source SHA.
- [ ] Release Captain verifies exact-head required checks, CodeQL, SonarCloud, native integration tests and any DO migration implications; selects one approved canonical Brain Git SHA and attests the deployed script bytes/version ID.
- [ ] Operator separately approves any **existing** staging Brain redeploy, provides scoped HMAC intake and receipt verifier secret names through Cloudflare secret management, and approves **≤60 minutes** expiry. No values in GitHub, reports or chat.
- [ ] Each source owner/operator separately approves native `BRAIN_PRIVATE` binding and readback on exactly their existing Worker. No public fallback; source-side adapter remains OFF until binding proof.
- [ ] Operator reviews and approves toggling **only** required staging Brain source intake + binding attestation flags after inspecting real bindings; no AI execution, no provider calls/triggers, imports remain OFF.
- [ ] Authenticated private `GET /healthz` from installed source binding returns expected service, staging, exact approved deployed commit and `aiExecutionEnabled=false`. Health alone is **not** E2E.
- [ ] One approved, nonbillable, genuine-source-provenance fixture submitted with immutable `eventId`/`correlationId`, HMAC `<source>-v1`; verify signed **202** receipt, source, digest, persistence and exact correlation.
- [ ] Read signed `GET /v1/source-receipts/{receiptId}`; assert `source.receipt.readback.v1`, principal, MAC, same receipt/correlation, DO durable audit. Duplicate same event returns **200** same receipt, no second side effect. Restart/readback must use actual deployed DO/SQLite evidence rather than a mock Map.
- [ ] Negative staging E2E: wrong secret/source/principal/audience; tampered payload, stale timestamp, invalid event/provenance, forbidden operator routes, signed receipt mismatch, replay with modified event, missing binding/secret, timeout/UNKNOWN (single delivery, never blind retry), service outage, restart and source/global kill switch. Missing audit or uncertain outcome is STOP/HOLD.
- [ ] Operator restores staging expiry OFF, source flags OFF, temporary bindings/secrets per approved rollback, verifies exact deployment IDs/settings/DO state/routes/crons/costs. No automatic rollout.

## 6. Evidence required for an honest E2E PASS

A complete receipt packet must include: exact reviewed merged Brain commit, deployed Cloudflare version/deployment ID, verifiable build/provenance checksum, source Worker version, native service binding metadata, scoped secret names (no values), UTC start/end, allowed event identity/digest and source proof, successful signed 202/200 envelope fingerprints, authorized source readback verification, canonical DO SQLite audit and duplicate/restart proof, negative test observations, AI/provider invocation count (0), no unexpected billed usage, STOP/rollback owner and final reverted settings evidence.

Without that packet, **E2E status stays NOT TESTED**, even if mock tests and public health checks pass.

## 7. Offline and remote results

- Existing Cloudflare adapter CI exact-head on `7b828007ca999463bc15768c49cf66e2005defb2`: [GitHub Actions 42133316320](https://github.com/dizigs/archelaos-site/actions/runs/42133316320), job `127615110474`, **39 tests PASS / 0 FAIL**, including source receipt signatures, wrong audience/principal/stale/tampered, missing verifier key, no operator readback, timeout/UNKNOWN, synthetic duplicate and replay, source spoofing and disabled defaults. This is **offline**, no live DO or Cloudflare service calls.
- Any later change, including this document, requires exact-final-HEAD CI and independent quality checks to be reviewed again.
- Live Cloudflare: **9/9 deployed; 0/9 source Service Bindings; 0 authenticated private E2E receipts; remote health/readback/SQLite restart/kill-switch tests NOT RUN**. No billed AI/provider invocation initiated by this task.
- **Final readiness: BLOCKED / NO-GO.** Merge decision and staging operator approval are separate. No production activation authorized.


## Final acceptance addendum — read-only Cloudflare + 50-test adapter, 2026-11-06

This is a **later readback than sections 1–7 above**. The latest checked `main` is `303971bb4893d3b2098b26233627468c53231932`; #234 is **still draft** with newer HEAD `ab2ff029e74508571f4d2088d998289a0317bac2`. The newer #234 HEAD retains the previously reviewed `brain/src/contract.mjs` blob SHA `47412f0114e3c09a47e677c1db21dd512d627d33` and `brain/src/worker.mjs` blob SHA `82b29c36dd60947990a763938130d9a0ba0020fd`; therefore its source-scoped HMAC, signed response and source-readback contract is **unchanged** by that newer branch sync. These Git blob hashes confirm the *reviewed file content*, not a deployed Brain release. Main/PR HEAD can move again before merge.

**Cloudflare GET results repeated independently for all nine Workers:** scripts, active version/deployment IDs, settings, secret names/types, cron schedules and workers.dev states are unchanged from the matrix above. **9/9 deployed, 0 service-type bindings, 0 authenticated signed remote receipts, 0 cron schedules, 0 Worker domains/routes.** `BRAIN` DO and Workers AI bindings remain present; deployed `DEPLOY_SHA=d3d13b605f409bfda6f372742d629fd8eaf12145`, `STAGING_EXPIRES_AT=1970-01-01T00:00:00Z`; no Brain source-key or receipt-key secret binding metadata. The Cloudflare deployment version is `72d7d145-9ca1-4ad0-814b-afe52ac9da91`. There remain 4 DO namespaces and 1 unrelated D1 `archelaos-photo-archive`. No live health probe or E2E transaction was attempted.

**Additional adapter hardening in the existing #233 owner scope:**
- Source ACK must carry correct HMAC **and** immutable canonical DO blob `dedupeKey`, derived from `blob|sourceType|sourceId|kind|payload.blobSha256`, with source.file.* normalizing to `source.file`. Incorrect/missing signed key, eventId, correlationId, receiptId or durable state fails closed with UNKNOWN audit. This is an extra content-identity verification, not merely receipt signature checking.
- Every enabled `submitEvent` and `readReceipt` now requires an exact **40-hex approved Brain release SHA** and executes a **private-only health preflight** before transmitting event/readback. Wrong or missing expected SHA, mismatched service identity, staging mode, AI enabled or stale deployment prevents delivery (`BRAIN_RELEASE_UNPINNED` / `BRAIN_RELEASE_UNVERIFIED`). An isolated health response can still change between probe and POST; the operator must freeze/deployment-lock the staging version for E2E.
- Readback rejects missing/unsigned/wrong-source or wrong-correlation evidence; readback HTTP error, network failure, malformed signed reply and mismatch are reported through the caller's **required `auditSink`** as `UNKNOWN`. This audit is only as durable as the source owner's actual `auditSink` implementation; mock tests cannot establish remote audit durability or DO restart correctness. No blind retry is issued.
- `staging-v1` in historical negative tests **is not the active client identity**. The adapter uses `drive-v1` / `gmail-v1` / `news-v1` and the trusted `BRAIN_CAPABILITY_RECEIPT_KEY` verifier secret; source credentials remain separate from operator scope. No public HTTP fallback exists.
- After all merges, source Worker owners **still must integrate** this opt-in library into their actual deployed Worker code, confirm verified provenance/real persistent audit implementations and approve the matching Service Binding. Merging the library alone does not install or exercise the integration.

**Evidence:** [GitHub Actions 42137248975](https://github.com/dizigs/archelaos-site/actions/runs/42137248975), hosted Node 22 job `127628433665`, commit `bdcd48ede12a8897c55bfda23b94d01ec7f2b9f1`, **50/50 offline tests PASS** including signed immutable digest, lost ACK, readback UNKNOWN, wrong SHA preflight, replay, timeouts and synthetic kill switches. Any later doc or code commit requires checks to be re-read on that **new exact head**. SonarCloud, CodeQL, GitGuardian, release checks and review threads require independent exact-head confirmation, not assumptions from older SHAs.

**Canonical Brain #234 handoff:** The existing signed `/v1/source-receipts/{id}` source readback signs receiptId, correlation, status, attempts and durability but **does not independently repeat eventId/dedupeKey**. The signed initial ACK verifies these fields, and signed readback is cryptographically linked by the same receiptId+correlation; an end-to-end proof must preserve that trusted original ACK and persistent source audit. Brain owner was explicitly asked to confirm the two-receipt proof or add immutable fields to the signed source readback. The symmetric receipt HMAC verifier has signing capability too; owner must approve its security trust boundary or adopt a more independent verifier/signature design. No claim of stronger origin proof than these contracts allows.

### Staging operator approvals and rollback — refreshed gate

- [ ] Brain owner + Release Captain: approve final #234 contract, reviewed exact merged SHA/CI/SonarCloud/CodeQL, DO schema safety and immutable deployed-byte attestation.
- [ ] Source owners: integrate the existing #233 adapter in their existing Workers, with verifiable source provenance, durable `auditSink`, disabled-by-default feature gates and no provider calls.
- [ ] Cloudflare operator: separately approve staging-only Brain version deployment, per-source `BRAIN_{SOURCE}_INTAKE_KEY` secret *on both relevant caller and Brain*, `BRAIN_CAPABILITY_RECEIPT_KEY` on both sides, temporary expiry ≤60 min, `BRAIN_PRIVATE_EVENT_SOURCES_ENABLED` and `BRAIN_PRIVATE_SERVICE_BINDINGS_VERIFIED` only after native binding readback.
- [ ] Each existing Worker owner: separately approve native `BRAIN_PRIVATE` service binding pointing to existing `archelaos-brain-staging`; preserve all old DO/KV/workflow/secrets/settings. Keep workers.dev fallback OFF for Brain, imports/triggers/autonomy/AI providers OFF.
- [ ] Operator: freeze exact deployed version and perform *real private-only* health, one genuine approved non-private provenance fixture, signed 202 ACK, verified canonical dedupeKey/eventId/correlation, signed source-specific readback, same receipt on 200 duplicate, real DO restart/idempotency readback, missing key, cross-source, spoof/replay, timeout/UNKNOWN and kill switch negatives; store redacted receipts and independently verified DO/audit evidence.
- [ ] Operator: expire staging again, revert only approved temporary bindings/secrets/flags through each owner, verify final routes/crons, versions, audit and cost status. Stop on mismatch, unknown write or unapproved cost.

**Live E2E = NOT EXECUTED.** **Code-only readiness = offline tests PASS, but dependent interfaces, source owner wiring, final quality gates and operator approval remain.** **Final decision: BLOCKED / NO-GO for actual staging and production.**
