# Canonical Brain — final private source interface (PR #234)

**Scope:** \`brain/**\`, one existing \`archelaos-brain-staging\` Worker + \`BrainCoordinator\` Durable Object and SQLite storage. Code-only, **OFF by default**. This is an interface contract for independent owner-controlled staging verification; it is not a record of a deployed or connected Worker.

## Sources reviewed (read-only)

- Merged #111 / #219 original Brain: \`brain/src/contract.mjs\`, \`brain/src/worker.mjs\`, \`brain/src/exec_authority.mjs\`, \`brain/src/budget.mjs\`.
- Merged #201 / #218: \`automation/apps-script-brain-relay/src/relay.mjs\` and \`automation/apps-script-brain-handoff/handoff.mjs\`.
- #220 / #230 Analytics: \`automation/analytics-brain-ingest/src/bridge.mjs\` and \`BRAIN_OWNER_INTERFACE.md\`.
- #213 integration: \`automation/brain-worker-executors/integration/canonical-review.mjs\` (read-only adapter; no second executor/ledger).
- #227 Apps Script final adapter, #233 Cloudflare binding handoff, #235 Self-Heal/security private contract.

## Authentication & fixed source identity

**Transport boundary:** a genuinely private native Cloudflare Service Binding, separately authenticated HMAC principal, short 5-minute request clock tolerance, no query string or unsigned request. The existing Worker remains \`workers_dev=true\` in repo configuration and the currently observed remote staging deployment is expired/diverged; **the flags must not be enabled** until the Cloudflare and central release owners prove private ingress, exact SHA and verified secret binding metadata.

HMAC-SHA256 request message bytes are \`METHOD + "\n" + pathname + "\n" + epochSeconds10 + "\n" + exactUTF8Body\`; lowercase 64-hex signature. Headers:
\`x-archelaos-key-id\`, \`x-archelaos-timestamp\`, \`x-archelaos-signature\`. No secrets in repository, URL or logs.

| Principal / key ID | Secret binding NAME (not value) | Allowed routes |
| --- | --- | --- |
| \`operator-v1\` | \`STAGING_OPERATOR_KEY\` | Existing operator controls and execution-intent review APIs; not source intake |
| \`staging-v1\` | \`STAGING_INTAKE_KEY\` | Existing synthetic/legacy source API, sourceType \`staging\` only |
| \`analytics-v1\` | \`BRAIN_ANALYTICS_INTAKE_KEY\` | Analytics capabilities, submit and signed readback only |
| \`apps-script-v1\` | \`BRAIN_APPS_SCRIPT_INTAKE_KEY\` | Apps Script capabilities, submit and signed readback only |
| \`drive-v1\` | \`BRAIN_DRIVE_INTAKE_KEY\` | \`drive\` source event and its own receipt lookup only |
| \`gmail-v1\` | \`BRAIN_GMAIL_INTAKE_KEY\` | \`gmail\` source event and its own receipt lookup only |
| \`news-v1\` | \`BRAIN_NEWS_INTAKE_KEY\` | \`news\` source event and its own receipt lookup only |
| \`site-v1\` | \`BRAIN_SITE_INTAKE_KEY\` | \`site\` source event and its own receipt lookup only |
| \`github-v1\` | \`BRAIN_GITHUB_INTAKE_KEY\` | \`github\` source event and its own receipt lookup only |

The source enum is not used to impersonate other event types. Exact event allowlist (enforced **at authenticated \`/v1/events\`**, not by the shared reusable metadata validator):
\`drive\`: \`source.file.created\`, \`source.file.updated\`;
\`gmail\`: \`source.file.created\` (existing verified legacy adapter) or \`source.message.received\`;
\`news\`: \`source.file.created\` (existing verified legacy adapter) or \`news.search.completed\`;
\`site\`: \`source.file.created\` (existing verified legacy adapter) or \`site.contribution.received\`;
\`github\`: \`source.file.created\` (existing verified legacy adapter) or \`github.ci.failed\`.
Legacy \`source.file.created\` is never relabeled as a verified CI failure or as a news search result. It routes to SOURCE_REVIEW and requires independently verified source provenance. The existing \`brain/src/adapters/common.mjs\` uses this metadata event for Gmail/site/GitHub; rejecting it inside the public \`validateEvent\` would break actual integrated adapters.
A generic source key cannot call \`/v1/control\`, \`/v1/exec/**\`, \`/v1/diagnostics\`, any other principal's source receipts, or the Analytics/Apps Script capability. An operator source key cannot spoof a source event. \`staging-v1\` remains confined to \`staging\` and cannot authorize any of the new private identities.

**Gates** (literal exact string \`true\`, all default absent/OFF):

- Analytics/Apps Script: \`BRAIN_PRIVATE_CAPABILITIES_ENABLED\` **and** \`BRAIN_PRIVATE_SERVICE_BINDINGS_VERIFIED\`.
- Legacy source principals: \`BRAIN_PRIVATE_EVENT_SOURCES_ENABLED\` **and** \`BRAIN_PRIVATE_SERVICE_BINDINGS_VERIFIED\`.
- All capability and source receipt signing additionally requires \`BRAIN_CAPABILITY_RECEIPT_KEY\` secret binding.
- \`STAGING_EXPIRES_AT\`, \`ENVIRONMENT=staging\`, \`DEPLOY_SHA\` outer startup checks remain mandatory. Real provenance/consent/permissions must be independently verified by the owning worker, not inferred from settings. AI pause remains locked ON.

## Private endpoints

| Endpoint | Principal | Request / result |
| --- | --- | --- |
| GET \`/v1/capabilities/analytics\` | analytics-v1 | \`{version:"analytics.aggregate.v1",authenticatedServiceBinding:true,durableSnapshotUpsert:true,receiptSignatureVerification:true,immutableReceiptReadback:true}\` *only if private staging gates are enabled*. Flags alone are not proof of live bindings |
| POST \`/v1/intake/analytics\` | analytics-v1 | Exact #220 \`{schemaVersion,event,snapshotKey,metricRevision,evidence,operation:"UPSERT_NOT_INCREMENT"}\` |
| POST \`/v1/analytics/readback\` | analytics-v1 | Exact \`{receiptId,eventId,snapshotKey}\`; signed immutable version metadata including \`isCurrent\` |
| GET \`/v1/capabilities/apps-script\` | apps-script-v1 | Exact five-field capability in #201; deployed SHA digest refers to the configured Worker, not provider approval |
| POST \`/v1/intake/apps-script\` | apps-script-v1 | Exact opaque eight-field #201 event. **ACK stays exactly five fields** \`{receiptId,correlationId,status,durable,duplicate}\` |
| POST \`/v1/apps-script/readback\` | apps-script-v1 | \`{eventId,operationId}\` for #227 or \`{receiptId,eventId,operationId}\` for explicit lookup; both return a separately signed immutable receipt |
| POST \`/v1/events\` | drive/gmail/news/site/github-v1 | Legacy canonical 9-field metadata envelope, must match authenticated source and event allowlist; signed HTTP ACK |
| GET \`/v1/source-receipts/{uuid}\` | same source principal | Source-filtered durable job receipt, signed; reading another source yields 404 |

Content-type for POST: \`application/json\` (optionally \`charset=utf-8\`); bounded UTF-8 body <= 4096 bytes, no query. All sources fail closed for missing/bad key, stale timestamp, wrong source, unexpected fields, prohibited PII, paused state, unknown receipt or unavailable storage. Source signed key alone is **NOT** independent proof that its private provider readback was genuine.

## Canonical Analytics SQLite semantics

The existing \`BrainCoordinator\` transaction atomically writes \`analytics_snapshots\` (one CURRENT row per \`source|from|to\`), \`analytics_snapshot_versions\` (append-only distinct receipt per accepted version), \`capability_deliveries\` (idempotency), and \`capability_audit\`. No additive counter, new DO instance, D1, second Brain, or separate economic reservation.

The source normalization follows #196/#220 accepted metric allowlists. Exact event SHA256 and metric-revision digest are verified, and only allowlisted aggregate metrics with sampleSize >=20 are recorded. \`observedAt\` must equal signed evidence \`observedAt\` and is treated as workflow completion UTC; \`runId\`, \`artifactId\`, immutable workflow name and \`runSha\` are stored in immutable private evidence metadata. The claimed GitHub run/artifact identity is NOT independently fetched inside Brain; Analytics #230 must prove bytes+run+provenance with its trusted private reader.

Ordering: later UTC completion wins; equal completion timestamp uses larger verified \`runId\`. Older/equal ambiguous revisions fail 409. A later *different source artifact* is UPDATED even if metric values are identical. A replay of the CURRENT event with exact same body is DUPLICATE and returns the existing immutable receipt; a replay of a superseded revision fails 409 and requires explicit readback. Each accepted version has a unique \`receiptId\`; immutable readback reports \`isCurrent\` independently of the stored version's original \`ACCEPTED\` or \`UPDATED\` status.

Apps Script receipts stay opaque, unique on \`(operationId,phase)\`, and read-only review status. No source code, project IDs, tokens, trigger content, backup bytes, live Google writes or automatic rollback.

The durable global/source kill switch and source rate counter are checked **inside the same SQLite \`transactionSync\` as the insert/UPSERT**; a pause cannot be bypassed by a write between a pre-check and commit. A delivery crash/timeout is UNKNOWN and must be reconciled by signed readback, never blindly repeated.

## Brain-signed receipt canonicalization

Receipt key: private secret \`BRAIN_CAPABILITY_RECEIPT_KEY\`, public stable \`keyId="brain-capability-receipts-v1"\`, response contains \`receiptSignature\` (64 lowercase hex). Brain returns JSON object with stable fields (including \`schemaVersion:1\`, \`audience\`, \`principal\`, \`keyId\`, \`issuedAtMs\`) BEFORE adding \`receiptSignature\`.

**Algorithm:** HMAC-SHA256 with the raw secret UTF-8 bytes over exact UTF-8 bytes:
\`audience + "\n" + JSON.stringify(responseObjectWithoutReceiptSignature)\`. Lowercase hex encode 32-byte MAC. The independently trusted verifier MUST check the same keyId, audience, principal, exact request binding (\`receiptId\`, event ID, snapshot key/revision, source), timestamp freshness and duration, and independent readback; a body-signed ACK **alone is not provider provenance**.

Audiences: \`analytics.snapshot.ack.v1\`, \`analytics.snapshot.readback.v1\`, \`apps-script.receipt.readback.v1\`, \`source.receipt.ack.v1\`, \`source.receipt.readback.v1\`.
The #201 Apps Script ACK stays unchanged and unsigned for strict API compatibility; obtain the **independently signed** source receipt via \`/v1/apps-script/readback\`. Never interpret a naked ACK as complete evidence.

## Cross-team handoff / readiness

- **#213 Build A/B + Testing:** single canonical \`BrainCoordinator\` \`exec_intents\` / \`exec_path_locks\`, max TWO active-or-unknown BUILDs, one \`ai_months\`/\`ai_reservations\` ledger limited to 20,000,000 micro-EUR/month. Signed preclaimed authorization and independent exact SHA Testing readback remain required. #213 read-only \`reviewCanonicalTask\` must never reserve/settle again under #211/#214 native adapters; all AI OFF.
- **#227 Apps Script:** trusted #124/#218 prepare/readback → #201 relay \`submitToBrain(event)\` + distinct \`readBrainCapabilities()\` + signed private \`readBrainReceipt\` readback; no Google PUT, trigger scan, rollback or new permission from this contract. Missing external-writer inventory blocks LIVE.
- **#230 Analytics:** private zip/JSON SHA256, GitHub run/artifact provenance, exact source schema and GDPR review stay upstream. Implement \`capabilities()\`, \`submitSnapshot()\`, and a separate trusted \`verifyReceipt()\` verifying signed ACK+immutable readback. Never count duplicate or older/28-day overlap as fresh totals. #230 remains OFF.
- **#233 Cloudflare:** map real native \`BRAIN_PRIVATE\` Service Bindings to approved workers only; provision separately scoped source secret **names** after explicit staging approval. Brain deployed SHA is currently diverged/expired, and real Service Bindings presently absent by the last read-only inventory; no live E2E is claimed.
- **#235 Self-Heal/Security:** its signed \`selfheal.recover\` RPC requires independent real failed-check provenance, durable chain halt and source-scoped kill switches. This PR intentionally **does not sign or route** a self-heal recovery event, because no verified \`BRAIN_RECOVERY\` binding/provenance exists. No claim of Self-Heal runtime integration or automatic repair.
- **Central release captain:** only designated owner may merge, configure staging/production, change secrets, enable any capability or AI. Required exact-head CI, CodeQL, Sonar and staged credential-free readbacks must pass before any review decision.

**Status matrix:** contract CODE-READY after this PR's exact HEAD hosted gates; RUNTIME-BLOCKED until independent Cloudflare bindings/secrets, current approved staging SHA/expiry, source provenance, privacy approval and actual private signed write→restart→readback. No production deploy, no AI inference or billing permission.

## Exact #227 \`readBrainReceipt\` compatibility

#227's \`readBrainReceipt({operationId,eventId})\` trusted port can call POST \`/v1/apps-script/readback\` with \`{operationId,eventId}\` and independently verify the response HMAC, audience \`apps-script.receipt.readback.v1\`, principal, key ID, timestamp, event ID, operation ID and origin. After verification it MUST project **only** the eight fields required by #227:

\`{eventId,correlationId,receiptId,source,sourceRevision,transport,status,durable}\`.

Do NOT pass the raw signed HTTP body to #227 because its \`sendReadOnlyReceipt\` intentionally rejects extra fields. The signed body additionally provides metadata such as \`phase\`, \`evidenceDigest\`, \`schemaVersion\`, \`audience\`, \`principal\`, \`keyId\`, \`issuedAtMs\`, and \`receiptSignature\`. The trusted adapter verifies those values first, then supplies the separate strict projection. \`source=apps_script\`, \`transport=PRIVATE_SERVICE_BINDING\`, \`status=WAITING_REVIEW\` are scoped Brain responses, **not** proof of external Google writer exclusion or trigger inventory.


**Byte-level note:** the separator in the expression above is ONE actual line-feed byte (U+000A), **not** the literal two characters backslash and \`n\`. The same is true of the request HMAC method/path/timestamp/body separators. Use \`new TextEncoder().encode(audience + '\n' + JSON.stringify(unsigned))\` in JavaScript.
