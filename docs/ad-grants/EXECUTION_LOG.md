# Actual preparation log — 2026-11-03 Europe/Athens

## Ownership and base

Repository `dizigs/archelaos-site`, managed environment `archelaos-site` reused.
Ads branch `codex/ad-grants-dry-run` starts at latest fetched main
`74b6bcb3cc95a6160fb27f298d12f094a2679631`.
Implementation commit: `9673c853c1df5f772d5df3c1131800739bea388d`.
Follow-up validation treats fractional quality scores as unavailable rather than
misclassifying them as policy failures; the executed regression covers this.
The final Issue inventory boundary also rejects non-numeric/boolean/non-positive
issue numbers and unknown states. Its negative regression first reproduced four
failing subcases (including a synthetic raw string appearing as an Issue number),
then passed after validation was added. No real private input was used or published.
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
| `python -m unittest discover -s .github/tests -p test_ad_grants_issue_plan.py -v` | **10/10 pass** |
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

## Completion follow-up — one-command Ads handoff — 2026-11-03

Scope: Google Ad Grants only, continuing draft #70 from `33b7629`. No work on
the separate security/research/analytics PRs. Network policy and account-setup
evidence were unchanged; known failed Google endpoints were not retried.

The separate components now execute through
`bash rebuild/ads/run_dry_run.sh --fixture`. The runner combines fresh sanitized
Ads evidence with the existing GA4/GSC format, builds the candidate script, passes
the validated report to the actual Python Issue planner and finalizes a sanitized
handoff. Account-local `as_of` is included in the collector's safe JSON output.
The wrapper has no HTTP, Google write or Issue-publication operation.

Actual results after this follow-up:

- **17/17 Node tests and 13/13 Python tests PASS**. Three new Python integration
  cases execute the real shell/Node/Python command in disposable workspaces.
- Complete fixture command **PASS**: `DRY_RUN_COMPLETE`, two draft campaigns,
  traffic totals still labelled `conversions: unavailable`, six hypothetical
  Issue creates and `ready_for_live_ads: false`.
- Repeating the full command with the six matching open Issue markers **PASS**:
  zero create plans, six already-open matches. No real Issue was created.
- Real-input command without the required local evidence **fails as expected**:
  `INCOMPLETE`, activation false. The regression first completes a fixture run,
  then confirms that missing real evidence cannot retain the old complete status.
- Stale/future Ads or analytics evidence, synthetic provenance in real mode,
  missing/mismatched/publishable Issue plans and budgeted/importable campaigns
  are rejected in the executed tests. Raw extra input values do not enter the
  public handoff.
- **75 JavaScript syntax checks, ESLint, Bash syntax, Python compile and workflow
  YAML/read-only/no-cron checks PASS**.
- Build and independent release verify **PASS — 15 principal pages, 760 indexed
  profiles**. No production frontend import or historical data change.
- File ownership rechecked: no overlap with #37, #65, #67, #68 or #69.

Captured output:
[`evidence/handoff-tests-20261103.log`](evidence/handoff-tests-20261103.log).
The synthetic audit/traffic data and fixture clock are explicitly labelled;
neither is claimed as real Google account evidence. Current policy review,
account setup, successful live landings, consent/backend receipt/conversion QA
and an authorized Google Ads Preview still require real verification. No live
advertising activation or production tracking was performed. Follow-up remote
CI is pending at this log's commit; the PR description records final-head results.

### Sonar follow-up on the handoff addition

On head `3feb88d`, GitHub check `125740341777` failed with **D Reliability
Rating on New Code, required A**. Its accessible annotations endpoint returned
one finding at `rebuild/ads/prepare_handoff.cjs:25`, issue
`AaGf0nBB_1BHaDNpWJHL`: “Provide a compare function that depends on
String.localeCompare, to reliably sort elements alphabetically.”
The finding was read through GitHub annotations; no blocked Sonar API retry or
Actions log archive was needed. The JSON-field validation now supplies an
explicit `localeCompare` comparator. No suppression, baseline reset or gate
change was made. The existing 17 Node and 13 Python tests were re-run after the
correction and passed; final-head Sonar/CI results are recorded on the PR.


### Serial PR completion checkpoint — 2026-11-04

Updated the existing branch to main70e3c8c;17Node/13Python tests and the full synthetic --fixture pipeline PASS. No source behavior change, policy revalidation claim, live account request, consent/tracking install, campaign/budget/Google Ads Script activation or new schedule. New exact-head CI must finish before source merge; actual account/conversion/legal prerequisites remain operational blockers, not fixture evidence.


### CodeQL stat/read race — actual remediation

Check126697701122 reported a HIGH TOCTOU at prepare_handoff.cjs:60. Three of four new input tests fail on the old stat(path)/read(path) helper; fixed same-descriptor no-follow/bounded reads pass all21Node+13Python tests and full fixture pipeline. Symlink/hardlink, pathname substitution and growth fail safely, no refunds/retries or live activation added. Output directory still assumes a trusted local checkout; no broader directory-jail claim. New exact-head security CI remains required.
