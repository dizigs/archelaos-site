# Actual preparation log — 2026-11-03 Europe/Athens

## Ownership and base

Repository `dizigs/archelaos-site`, managed environment `archelaos-site` reused.
Ads branch `codex/ad-grants-dry-run` starts at latest fetched main
`74b6bcb3cc95a6160fb27f298d12f094a2679631`.
Implementation commit: `9673c853c1df5f772d5df3c1131800739bea388d`.
Follow-up validation treats fractional quality scores as unavailable rather than
misclassifying them as policy failures; the executed regression covers this.
No direct main push, merge, external activation or production tag change.

GitHub API successfully read #66, open PRs, their files, check outputs and Actions
jobs. File-set comparisons confirmed **zero overlap** with active #37, #65, #67
and #69. In particular #67's GA4 workflow and scripts, #37's `docs/WORK_LOG.md`,
release builder and all historical data are unchanged. This separate log avoids
editing the shared active work log.

## P0 first

Before Ads implementation, opened independent
[PR #68](https://github.com/dizigs/archelaos-site/pull/68), branch
`codex/p0-cli-confinement`, commit
`29867d7db8a04ba55d48351f211b85b07728539e`.
A controlled disposable-repository reproduction against pre-fix source actually
created a file via Git's `--output` option. The correction allowlists refs/blob
paths and resolves immutable commit IDs. All 4 real-Git security tests and actual
`--strict-reviewed` integration pass; the latter retains 135 editorial differences
and zero missing reviewed corrections, without rewriting them.

On that exact PR head, required syntax/ESLint, Sonar PR gate, actionlint, zizmor,
security regressions, release build, Chromium desktop/mobile, Lighthouse and axe
checks passed; Imgbot was skipped. Example evidence:
[security run 41542837249](https://github.com/dizigs/archelaos-site/actions/runs/41542837249),
[Rebuild 41542837163](https://github.com/dizigs/archelaos-site/actions/runs/41542837163),
[Actions audit 41542837149](https://github.com/dizigs/archelaos-site/actions/runs/41542837149).
No merge was performed. A passing **PR** Sonar check does not establish main A:
main check `125583156246` on `74b6bcb` remains **failure, C required A**, with zero
annotations. #66 and the other findings remain open. Direct Sonar status API
retrieval failed at the proxy with CONNECT 403, as recorded in #68's separate
`docs/security/P0_CLI_CONFINEMENT_LOG.md`.

## Existing Google reporting: verified scope

Read main `.github/scripts/google_aggregate.py` and its workflow. OIDC, readonly
Google scopes, 28-day aggregate range ending D−3, GA4 traffic totals, GSC daily
totals and 14-day artifact retention exist. Manual main run
[41422510038](https://github.com/dizigs/archelaos-site/actions/runs/41422510038)
has actual success for identity federation, export and upload steps (job
`125201192865`). No report contents, visitor data or credentials were accessed.
The later PR #67 run is not used as evidence of a production Google export.
The existing exporter has no verified conversion event/Ads attribution fields.
No second scheduled workflow was added, and no #67 file was modified.

## Actual Ads-preparation tests

| Command/check | Observed result |
| --- | --- |
| `node --test rebuild/ads/tests/core.test.cjs` | **10/10 pass**, zero skips/failures |
| `python -m unittest discover -s .github/tests -p test_ad_grants_issue_plan.py -v` | **9/9 pass** |
| `python rebuild/tests/security_workflows_test.py` | **3/3 existing regressions pass** |
| `node rebuild/ads/build_preview.cjs` + `node --check` on its output | **PASS**, inert bundle in ignored test-artifacts |
| `python .github/scripts/ad_grants_issue_plan.py --fixture` | **PASS**; six hypothetical plans from synthetic findings; `can_publish: false` |
| Same synthetic findings after supplying their open Issue markers | **PASS**; all six already-open, zero duplicate-create plans (covered by test) |
| Node syntax over tracked/new source JS/CJS/MJS | **73/73 pass** |
| Existing ESLint config, `rebuild` scope | **PASS** |
| Python compile for new planner/tests | **PASS** |
| Workflow YAML, read-only permissions, absence of schedule | **PASS** |
| `build_release.py` and independent `verify_release.py` | **PASS**, 15 principal pages and 760 indexed profiles |
| Built dist search for Ads package/bundle paths | **No matches**; package is not deployed or imported into the frontend |
| Whitespace and active-PR file overlap checks | **PASS** |

The [captured test output](evidence/offline-tests-20261103.log) is from executed
commands, not fabricated live Google logs. Ads/URL/CTR findings in fixtures are
explicitly synthetic. The real collector is tested through strict readonly mock
adapters, including its GAQL date range and GET restrictions; Google Ads Scripts
runtime/API compatibility remains unverified. No Google Ads preview, real
conversion, Issue write, production deployment or live campaign was executed.
Ads-branch remote CI is pending at this log's commit; consult the draft PR's
checks at its current exact head for subsequent results.

## Actual access failures and unavailable evidence

- `GET https://support.google.com/grants/answer/9042207`: `curl: (56) CONNECT
  tunnel failed, response 403`, `server: envoy`. Destination network restriction
  before HTTPS to Google; current official policy review **BLOCKED**. The
  provisional rules and authoritative reference list are in POLICY_REVIEW.md.
- `GET https://sonarcloud.io/api/qualitygates/project_status?projectKey=dizigs_archelaos-site&branch=main`:
  same CONNECT 403, distinct from a GitHub integration-permission denial. Used
  available GitHub check summary instead; no invented missing annotations.
- Direct GETs of `https://www.archelaos.club/tmimata.html`, `/contact.html`,
  `/index.html`, `/history.html`: each returned `HTTP Error 403: Forbidden`.
  That probe retained no headers, so origin/WAF/proxy cause is **unknown**; it
  does not prove Google permissions missing or a broken landing. A distinct
  `HEAD https://archelaos.club/` returned **301** to `https://www.archelaos.club/`.
- No unchanged failed endpoint was retried. No detailed Actions log archive was
  requested; available run/job/step/check metadata was sufficient for the
  recorded CI observations. Account setup, ad approvals, Google receipts,
  conversion exports and Cloudflare production state are not asserted.

## Remaining handoff

Continue P0 #66 through independently reviewed/tested PRs and verify a new main
Sonar A gate. Keep this Ads PR draft until policy verification, account setup,
landing checks, backend receipt/dedup and consent QA are complete. Coordinate
the single future daily-consumer hook with #67's owner after that PR stabilizes.
The museum primary conversion remains unset. No financial, advertising,
tracking or Issue-publication activation follows from these passing offline
tests. No keys, real account IDs, personal data, biographies, news or historical
records were added or changed.
