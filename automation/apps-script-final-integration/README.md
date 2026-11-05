# Apps Script ↔ Brain final integration seam — SAFE, OFF

This package adds **no new Worker, scheduler, Google API caller, trigger or HTTP route**. It does not merge, deploy, enable writes or change the source of the existing Apps Script bridge.

It is an independent, non-overlapping, reviewable compatibility seam. `inspectIntegration` gathers **trusted private** proof records and returns a conservative readiness report. `sendReadOnlyReceipt` links the already-designed #218 handoff to #201 relay via injected trusted functions only after a real authenticated private Service Binding is installed, a genuine `apps_script` Brain intake exists, and the binding's server-side policy is enabled. Do not wire or call it before those conditions are independently verified. The project fingerprint must be a *keyed*, non-public digest of the fixed preconfigured project ID.

Existing assets are authoritative: merged #124 `ScriptEditor` remains the sole provider/editor and immutable encrypted source backup/readback, merged #203 is source-only safety inventory, PR #218 is immutable HMAC-fingerprinted receipt handoff, PR #201 is private metadata-only relay, and PR #205 is synthetic-only E2E. Do **not** duplicate any of them or bypass #124 with a new Google PUT. This package neither imports unmerged PR files nor accepts arbitrary external source events.

## Readiness criteria

A source project may be labelled `READ_VERIFIED` only with an independently checked Admin `script.projects` grant and full source identity/hash evidence from the exact bound project. `WRITE_READY_NOT_AUTHORIZED` is a **report only**, NOT an approval to execute a write: it needs full encrypted immutable backup/readback and matching base source hash; all owner/account installable trigger inventory; externally enforceable exclusion of Google IDE/API writers; independent signed and project-scoped approval; independently proven safe rollback/readback preserving the manifest and trigger fingerprint; current authenticated private Brain Service Binding and actual `apps_script` intake; and the live write flag still disabled. Those proofs do not exist today.

`inspectIntegration` is not a substitute for cryptographic verification or trusted data provenance, which must be done upstream in the existing private SQLite Durable Object, identity/OAuth and Cloudflare deployment verification. It only recognizes independently sourced records from trusted private ports. No user-provided JSON can become authorization.

The read-only receipt path now additionally requires an **independent Brain durable receipt readback** (matching event ID, operation correlation, source revision, receipt identity and private transport). A relay's `DURABLE_BRAIN_RECEIPT` string alone is not acceptance. Unavailable or mismatched Brain readback is a reconciliation hold without resend, Google PUT or rollback. The `readBrainReceipt` port must be implemented in the privileged coordinator using an authenticated private binding; no request JSON can supply it.

The actual runtime still lacks the bridge↔Brain Service Binding and verified `apps_script` intake. This intentionally stays OFF. The Google Apps Script Projects API cannot enumerate all installable triggers across accounts or exclude Google IDE/API writers; never treat local SQLite advisory locks as proof. The operator must independently establish these facts before a real comment-only smoke/write/rollback. No automatic retry after uncertain outcome.

## Local tests

`node --test automation/apps-script-final-integration/integration.test.mjs`

Tests use synthetic in-memory **proofs** and assert fail-closed behaviors; they are NOT live Google, OAuth, Cloudflare, source/backup, trigger or Brain E2E. Existing #201, #205, #218 exact-head CI should be inspected separately, and this package must be reviewed by their owners before integration.
