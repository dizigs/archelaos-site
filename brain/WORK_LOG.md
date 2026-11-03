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

Final documentation/evidence and exact-head review of111 complete this offline
delivery stage. After actual access changes, deploy only the reviewed staging
candidate, execute the prepared HTTP duplicate/retry/DLQ/pause proof, obtain real
provider logs/exact SHA, then connect one source at a time with rollback. Private
tracker readback and ambiguous publication outcomes remain explicit integration
tests. Additional knowledge retrieval can use the existing main knowledge schema
in an independent package; do not duplicate or edit active self-heal owners.

No second competitive PR, direct main push, actual source/AI call, production
content change or new paid service was introduced by this work.
