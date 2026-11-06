# Apps Script ↔ Brain — trusted receipt handoff (PR #124 reuse)

**Status: OFF, non-production, not mounted** (2026-11-05). This is an isolated package for review. It neither edits Google Apps Script nor deploys a Worker, creates a Brain, adds an OAuth grant, sends a network event, runs triggers, or changes an existing PR. Ownership is **only** `automation/apps-script-brain-handoff/**` and its new PR-only workflow. The existing `archelaos-automation-bridge`, `MuseumScriptCoordinator` and merged PR #124 remain the sole permitted Google source/backup/editor implementation.

## What is actually reusable

- Merged #124 `ScriptEditor.read()` checks exact verified Admin identity/scope and project metadata, GETs entire source, normalizes every file and returns a complete deterministic hash. `ScriptEditor.backup()` AES-GCM-encrypts an immutable full code/manifest backup, reads/decrypts it and checks hash. Actual OAuth/Admin grant, real four-file Google GET and one encrypted live backup were recorded privately 2026-11-04. Do NOT ask for repeat scopes. Those proofs are per one configured project, not a complete inventory of all Scripts.
- Merged #203 `AppsScriptInventoryService` provides read-only metadata/hash snapshots; its advisory lease does **not** prove installable-trigger completeness or exclusion of Google IDE/other writers.
- Draft #201 is the separate **private metadata-only relay**, with `relayAppsScriptReceipt({operationId}, trustedPorts)`, durable dedupe and closed Brain schema. It is not imported by this package while unmerged. Its durable `readTrustedReceipt(operationId)` port should eventually read the receipts prepared here **from the existing authoritative private SQLite store**, not a caller body or public route.
- Merged #111 Brain supports `staging|drive|gmail|site|github|news` only. `apps_script` is NOT accepted as of this checkpoint. This package's `verifyBrainHandoffReadiness` must remain blocked until the Brain owner adds/validates a genuine `apps_script` capability and private Service Binding. Never alias events as `github`.

## Trusted composition contract (future, explicitly not deployed)

Inside the existing authorized `MuseumScriptCoordinator`, instantiate the **existing** `ScriptEditor` using the verified Admin grant and the exact preconfigured project. Then call `prepareAppsScriptReceipt({operationId,phase:'read'|'backup',actor,editor,ports})`. It uses `ScriptEditor.read` / `.backup` only; no `.edit`, `.rollback`, `.provider.update` or trigger operations. All `ports` MUST be private server-provided functions, never request data:

- `readControls()` → authoritative `{paused:false,readEnabled:true}`; disabled or paused refuses before access.
- `fingerprintProject(exactConfiguredProjectId)` → 64-hex **keyed HMAC** using a private server-only salt/key (never log, export or reuse unkeyed project ID). `sourceRevision` is the existing PR #124 source hash; provenance is limited to its exact bound project.
- `claim(operationId,phase)` → atomic durable `CLAIMED|COMPLETED|RECONCILE_REQUIRED`, checking operation+phase exclusivity. **No in-memory Map implementation in production.** Unknown in-flight cases stay HOLD; no automatic retry.
- `complete(operationId,receipt)` → atomic immutable receipt append in the existing SQLite DO; `get(operationId)` must read it back unchanged. No public project ID/filename/code/token/backup ID enters the receipt. This records source/backup evidence only, not live Brain dispatch or Google edit.
- `hold(operationId,reason)` → durable uncertain-outcome HOLD (must never overwrite a verified completed receipt); `audit(event)` → durable redacted journal; no private raw content in audit.

The only safe eventual Brain flow is: trusted real Google GET / private encrypted backup → immutable SQLite receipt/readback → #201 `readTrustedReceipt()` → verified existing Brain private Service Binding and `apps_script` intake capability → Brain durable receipt → dedupe/reconciliation. All network access must remain private and signed; no public dispatcher endpoint.

## Explicit blockers / safety

1. No standalone Google Apps Script API connector is installed in this chat. The admin grant is **already verified**, but direct invocation of existing private Cloudflare OAuth grant/source is not available as a ChatGPT connector. Never treat Google Drive access as authorization to call Apps Script `updateContent`.
2. The existing runtime is bound to one exact private project. Additional projects need an approved ID/account inventory and **separate real per-project access/backup/readback**. Do not assert all 20–30 projects are connected merely from one grant.
3. Full cross-account installable-trigger inventory and external-writer exclusion remain **NOT VERIFIED**; Google's Projects API does not enumerate all installable triggers or IDE writers. Production edits remain disabled. No one may enable `liveWritesEnabled` based on this adapter.
4. There is no independent signed execution identity/project-scoped edit/rollback authorization provided here. All actual future writes and rollback must still use #124's `ScriptEditor` only, after verified independent review, full trigger evidence, external-writer exclusion, original encrypted backup, exact base hash, Google readback and audit.
5. Real cross-Worker E2E requires the Brain owner to enable `apps_script` as an authentic private source, bind the existing Workers, verify deployment/logs and run a **read-only** event with an actual Google-backed source receipt through #201. No deployment, secret change, Google PUT or paid API call is authorized here.

## Tests

`node --test automation/apps-script-brain-handoff/*.test.mjs`

`handoff.test.mjs` tests durable-claim contract with explicitly synthetic storage/editor. `pr124.integration.test.mjs` imports the **real merged PR #124** `ScriptEditor` and `PrivateCipher`, verifying code read, encrypted backup/readback, authorization, mismatch rejection and no provider PUT against a synthetic provider. They are **offline**, not production Google/Cloudflare/Brain proof. A new GitHub Actions workflow runs these on PR changes or manual request only; no cron or live secrets. Do not merge until exact head checks and independent review finish.