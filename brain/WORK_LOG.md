# ISS-108 brain implementation log — 2026-11-03

Single owner/PR: Codex, `codex/brain-core-staging`, [#111](https://github.com/dizigs/archelaos-site/pull/111).
This log records verified checkpoints. Follow-up exact-head evidence is posted
in Issues108 and71. No mock, schedule, local test or PR preview is a remote
deployment, source trigger, private Sheet write or completed production migration.

## DONE — independent implementation packages

1. **P1 core:** HMAC intake, strict bounded metadata, three independent dedupe
   keys, retained event envelope, real SQLite queue/audit, alarm outbox, durable
   leases, retry/DLQ/quarantine and status inspection.
2. **P5-OPS controls:** separate operator/source credentials, durable global and
   per-source pause, compare-and-swap revisions, health/version checked explicit
   resume, no paid-AI resume, pause while claimed without a duplicate effect.
3. **P2 source ports:** Drive channel/approved-feed/cursor processing; Gmail
   OIDC/subscription/label/history pagination; backend contribution receipt/scan/
   consent; GitHub HMAC/repo/fork/self-loop filtering. Disabled without explicit
   authorization and actual connector ports. Synthetic integration uses native
   core receipts and persisted SQLite source checkpoints.
4. **P3 enrichment:** authorized read, actual byte hash, structured extraction
   and injected PDF extractor port, independent public-release fact registry,
   canonical person mapping, history/Hall/stories/news draft selection, canonical
   event identity, preview/result update and stale-preview protection.
5. **P3 workflow/publisher:** persisted consumer work journal and draft registry;
   concurrent replay suppression; end-to-end native queue→verified draft→one
   explicitly mocked Draft PR. Default publisher emits a dry-run plan. Live
   content publication is not configured or represented as completed.
6. **P4 budget:**20EUR/month, integer microEUR, Europe/Athens calendar, model/
   price/FX/fixed-fee evidence, atomic cross-provider reservations,75/90alerts,
   stable event/revision/operation binding, one-time call claim, conservative
   unknown-outcome hold and settlement. Gateway denies pause, missing coverage,
   ledger/alert failure, replay and live/unconfigured provider before invocation.
   All provider calls in gateway tests are explicitly synthetic; external AI0.
7. **CI:** new read-only/no-cron brain-core workflow, real npm lockfile, no
   lifecycle scripts, syntax check of all22 modules, actual workerd/SQLite tests,
   numeric TAP notice, Python provider-evidence checks and credential-free
   Wrangler compilation. Existing production workflow changes were removed from
   the final diff.

## Actual test checkpoints

| Source | Execution | Actual result |
|---|---|---|
| Initial core | Local native workerd/SQLite |17 tests PASS, including concurrent duplicates, actual restart, alarms, DLQ and budget concurrency |
| Emergency controls | Local native runtime |26 tests PASS |
| Adapters and content | Local native runtime plus injected source ports |46 tests PASS |
| Binary reader/existing event preparation | Local runtime suite |48 tests PASS |
| Retained-envelope consumer integration | Local runtime suite |49 tests PASS |
| AI gateway | Local runtime suite |54 tests PASS, plus2 Python evidence tests |
| `5df8861` crash boundaries | [41665470797](https://github.com/dizigs/archelaos-site/actions/runs/41665470797), check126019476681 |Actual annotation:57 tests/pass57/fail0/skipped0 |
| `1f4a7b598fc37150a5023db48bf8d9b37cdf42bd` fixed fees/provenance | [41666350571](https://github.com/dizigs/archelaos-site/actions/runs/41666350571), check126022587511 |Actual annotation:58 tests/pass58/fail0/skipped0; Python2, syntax22 and Wrangler dry-run steps PASS |

The last row is the tested code checkpoint. Its final frozen local rerun also passed all58 Node tests,2 Python tests,22 module syntax checks, pinned actionlint and diff checks. All19 exact-source check runs completed without failure/pending. See `evidence/frozen-source-tests-20261103.json` for numeric counts and source-file hashes. Subsequent documentation/evidence
commits do not fabricate a new test result; their own exact-head CI remains
visible on PR111 and the final handoff in71/108.

## Errors, cause, correction and retained evidence

- Initial npm metadata read failed `EROFS` opening
  `/home/agent/.npm/_cacache/tmp/...`. Changed the command to the task-specific
  writable `/tmp/archelaos-brain-npm` cache; actual install/lockfile succeeded.
- Initial Wrangler dry-run failed creating `/home/agent/.config/.wrangler`.
  Supported `WRANGLER_LOG_PATH` and per-command `XDG_CONFIG_HOME` were directed to
  task-specific `/tmp` paths. Dry-run then compiled the real21KiB Worker, with no
  provider write. Proxy/CA settings and TLS verification were preserved.
- Source778f927 Sonar125938725255 reported Reliability D: unqualified
  metadata-key sorting in `contract.mjs`. Replaced sorting with explicit
  allowlisted-key membership; no suppression or gate change.
- Source1fd8136 Sonar125951634149 reported Security B: proof CLI logging remote
  response data and an unsafe backtracking privacy regex. Source8626877 replaced
  CLI output with a fixed PASS marker, and privacy checks with bounded/constant
  operations. Corrected Sonar125953847681 PASS; later exact-head gates also pass.
- One local development run accidentally observed files while pricing guard
  edits were in progress:52pass/5fail. It is **not coherent snapshot evidence**.
  Immutable CI at5df8861 independently passed all57 tests. A clean, frozen-source
  rerun and immutable new-head CI were required, rather than hiding the failures
  or changing assertions/thresholds. No source is edited during final validation.
- Provider access failures are exact403 observations, not runtime success.
  Inventory41641089600 and separate Pages authentication41642204232 are retained
  in `evidence/provider-access-20261103.json`; see `docs/ACCESS.md` for endpoint and
  official permission mapping. No failed Workers/subscription request was retried.

## BLOCKED — separate operational prerequisites

- Remote staging: existing Cloudflare token authenticates to Pages200 but
  tested Workers/account/DO/subscription operations return403. No remote Worker
  installation or provider runtime logs have been verified. Free-plan entitlement
  is unknown. No permissions, DNS, paid plan, secret or subscription was changed.
- Real Drive/Gmail watch/renewal, upload receipt backend, webhook bridge and
  authorized private tracker connector are not configured. Existing automations
  remain active. `TRACKER_SYNC_BLOCKED` does not mean a Sheet write occurred.
- Real PDF/OCR/source readers, approved release/identity evidence and real
  content publishing require source authorization and review. The default
  `PRIVATE_REVIEW` and dry-run boundaries remain intentional.
- Real AI provider/model/pricing/billing-account coverage and live invoice
  reconciliation are unverified. Charged execution remains OFF; this package
  cannot police unseen spend outside an authorized shared gateway.

## IN_PROGRESS / NEXT

Additional independent PDF package: pinned `unpdf`2.1.0, actual binary PDF text
extraction, embedded-script nonexecution, size/page/text bounds and deterministic
approved-quote mapping. First PDF suite4pass/1fail exposed a fixture/view-box
privacy limitation: off-page text can be omitted by PDF text extraction. Strengthened
the source boundary with independent, hash-bound whole-file privacy approval;
an extractor cannot self-certify the document. Corrected six-case PDF suite PASS,
including default refusal without that independent approval. Corpus/OCR, encrypted
or unsupported documents remain PRIVATE_REVIEW. Final combined CI is rechecked
after this additional package; earlier58-test evidence is retained as a checkpoint.

Final documentation/evidence and exact-head review of111 complete this offline
delivery stage. After actual access changes, deploy only the reviewed staging
candidate, execute the prepared HTTP duplicate/retry/DLQ/pause proof, obtain real
provider logs/exact SHA, then connect one source at a time with rollback. Private
tracker readback and ambiguous publication outcomes remain explicit integration
tests. Additional knowledge retrieval can use the existing main knowledge schema
in an independent package; do not duplicate or edit active self-heal owners.

No second competitive PR, direct main push, actual source/AI call, production
content change or new paid service was introduced by this work.

## DONE — final independent PDF checkpoint

Source `d77c10c4d5244619b9780f9f3e468f5e4cf219d6`: full frozen local suite64/pass64/fail0/skipped0; Python2 PASS; syntax24 modules PASS. Immutable CI [41669323491](https://github.com/dizigs/archelaos-site/actions/runs/41669323491), check126033130645 emits the same actual64-test summary. Sonar126033797138 PASS. Runtime npm audit reports0 vulnerabilities; the new read-only CI checks runtime dependency advisories without modifying dependencies. Actual PDF six-case suite PASS. Evidence and source-file/lockfile hashes are in `evidence/pdf-source-tests-20261103.json`.

DONE: independently testable core/adapters/content/AI-guard/PDF packages are delivered in the same111. IN_PROGRESS: final documentation-only head CI/review. BLOCKED: real Cloudflare installation/logs, source/tracker permissions and real provider/billing verification only. NEXT: approved staging setup and one-by-one real source integration/rollback, keeping all current automations active. No new failed provider calls, production/secret/billing/DNS writes or competing PR.


## 2026-11-04 — staging access refresh and dual budget guard (local checkpoint)

- DONE: preserved existing PR111/source and synchronized main78770a7 without replacing completed modules. Eight other active PRs checked: zero brain/workflow overlap; docs/WORK_LOG.md belongs to #124 and is left untouched. New dedicated read-token evidence in #71/run41725833411 supersedes the old credential's Workers denial for READ only; no write/free-plan entitlement inferred.
- TESTED: three new actual SQLite tests FAILED before the new OpenAI allocation guard and PASS after it: concurrent reservations stop at EUR15, alerts75/90 and settlement survive restart, raised cap rejected and other providers reduce the shared EUR20 headroom. All OpenAI usage conservatively counts toward Codex15; unknown outcomes stay reserved. Synthetic-only gateway remains mandatory and delivers allocation alerts. No API key connected or paid execution.
- TESTED: five Python provider tests PASS, pinned actionlint PASS. Added manual-only staging-readiness input/job to the existing brain workflow, using the already-authorized dedicated READ token step-locally after runtime tests. Four fixed staging/account metadata endpoints; no bridge access/source/secrets, Billing requests, write/plan changes or new schedule. Read success is explicitly not deployment readiness; free SQLite entitlement, staging write access and independent staging secrets remain unverified.
- IN_PROGRESS: frozen full suite and exact-head CI; new-condition read-only inventory after push. Remote deployment/health/DO runtime/synthetic remote event: NOT DEPLOYED / NOT VERIFIED. UptimeRobot and supervisor execution ports remain NEXT; bridge key and user-reported API secret are not copied or invoked.


## 2026-11-04 — verified read access, remote staging absent

- DONE / actual new-condition provider evidence: [run41746767910](https://github.com/dizigs/archelaos-site/actions/runs/41746767910), exact source d6562ab3af0ceeac85013135f2d36f8de5bbed1b. runtime126301628185 reports67/pass67/fail0/skipped0; Python5, syntax24 and Wrangler no-deploy compilation PASS. Nineteen source check runs succeed / three skip; no offline result is a remote success.
- staging-readiness126301889108 succeeds ONLY as read inventory: Workers account/subdomain/DO listing200; namespaces0; staging settings404/provider code10007. New dedicated read token legitimately changed conditions from old403; no bridge or billing endpoint touched. [Captured provider notice](evidence/staging-read-access-20261104.json).
- NOT DEPLOYED / BLOCKED: staging Worker absent, independent staging keys, scoped Workers write/log authority and verified free SQLite entitlement missing. No fake health/runtime logs or paid plan activation. [Evidence-backed readiness report](docs/STAGING_READINESS_20261104.md) specifies actual deployment/rollback gates, secure key-retaining UptimeRobot design, bounded supervisor/executor handoff and remaining implementation work. Existing Gmail/Drive/contribution/GitHub modules are reused, not rebuilt or activated.
- Latest user security-CI task is isolated in PR127; P0/other branches remain untouched. Shared docs/WORK_LOG.md is handled by its expressly assigned security/bridge work; this brain record stays within111. No new Worker, production migration, source ingestion, secret copy, email/file write or charged API execution.


## 2026-11-04 — fail-closed missing source scope at the AI gateway

- During final source review, added a positive control for the existing per-source pause (already passed) and a missing-source negative case. The latter reproduced one synthetic invocation when sourceType was absent. No live provider exists or was invoked.
- Added an explicit approved-source guard before controls/reservation/provider work. Unknown/missing source returns SOURCE_SCOPE_UNVERIFIED; existing valid source pauses remain unchanged. Seven actual SQLite-backed gateway tests PASS, syntax24/diff PASS. Final exact-head CI must run the full69-test suite; prior67 results are retained as a dated checkpoint, not relabelled.
- This stays within111-owned brain files. Security127 remains isolated and has its own exact-head handoff with two real external/ownership blockers. No API key, billable executor or production source is connected. Remote staging remains absent/NOT DEPLOYED per actual provider notice; readiness report and67-test provider run remain valid source checkpoints.
