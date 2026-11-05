# Apps Script ↔ Brain final integration seam — SAFE, OFF

This package adds **no new Worker, scheduler, Google API caller, trigger or HTTP route**. It does not merge, deploy, enable writes or change the source of the existing Apps Script bridge.

It is an independent, non-overlapping, reviewable compatibility seam. `inspectIntegration` gathers **trusted private** proof records and returns a conservative readiness report. `sendReadOnlyReceipt` links the already-designed #218 handoff to #201 relay via injected trusted functions only after a real authenticated private Service Binding is installed, a genuine `apps_script` Brain intake exists, and the binding's server-side policy is enabled. Do not wire or call it before those conditions are independently verified. The project fingerprint must be a *keyed*, non-public digest of the fixed preconfigured project ID.

Existing assets are authoritative: merged #124 `ScriptEditor` remains the sole provider/editor and immutable encrypted source backup/readback, merged #203 is source-only safety inventory, merged #218 is immutable HMAC-fingerprinted receipt handoff, merged #201 is private metadata-only relay, and open #205 is synthetic-only E2E. Do **not** duplicate any of them or bypass #124 with a new Google PUT. This package neither imports unmerged PR files nor accepts arbitrary external source events.

## Readiness criteria

A source project may be labelled `READ_VERIFIED` only with an independently checked Admin `script.projects` grant and full source identity/hash evidence from the exact bound project. `WRITE_READY_NOT_AUTHORIZED` is a **report only**, NOT an approval to execute a write: it needs full encrypted immutable backup/readback and matching base source hash; all owner/account installable trigger inventory; externally enforceable exclusion of Google IDE/API writers; independent signed and project-scoped approval; independently proven safe rollback/readback preserving the manifest and trigger fingerprint; current authenticated private Brain Service Binding and actual `apps_script` intake; and the live write flag still disabled. Those proofs do not exist today.

`inspectIntegration` is not a substitute for cryptographic verification or trusted data provenance, which must be done upstream in the existing private SQLite Durable Object, identity/OAuth and Cloudflare deployment verification. It only recognizes independently sourced records from trusted private ports. No user-provided JSON can become authorization.

The read-only receipt path now additionally requires an **independent Brain durable receipt readback** (matching event ID, operation correlation, source revision, receipt identity and private transport). A relay's `DURABLE_BRAIN_RECEIPT` string alone is not acceptance. Unavailable or mismatched Brain readback is a reconciliation hold without resend, Google PUT or rollback. The `readBrainReceipt` port must be implemented in the privileged coordinator using an authenticated private binding; no request JSON can supply it.

The actual runtime still lacks the bridge↔Brain Service Binding and verified `apps_script` intake. This intentionally stays OFF. The Google Apps Script Projects API cannot enumerate all installable triggers across accounts or exclude Google IDE/API writers; never treat local SQLite advisory locks as proof. The operator must independently establish these facts before a real comment-only smoke/write/rollback. No automatic retry after uncertain outcome.

## Local tests

`node --test automation/apps-script-final-integration/*.test.mjs`

Tests use synthetic in-memory **proofs** and assert fail-closed behaviors; they are NOT live Google, OAuth, Cloudflare, source/backup, trigger or Brain E2E. The new `merged-contracts.test.mjs` imports the **actual merged #218 and #201 modules** and composes them with only synthetic, in-memory provider/durable ports. It covers success, duplicate event, immutable backup, source drift, lost delivery, mismatched Brain receipt, caller-field rejection and missing binding/capability. This is contract compatibility evidence, not real Google/Brain execution. Inspect #205 separately and have the other owners review this package before integration.

## 2026-11-05 independent access and coverage checkpoint

The following is an explicit distinction between **historical provider-backed observations** and **new live Cloudflare read-only metadata**:

| Boundary | Evidence | Coverage / final status |
| --- | --- | --- |
| Google Admin OAuth | Earlier operator-backed `script.projects` grant, documented in #218/#124; no OAuth access token retrieved or retested in this CI | One designated Admin grant only; scope is historically confirmed, not freshly revalidated |
| Actual Apps Script source | Earlier approved Google `projects.getContent` with **four source files** and one encrypted backup/readback, recorded in #218 | **4 files for 1 known project**; no proof of coverage for all projects or all accounts; current live SHA cannot be asserted here |
| Encrypted source and immutable receipts | Reuse #124 `ScriptEditor`, merged #218 `prepareAppsScriptReceipt` and merged #201 `relayAppsScriptReceipt`; no new backup store or provider | Contract-tested only in this package; no new live backup or Google write |
| Installable triggers | Apps Script Projects API does not provide account-wide authoritative trigger inventory | Cross-account trigger coverage **UNKNOWN**, not 0 triggers |
| External Google writers | No enforced lockout of browser IDE, other users or Google API clients | **NOT EXCLUDED**; the #203 advisory lease is insufficient |
| Live Cloudflare Worker settings | Fresh read-only Cloudflare `GET` on both `archelaos-automation-bridge` and `archelaos-brain-staging` | Both Workers and their own DO bindings exist; **no inter-Worker Service Binding** is configured |
| Brain capability and private intake | Standalone merged code contracts; no trusted read-only E2E event through an actual deployed `apps_script` capability | **NOT VERIFIED** |
| Signed scope, real rollback and Google writer | No new approval, no permitted Google writes in this assignment | **NOT VERIFIED / OFF** |

All read and write authorizations must be re-evaluated using *current, project-bound evidence* before a real write is considered. No synthetic proof record authorizes production activity. Existing Google files, installed triggers, Cloudflare scripts and production settings were **not changed** by this PR.

**Decision: BLOCKED (production and Google writes).** The independent package can be reviewed and merged by its coordinator if its exact-head CI and required checks are green, but merging this package is not equivalent to enabling the real integration. Blockers: a verified private Service Binding, deployed Brain `apps_script` intake, full trigger/writer exclusion, independent signed approval and a separately permitted smoke/readback/rollback with immutable audit. Do not create a second bridge or Apps Script project.
