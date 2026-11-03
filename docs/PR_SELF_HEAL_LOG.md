# PR self-heal log — 2026-11-02

Scope: dizigs/archelaos-site. Record only evidenced failures, reproducible causes, corrective commits and CI outcomes. Never claim Cloudflare deployment success from GitHub logs.

## PR #9 — Security/accessibility
- Failure: axe workflow run 41414656393 job 125175467880: `Please use browser.newContext()`. Cause: `browser.newPage()` created default page context incompatible with @axe-core/playwright. Fix: explicit `browser.newContext()`, `context.newPage()`, and close context in `.github/scripts/axe_audit.cjs`. Commit `2d10a2c`. Verified: axe audit passed on subsequent run 41520287999.
- Failure: actionlint workflow run 41520287986 job 125534248057: `.github/workflows/free-actions-audit.yml:27` YAML parsing failure. Cause: partly double-quoted `run` scalar with `-color` outside the closing quote. Fix: quote the entire shell command as a YAML scalar. Commit `99b7d7c`. Outcome: new CI verification pending.
- Failure: actionlint on run 41521020591 job 125536746316: ShellCheck SC2046 on unquoted `$(go env GOPATH)`. Fix: correctly double-quote the executable path inside the YAML shell scalar. Commit `05d368f`. Verification pending.
- Finding: security audit run 41521020612 zizmor job 125536745584 reports numerous pre-existing unpinned `uses:` references and checkout credential-persistence warnings across existing workflows. To preserve immediate reports while avoiding blocking unrelated PR work, the existing-repository scan is explicitly `continue-on-error` and remains annotation/console-visible. This is outstanding security debt; it is **not remediated** by this change. Commit `05d368f`; follow-up should pin verified action SHAs and reduce credentials across all workflows before converting the audit to blocking.
- Prevention: keep actionlint mandatory for changes to workflows and explicit contexts for axe; never treat report-only accessibility findings as deployment failure.
- Merge state: waiting for full checks and GitHub branch protection.

- Merge blocked (HTTP 405), despite successful required checks on `ed0070c`: GitHub reported `mergeable_state=behind`, and ruleset `26357426` enforces `strict_required_status_checks_policy=true`. Synchronized the PR head with latest main `0878345` using GitHub-generated merge commit `5d01c14` (parents verified, fast-forward update with expected old head). Do not disable branch protection. A fresh checks run is required on the updated head.

- CodeRabbit review findings (4 unresolved threads): preserve full axe `incomplete` array (commit `198f2bd`), add axe script and direct source pages to PR/push path triggers, and wait for HTTP server readiness before scanning (commit `54cd02a`); the earlier YAML quoting finding was already addressed by `05d368f`. Review threads must be resolved after verifying the changes to satisfy branch rules.

## PR #10 — Visitor smoke / sitespeed
- Failure: initial merge attempt rejected by repository rule with two required status checks pending. Required names: `JavaScript syntax (all site scripts)` and `ESLint JavaScript quality`.
- Cause: required checks were not present on the original PR head; a refreshed PR head `377d048` triggered both checks. Verified: both checks passed on run set for head `377d048`.
- Outcome: remaining workflow checks must finish; no branch-rule bypass.

## PR #16 — Consent animation
- Pending full checks and compatibility assessment with latest main.

## PR #37 — Contribution pipeline
- Draft, privacy-sensitive. No merge until verification of input controls, event dedupe, tests and safe operation.

## Self-heal protocol
1. Save PR number, workflow/run/job ID, exact error and affected file.
2. Diagnose from logs; never guess a root cause.
3. Make smallest scoped change on PR branch; record commit.
4. Re-run/observe required checks; block merge if failed, missing or pending.
5. Promote only after verified CI and branch protections; note that successful merge is not proof of production deployment.


## Site stability audit — 2026-11-03 — `codex/site-stability-audit`

**Base:** latest fetched main `74b6bcb3cc95a6160fb27f298d12f094a2679631`. Scope is the real local `dist/` release, not a production deployment. No historical registries, source profiles, private data or Draft #37 changes. No CSS/design changes.

**Corrective commit:** [`c44404b4586826963435f23c0bf4a80fd25ad2c2`](https://github.com/dizigs/archelaos-site/commit/c44404b4586826963435f23c0bf4a80fd25ad2c2) (`fix(ui): stabilize shared navigation and archive dialog state`).

| Confirmed problem | Reproduction and cause | Scoped solution in c44404b | Actual regression result |
| --- | --- | --- | --- |
| Mobile/tablet drawer stays open and locks the page after selecting a same-document section | On `/index.html`, open the menu and select `/index.html#about`: hash changes while drawer remains open and `arch-dialog-open` stays set. The controller relied on a page reload and had no link-selection close path. | `rebuild/js/shell.js` closes the drawer on ordinary link selection before native navigation; modified/new-tab clicks keep normal semantics. Focus restoration uses `preventScroll` so it does not undo fragment navigation. | Failed on baseline at 320, 390 and 768 px; all three pass after correction, including visible target section, reset aria-expanded and scroll unlock. |
| Desktop disclosure does not close with Escape | Focus a link inside an expanded desktop archive menu and press Escape: native details remains expanded. No keyboard dismissal handler existed. | Scoped nav key handler closes the expanded disclosure and returns focus to its summary. | Baseline fails at 1365 px; corrected build passes. Drawer handling also passes at 1249 px. |
| Opening another story starts at the previous story's reading position | Open a long real story, scroll to its end, close and open the next story. At 320 px the next story inherits scrollTop 2732 rather than zero. The shared dialog body is reused without resetting its scroll. | `rebuild/js/components.js` resets body scroll after rendering/opening every record; focus changes do not scroll the background page. | Baseline fails at all four viewport sizes; corrected build starts each new story at scrollTop 0. |
| Canonical biography popup allows background scrolling and nested modal locking is inconsistent | Open interview q1, then its real biography link. The biography opens natively but does not acquire the shared scroll lock. Direct browser probing also moved the background by 500 px while a biography was open. | `assets/hof-inplace.js` acquires the lock on open and synchronizes native dialog lifecycle events after target handlers. The lock remains while a parent dialog is open and clears when the final dialog closes. | Baseline fails at all four sizes. Corrected tests verify stationary background, biography close preserving the interview, and final parent close unlocking the page. |

### Verified test evidence

- **Red/green comparison:** identical `site_stability.cjs` harness against a detached, unmodified main build and the corrected build. Baseline: **25 cases, 12 failures** covering the four problems above. Corrected: **25/25 cases pass, 72 page/viewports, 608 card surfaces, zero failures**. All 18 rendered HOF cards and all 21 story cards are opened and closed at each of four viewport sizes, with close-button/Escape and focus restoration checks.
- **Viewports:** 320×568, 390×844, 768×1024, 1365×850, plus the 1249 px navigation breakpoint. Coverage includes the 15 principal pages, privacy, 404 and a standalone biography. Long real biography titles, native top-layer dialogs, clipping boundaries, horizontal overflow, disclosure markers and navigation/card hover styling are checked. No evidenced title clipping, horizontal overflow, duplicate arrows or unwanted navigation/card underlines required a CSS change.
- **Build:** `python rebuild/tools/build_release.py` and `python rebuild/tools/verify_release.py` pass: **15 principal pages and 760 indexed profiles**.
- **Syntax:** `node --check` passes on **70 tracked/new JavaScript, CJS and MJS source files**, including the changed global biography asset. **ESLint passes** with the existing `eslint.config.mjs` over `rebuild`.
- **Existing release browser suite:** `rebuild/tests/release_smoke.cjs` passes desktop/mobile and the profile route, including favorites, related records, menus and existing popup behavior.
- **Existing responsive quality suite:** `rebuild/tests/quality.cjs` passes **84 page/viewports, 23 internal destinations, zero warnings and zero errors**.
- **Existing visitor smoke:** `.github/scripts/visitor_smoke.cjs` passes **10/10 page/viewports**, with the JSON report checked for nonempty errors rather than trusting its report-only exit status.
- **Additional real browser assertions:** **12 backdrop-closing paths** across four widths pass, including nested biography → interview → page scroll-lock restoration.
- **Workflow integration:** the existing visitor-experience workflow runs the new strict regression suite against its local server and uploads its report/screenshots. Workflow YAML parses, and `git diff --check` passes. Triggers and permissions are unchanged.

### Reproduction and limits

Run a server for `dist/` on port 8766, then `node rebuild/tests/site_stability.cjs`. The workflow supplies `SITE_STABILITY_BASE_URL=http://127.0.0.1:8765` for its existing server. Reports/screenshots are gitignored under `rebuild/test-artifacts/site-stability/`; the baseline report is retained locally in `/workspace/archelaos-stability-before/rebuild/test-artifacts/site-stability/report.json`.

Local execution used Playwright **1.58.0** and installed system **Chromium 154.0.8037.57**, selected through the external `/workspace/onboarding/system-chromium.cjs` helper and `NODE_PATH`; no machine-specific browser path or dependencies were committed. The new suite blocks external resources for deterministic local UI checks. Its title checks inspect actual clipping boundaries, avoiding false positives from visible font-ink overhang; native close-state assertions wait for asynchronous aria updates.

**Delivery:** branch commit/push only, as requested. No PR creation, main push, merge, rule bypass or deployment. GitHub required checks, the CI browser binary, other browser engines/physical devices and production behavior remain to be verified when ChatGPT opens the PR and after a protected deployment. Final corrected local tests have zero failures; the 12 baseline failures are intentional reproduction evidence, not unresolved corrected-build failures.


## Site stability follow-up — 2026-11-03 — News reader

**Branch:** `codex/site-stability-audit`; continued from audited head `f7a07fa`, without changing main, Draft #37, public historical data or private sources.

**Fix commit:** [`08f62ca8327c0ff865fdd05118d40fc9eb49f837`](https://github.com/dizigs/archelaos-site/commit/08f62ca8327c0ff865fdd05118d40fc9eb49f837) (`fix(ui): reset news reader position between articles`).

- **Confirmed failure:** Open an article in `/news.html`, scroll its reader to the bottom, close it, then open another article. The second article starts partway down instead of at its heading. The initial real-UI probe measured retained offsets of 497 px (390 px viewport), 413 px (768 px), and 426 px (1365 px). A deterministic regression using two long, verified-public article records reproduced the same defect at all four audited sizes; its desktop offset was 232 px instead of zero.
- **Cause:** `assets/news.js` reuses `.an-dialog-inner`, replacing article contents without resetting this separate scroll container. The sticky close toolbar remains visible, so focusing its button does not restore the article's beginning. The earlier shared `arch-dialog-body` correction did not cover this independent news reader.
- **Solution:** After opening/rendering the selected article, reset `.an-dialog-inner.scrollTop` to zero and focus the close control with `preventScroll`. The comment about biography nesting now reflects the shared native-dialog scroll-lock lifecycle. No content, markup, styling or historical facts changed.
- **Regression:** Added `news-scroll-reset` to `site_stability.cjs` at 320, 390, 768 and 1365 px. Fixtures are selected from two long public articles in the actual built news JSON, so newer short announcements cannot silently remove scroll coverage. The test uses the real news search and article links, checks the new record starts at zero, checks background scroll locking, and closes with Escape. A case selector supports focused debugging; an empty selection fails rather than reporting false success.
- **Test infrastructure:** Release smoke and responsive quality accept the same optional `SITE_STABILITY_BASE_URL`, preserving the original 8766 default. Local continuation used an isolated server on 8786 after the old local preview endpoint stopped responding. This is a test-server setup detail, not a production-site failure or a change to CI defaults.

**Actual results:**

| Check | Result |
| --- | --- |
| New targeted regression against the unchanged reader | 4 cases, 4 expected failures |
| Final full stability suite | **29/29 pass; 72 page/viewports; 608 card surfaces; zero failures** |
| Build and independent release verify | **PASS — 15 principal pages, 760 indexed profiles** |
| Syntax, all tracked JS/CJS/MJS source | **PASS — 70 scripts** |
| ESLint, existing config and rebuild scope | **PASS** |
| Existing release smoke, including search/favorites/profile flows | **PASS — desktop/mobile and profile route** |
| Existing responsive quality audit | **PASS — 84 page/viewports, 23 internal destinations, zero warnings/errors** |
| Whitespace check | **PASS** |

Local execution again used Playwright 1.58.0/system Chromium 154 through the external helper, without committing browser paths or dependency changes. Reports remain gitignored under `rebuild/test-artifacts/`; expected failing screenshots were retained separately under `/tmp/archelaos-stability-baseline-images` so they cannot be mistaken for final failures. No PR or deployment was performed. Remote CI and production/other-browser confirmation remain pending the ChatGPT-created PR.


## Site stability follow-up — 2026-11-03 — Delayed biographies and interview focus

**Branch:** `codex/site-stability-audit`. **Corrective commit:** [`289c71b304bda37a7cfa3fab59d5fb6c04558b1c`](https://github.com/dizigs/archelaos-site/commit/289c71b304bda37a7cfa3fab59d5fb6c04558b1c) (`fix(ui): cancel stale biographies and preserve interview focus`). No historical data, CSS, private sources, main or Draft #37 changes.

| Confirmed problem | Cause and actual reproduction | Scoped correction in 289c71b | Actual test result |
| --- | --- | --- | --- |
| A delayed biography appears after the visitor dismisses its parent interview | Hold the real public Hall catalog response, open interview q1 and select its biography, dismiss the interview, then release the response. The biography unexpectedly opens, locks the background and takes focus. The loader only checked whether another biography request superseded it. | Capture the originating control and its open parent before awaiting data. Discard the opening if the control was detached or the parent was dismissed; preserve the existing latest-request guard and shared data cache. The click handler passes its actual link explicitly, including on devices that do not focus links on click. | Before correction, `dismiss-pending-biography` fails at 320, 390, 768 and 1365 px. Final tests pass all four, using close buttons and Escape, with no delayed popup/scroll lock and a successful intentional second opening. |
| A delayed biography from the previous interview appears over a different interview | While the same catalog response is held, close q1 and open q2 before releasing it. The shared parent dialog is open again, but the clicked q1 link belongs to replaced content. | The disconnected-origin check rejects the stale q1 opening even though the reused parent is open for q2. | Before correction, `replace-pending-biography` fails at all four widths. Final tests keep q2 open, preserve its scroll lock/focus and do not open the stale biography. |
| Closing an interview loses focus instead of returning to its card | A browser probe confirmed focus fell to the body after closing. A separate regression opening/closing real interview cards fails at all four widths. The body-class observer called `sync()` for every class change, so native-dialog scroll locking rebuilt the card list and detached `lastFocus`. This was exposed after suppressing the delayed popup. | Filter body-class observations to changes in the existing `lang-en` flag, retaining language updates while avoiding card replacement on unrelated scroll-lock changes. | Four targeted pre-fix focus cases fail. Final `interview-focus-restoration` cases pass for q1 and q2 at all four widths; delayed-request tests also preserve card/current-dialog focus. |

**Reproduction evidence:** three separate targeted reports each contain **4 cases / 4 expected failures**, recorded before the corresponding correction. They are local regression evidence, not a claim that an unmodified main ran the final 41-case suite. Reports are retained as `/tmp/archelaos-pending-biography-baseline.json`, `/tmp/archelaos-replaced-biography-baseline.json` and `/tmp/archelaos-interview-focus-baseline.json`. The controlled response gate uses the actual built public catalog; it simulates latency without arbitrary sleep or a production write.

**Final verified results after both corrections:**

| Check | Actual result |
| --- | --- |
| Strict Playwright stability suite | **41/41 pass; 72 page/viewports; 608 card surfaces; zero failures** |
| Release build and independent verification | **PASS — 15 principal pages, 760 indexed profiles** |
| Node syntax, all tracked JS/CJS/MJS sources | **PASS — 70 scripts** |
| ESLint, existing config over rebuild | **PASS** |
| Existing release smoke | **PASS — desktop/mobile and profile route** |
| Existing responsive quality audit | **PASS — 84 page/viewports, 23 internal destinations, zero warnings/errors** |
| Whitespace check | **PASS** |

Execution used the same external Playwright/system Chromium helper documented above and a local dist server on 8796 through `SITE_STABILITY_BASE_URL`. No browser paths or dependency changes were committed. Final `rebuild/test-artifacts/site-stability/report.json` was independently checked for 41 passing cases; only successful biography screenshots remain in that directory. Failing screenshots are preserved separately under `/tmp/archelaos-pending-biography-baseline-images/`. Remote CI, other browser engines/physical devices and production deployment remain unverified.

**Overnight handoff:** commit `8caebcf` first published the nine ordered ChatGPT work packets in the existing `docs/AUTOMATION_PLAN.md`, including deliverables, existing approvals, exact BLOCKED handling, required-check protection, privacy and ownership boundaries. The checkpoint is now READY for the next session. This is a prepared work queue; no separate ChatGPT session or scheduler was started. Delivery is a normal commit/push to the audit branch; PR creation stays with ChatGPT as requested.


## Site stability completion / Issue #71 coordination — 2026-11-03

The subsequent user instruction explicitly assigns PR creation to Codex and uses
Issue #71 for every handoff, superseding the earlier ChatGPT-only PR-creation
step. The original seven stability commits were preserved. Main was merged
normally, first at `0e76754` (local merge `9d453a4`), then at actual snapshot
merge `7f89c55a2b93a368806105325bb5000d5f739a18` (local merge `0d6c665`).
No main push, history rewrite or change to other PR branches.

**Test-integration commit:** [`88529b8adbe865b62303a4c9f4e6e33b70694511`](https://github.com/dizigs/archelaos-site/commit/88529b8adbe865b62303a4c9f4e6e33b70694511).
Actual PR-file comparison identified `.github/workflows/visitor-experience.yml`
as owned by #69. Removed only this branch's earlier additions to that workflow;
its final diff against main is empty. New regressions run in the separate
`site-stability-regressions.yml` on PR/main/manual events, with **no cron**.
Its action SHAs match the existing maintained Rebuild pins; checkout credentials
are not persisted. `npm ci --ignore-scripts` uses the real generated lockfile
under `rebuild/tests/browser` (Playwright 1.58.0, axe-core 4.10.3); browser install
uses the locked local CLI, not ad-hoc npx. The actual regression report records
the browser and Playwright versions. Accessibility accepts the same optional
`SITE_STABILITY_BASE_URL` as the other release tests, preserving its 8766 default.

### Executed local results

| Check | Result |
| --- | --- |
| Full strict regressions after main sync | **41/41 PASS; 72 page/viewports; 608 card surfaces; zero failures** |
| Accessibility, WCAG/keyboard/landmarks | **32 page/viewports PASS; zero axe findings; zero interaction errors** |
| Existing release smoke | **PASS — desktop/mobile and profile route** |
| Responsive quality | **84 page/viewports, 23 internal destinations; zero warnings/errors** |
| Latest-main build and independent release verification | **PASS — 15 principal pages, 760 profiles** |
| Existing/new CLI security tests inherited from main | **14/14 PASS** |
| Tracked JavaScript syntax + existing ESLint scope | **70 scripts PASS; ESLint PASS** |
| Workflow YAML/read-only permissions/no-cron and lock install | **PASS** |

Local browser execution used the newly locked Playwright **1.58.0** with system
Chromium **154.0.8037.57** through an external `/tmp` launcher helper and an
isolated local dist server on 8896. No machine-specific path was committed.
axe-core **4.10.3** ran against the actual built release. The later main sync
contains only the independently tested snapshot security changes; the UI source
and data exercised by the browser runs are unchanged. Final-head remote CI must
still re-execute the combined branch with the CI browser binary.

No file overlaps remain with #37/#65/#67/#69/#70 or the new ChatGPT-owned footer
PR #73. The footer changes are complementary shared-DOM work; new base changes
still require fresh combined checks before merge. Its HTML/support-footer files
were not edited. No historical records, news data or private sources changed.

Remote CI/review is pending at this log commit. PR creation and exact-head
results are delivered as `[CODEX-HANDOFF]` comments to Issue #71. Production
Cloudflare deployment/build logs are **NOT VERIFIED**; local/preview success
does not establish a live deployment. No merge is claimed here.

### First strict CI result and diagnostic access — PR #74

Head `f316db0105c1f1fb0552bf49064b1bdbd508b0e5`, run `41587132055`,
job/check `125755157873`: install, locked Chromium, build and server readiness
PASS; the strict regression step FAILS with exit 1; the later axe step is skipped.
GitHub annotations expose only the exit code and Ubuntu migration notice. Local
Chromium 154 passes do not substitute for this failed CI browser run. The actual
failing case is not yet known and no product cause is inferred.

The retained public regression artifact is ID `13208516877`, 1,230,437 bytes.
One request to `GET /repos/dizigs/archelaos-site/actions/artifacts/13208516877/zip`
followed GitHub's authorized redirect but was blocked with `Forbidden` at
`productionresultssa1.blob.core.windows.net`, a destination outside the current
network policy. This is the redirected download route, not a missing GitHub
PR/read permission. The signed URL was not published and the failed request was
not retried. Detailed log archives have the previously recorded network limit.

The harness now emits bounded per-case failure annotations (case, width, actual
browser version, assertion text), escaping percent signs and JSON line breaks.
This is a diagnostic change, not a claimed UI fix; it allows the next changed-head
CI to identify the actual assertion through the accessible check-annotations API.
All existing assertions/failure exits remain in place. `TEST_FAILED` was delivered
to #71 at https://github.com/dizigs/archelaos-site/issues/71#issuecomment-6596709335.

### Actual CI assertion identified and corrected — synchronous news lock

The diagnostic-only changed head `fca75864e6ee46ca7b667ff210cbac250db6e1fe`
produced an actionable annotation in run `41588056106`, check `125758064763`:
`news-scroll-reset`, width **768**, browser **145.0.7632.6**, assertion
`false !== true`. This case's boolean assertion is the news background scroll
lock. The news controller showed the modal without acquiring that lock itself;
it depended on the later native `toggle` event and the shared lifecycle listener.
The local Chromium 154 timing had concealed the gap.

Added `news-immediate-scroll-lock` at four widths. It snapshots the real click
handler's synchronous result before native event tasks can run, without mocks,
arbitrary delays or relaxed assertions. Against the unchanged reader it fails
**4/4** with `{open:true, locked:false}` on the locally available Chromium 154.
Baseline report: `/tmp/site-stability-news-lock-baseline.json`; failing screenshots
were moved to `/tmp/site-stability-news-lock-baseline-images/`.

**Corrective commit:** [`720e61fdfaa109e7bc02da079c4067a2f73db54c`](https://github.com/dizigs/archelaos-site/commit/720e61fdfaa109e7bc02da079c4067a2f73db54c).
`assets/news.js` now adds the shared lock during `show()`, immediately after
`showModal()` and before focus/scroll reset. Existing shared close/nesting
synchronization remains. No CSS, content or historical data change.

Actual corrected local results: **45/45 strict cases PASS**, still 72
page/viewports and 608 cards; **32 accessibility page/viewports, zero findings or
errors**; release smoke PASS; responsive quality **84 page/viewports, 23 links,
zero warnings/errors**; build/verify **15 pages/760 profiles PASS**; all **70
source syntax checks**, ESLint and diff checks PASS. The original CI assertion
and all earlier checks remain; four stronger cases were added.

Official managed Chromium download was also attempted once at the URL returned
by the locked Playwright CLI's dry-run:
`https://cdn.playwright.dev/chrome-for-testing-public/145.0.7632.6/linux64/chrome-headless-shell-linux64.zip`.
It returned `curl: (22) The requested URL returned error: 403`; headers for the
final layer were not retained, so no authentication/root-cause claim is made.
It was not retried. Final Chromium-145 CI validation is still required.

To make final results visible without blocked archives, the harness and the
existing accessibility audit now emit bounded aggregate notice annotations
(case/failure/card/page counts and actual browser version; a11y finding/error
counts). This changes observability, not failure policy. Local captured output
is in `docs/qa/site-stability-local-20261103.log`. The exact corrected remote-head
result and remaining production limit are delivered through #71 and PR #74.

### Verified CI recovery and review follow-up — PR #74

- Failed run: [41588056106](https://github.com/dizigs/archelaos-site/actions/runs/41588056106), check `125758064763`; exact annotation `news-scroll-reset`, width 768, Chromium 145.0.7632.6, `false !== true`. Cause and correction `720e61f` are recorded above.
- Verified recovery: exact head `6849f97f9d517ec7c43f205ed7a163d216502e5e`, [41589852619](https://github.com/dizigs/archelaos-site/actions/runs/41589852619), check `125763824280` SUCCESS. Accessible notices report **45 cases, zero failures, 72 page/viewports, 608 card surfaces, Chromium 145.0.7632.6 / Playwright 1.58.0**; axe reports **32 page/viewports, zero violations/errors**. Full Rebuild [41589852607](https://github.com/dizigs/archelaos-site/actions/runs/41589852607) and required checks PASS. No log archive retry was needed.
- Review gate: thread `PRRT_kwDOVW_yv86zAQkJ`, comment `4451579402`, correctly found missing root build-input paths. `build_release.py` consumes `news.json`, `news.html`, `hall-of-fame-people.json` and `interviews.json`; their omission could skip this regression workflow after a data-only change.
- Corrective commit: [`418714f24f3d461ceb2b60560a05bec1a567aba4`](https://github.com/dizigs/archelaos-site/commit/418714f24f3d461ceb2b60560a05bec1a567aba4) adds all four to both PR/push filters. It also adds four real news-origin delayed-biography cases: dismiss the original news reader, open another article, release the pending catalog, verify no stale biography opens, then verify a new intentional biography click works. No product assertion was weakened.
- Actual follow-up tests before footer sync: focused new cases **4/4 PASS**, full suite **49/49 PASS**, same 72 page/viewports and 608 cards; YAML filter assertions, syntax/ESLint/diff PASS. This is local Chromium 154 evidence, distinct from the earlier 45-case Chromium-145 CI.
- Main advanced through ChatGPT-owned #73 to `9127d45974188075e6c1f0fe722e111a4d7dbca0`. Merged unchanged into this branch as `680e32fdb9c949abc9705e8d4470b513cbee9769`; combined browser validation is pending at this log entry. Footer source was not edited. #75/#76 research data remains owned by ChatGPT.
- Cloudflare: ChatGPT supplied provider evidence for **#73/main 9127d45 only**, deployment `4caf3332-d2dd-40ec-b823-81149ce3e70a`, with final `Success: Your site was deployed!`, via [Issue #71 comment](https://github.com/dizigs/archelaos-site/issues/71#issuecomment-6597244703). Codex did not fetch these provider logs independently. This does **not** verify deployment of the still-unmerged #74.

### Keeping self-heal evidence mergeable

For every newly confirmed failure, append the exact error and endpoint or workflow/run/check ID, affected head, evidence-backed cause (or UNKNOWN), corrective commit, actual retest and remaining blocker here or in a linked task-specific security log. Preserve failed attempts and distinguish local/PR/main/production outcomes. Never include credentials, signed download queries or private data. Changes enter main through the owning normal PR; do not edit another active PR's shared log or claim completion from a green preview.

Related P0 evidence already merged: [CLI option confinement](security/P0_CLI_CONFINEMENT_LOG.md) and [snapshot confinement](security/PUBLIC_SNAPSHOT_CONFINEMENT.md). Separate CLI follow-ups keep their evidence in dedicated files to avoid concurrent edits to this shared log.

### Combined latest-main validation — PR #74

After merging main `9127d45974188075e6c1f0fe722e111a4d7dbca0` (footer #73),
the actual rebuilt release passes **49/49 strict cases**, **72 page/viewports**,
**608 card surfaces**, and **32 accessibility page/viewports with zero violations
or interaction errors**, on local Chromium 154 / Playwright 1.58.0. Build and
independent verification pass with **15 pages / 760 profiles**. All **3 footer
regression tests PASS** without modifying ChatGPT's footer source. Captured
combined output is appended to `docs/qa/site-stability-local-20261103.log`.
Final-head remote Chromium-145 CI remains required after this push.

The actual current-main Sonar check `125768928878` on `9127d45` is **FAILURE**,
`C Security Rating on New Code (required ≥ A)`, zero annotations. PR success
from another head is not substituted for this result. No gate changes, generic
exclusions or repeated blocked provider calls were made.

## P0 #66 — mergeable CLI security evidence — 2026-11-03

These are confirmed defects reproduced in disposable public-only fixtures, not
claims of a production exploit. Logs retain the initial failures and retests.

| Confirmed failure / cause | Corrective source commit | Actual recovery and integration | Detailed evidence |
| --- | --- | --- | --- |
| Public mentions accepted arbitrary registry/report paths; following output links could overwrite an outside sentinel. | `171e31c9eb815d1ac9d3ef5031c6581f7ad05433`: reviewed registry, bounded single-link input, closed output choices, held no-follow parent and atomic report replacement. | Focused 10/10 and combined Git/snapshot/mentions 24/24 PASS. Exact PR head `e627a58` passed full CI, including managed Chromium 145 strict 49/49 and a11y 32/0. Normal protected #77 merge: main `a60a840775b853eae5d11750eaa4576adaeff83c`, 2026-11-03T07:26:56Z. | [Cause and compatibility](security/PUBLIC_MENTIONS_CONFINEMENT.md), [actual failed/corrected output](security/evidence/public-mentions-20261103.log). |
| Advisory event reports trusted a symlinked report root after resolving it; hardlinked destinations overwrote outside fixtures. An invalid second destination could leave JSON already replaced. | `10d7f47ca3d9b9136adad9024d54ad3c916c3e5a`: fixed JSON/Markdown slots, both entries checked before any write, descriptor-anchored atomic replacement per file. | Focused 8/8 PASS; after including merged #77, combined triage/mentions/snapshot/Git **32/32 PASS**. Both actual 19-event reports are byte-identical to prior main and source checksum unchanged. Existing owner-decision tests PASS. #79 remains unmerged pending latest-head checks/provider integration eligibility at this entry. | [Cause and contract](security/EVENT_TRIAGE_CONFINEMENT.md), [actual failed/corrected output](security/evidence/event-triage-20261103.log). |

The triage baseline's 8 methods / 10 failing assertions include the new closed
choice/cwd and validate-before-write contract; it is not ten distinct exploits.
Atomic replacement is per report, not a two-file transaction on arbitrary later
I/O failure. Advisory assessment, owner decisions and historical data are
unchanged. No workflow edit, extra schedule, secret or suppression was added.

Combined logs contain Git's expected `fatal: Needed a single revision` from the
negative invalid-ref fixture. The unittest result is PASS; that intentional
rejection is not a new runtime failure or an automatic repair trigger.

Current main `a60a840` Sonar check **125785270406 FAILURE** remains distinct
from successful PR checks. Main A/full P0 completion is **not** claimed. Actual
production provider logs for this new main remain **NOT VERIFIED** here; the
previous ChatGPT report for f250757 does not establish a60a840's deployment.
[Merge and exact verification handoff](https://github.com/dizigs/archelaos-site/issues/71#issuecomment-6597920659).

### Access errors: retain the endpoint and responsible layer

The following GitHub administration requests were previously observed returning
HTTP 403 with **`Resource not accessible by integration`**:

- `GET https://api.github.com/repos/dizigs/archelaos-site/branches/main/protection`
- `GET https://api.github.com/repos/dizigs/archelaos-site/actions/permissions`
- `GET https://api.github.com/repos/dizigs/archelaos-site/actions/permissions/workflow`
- `GET https://api.github.com/repos/dizigs/archelaos-site/actions/secrets`
- `GET https://api.github.com/repos/dizigs/archelaos-site/actions/variables`

These were authenticated GitHub API responses indicating insufficient integration
permissions for those endpoints. They do not establish a network failure or a
general authentication failure. Normal repository API reads, checks/annotations,
branch pushes, comments and protected PR merges now succeed in this session.
The failing administration requests were not repeated under unchanged conditions;
their current administrative scopes are not independently revalidated here. No
secret values were requested or published. Effective branch rules were read from
the accessible `/repos/dizigs/archelaos-site/rules/branches/main` endpoint.

The previously attempted direct Sonar request
`GET https://sonarcloud.io/api/qualitygates/project_status?projectKey=dizigs_archelaos-site&branch=main`
failed with **`curl: (56) CONNECT tunnel failed, response 403`** at the network
proxy, before an authenticated Sonar application response. The host is outside
the managed allowlist; this is network access evidence, not a Sonar credential
or GitHub permission diagnosis. No unchanged retry, proxy bypass or gate
weakening was used. Current GitHub Sonar check summaries remain accessible but
do not provide a fresh full issue inventory.

The artifact redirect and managed-browser download errors are documented above:
artifact `GET /repos/dizigs/archelaos-site/actions/artifacts/13208516877/zip`
passed GitHub authorization then failed at the blob destination; the separate
CDN HTTP 403 lacks final-layer headers and its responsible layer remains UNKNOWN.
Signed URLs, credentials and private data are excluded. Per-case annotations and
aggregate notices supplied the real failing case and final counts when detailed
archives were unavailable.

### PR #79 — actual duplication gate failure and shared implementation

- Failed head `0171e0814b2e7f7b370bf1d30708db22c5abe425`, Sonar check
  `125786409534`: **`7.6% Duplication on New Code (required ≤ 3%)`**, zero
  annotations. This occurred after including merged #77; the former #79 head's
  pass did not establish a pass on this new base. Repeated atomic-writer code
  was present in snapshot, mentions and triage; detailed provider block locations
  were not accessible, so no exact duplicate-line map is claimed.
- Corrective commit `aad0651f4ca17a5c17a87d879f9f6a8c0cf15c61` removes the
  three copies in favor of one bounded `validate_reports`/`replace_report`
  primitive beside the existing no-follow descriptor helper. Every caller keeps
  its own closed CLI choices and fixed directory mapping. The shared writer
  itself rejects every name outside the five reviewed report filenames.
- Fresh ownership checks confirmed the now-merged #72/#77 files had no other
  active PR owner before this refactor. No workflow, threshold, exclusion,
  baseline or historical data changes. This is a real implementation reduction,
  not a suppression.
- Actual local recovery: **34/34 security tests PASS** (triage 8, mentions 10,
  snapshot/shared writer 12, Git 4). The suite retains actual interrupted-write
  cleanup and parent-swap tests, plus two new shared filename/approved-slot tests.
  All three integrated self-tests and owner-decision QA PASS; build/independent
  verify 15 pages/760 profiles PASS. Both real 19-event reports remain byte-identical
  to prior main, source unchanged. Compilation/diff PASS. New-head remote Sonar
  and combined CI remain pending at this log commit; the old failed result is
  not overwritten or retried unchanged.

### Verified shared-writer recovery and new-main synchronization — PR #79

Exact head `6f0984ee16f47f430686829bcfef6dd4e0884e0c` completed all checks
without failure: actual Sonar **125789211671 PASS**, **0.0% new-code duplication**,
0 new/accepted issues and 0 hotspots. Full Rebuild
[41597757776](https://github.com/dizigs/archelaos-site/actions/runs/41597757776)
and strict [41597757704](https://github.com/dizigs/archelaos-site/actions/runs/41597757704)
PASS. Strict notices: **49 cases/0 failures, 72 page/viewports, 608 cards**,
Chromium 145.0.7632.6 / Playwright 1.58.0; a11y **32/0 findings/errors**.
Required syntax/ESLint, release integrity and remaining checks PASS; no unresolved
review threads. This verifies correction of the actual 7.6% failure without
changing the 3% gate. [Actual recovery handoff](https://github.com/dizigs/archelaos-site/issues/71#issuecomment-6598135095).

Before completion, main advanced through ChatGPT's spelling-only #80 to
`d328e798db3e135acb184cd721593fa9f012ed94`. Its canonical/search/offline/profile
changes were inspected, imported unchanged, and share no source path with this
security PR. No name, record ID or historical source was edited by Codex. Fresh
combined-head CI is required after this synchronization; the previous-head pass
is not substituted. Actual current-main production logs and full remaining
Sonar issue context remain pending here.

## Multisport master self-heal — deployment evidence gate — 2026-11-03

Owner Codex; independent of Draft #90's registry/policy/preview files. Existing
collector supplies metadata only; a green inventory job does not establish
production SHA, terminal build logs or public HTTP health. Implementation
`44ae87c47ccfae4f75c2f68a10877be0eef0fb9f`, compatibility
`d160f7392b9c05e9239fa49b16c03110e444e143`, adds the fail-closed read-only
verification gate to the same Cloudflare workflow and original cron. No new
schedule, DNS/service configuration, secret or access-permission change.

Actual offline fault injection verifies rejection of preview/old success, wrong
SHA, incomplete stages, missing terminal logs, later failure, unhealthy HTTP,
forbidden redirects, missing credentials and unsafe report links. Exact access
endpoints/layers are retained; arbitrary response messages, raw build logs, tokens
and signed queries are not. Shared atomic writer reused; legacy report field
names preserved. No main A, deployment or full self-heal success claimed yet.

Actual tests: **30/30** new tests, **34/34** existing CLI security, **24/24** observer,
build/verify **15 pages / 763 profiles**, syntax/YAML/diff PASS. These are local
results on starting main `0b19941dbf668dc7ca0670fc31d164fd2adc5060`; synthetic
403s are not real access observations. Remote CI and a real existing-workflow
run are next. [Contract and remaining work](self-heal/DEPLOYMENT_EVIDENCE.md);
[actual local output](self-heal/evidence/deployment-gate-local-20261103.log).
[Started checkpoint](https://github.com/dizigs/archelaos-site/issues/71#issuecomment-6601163597).

### Actual production evidence from the new read-only gate — PR #101

Existing workflow **41622405981**, code head **96393c2b6db78b77ed18f556eadf1bac750c35c7**,
job/check **125871159545 SUCCESS**. It actually verified main
**65f7e34ea692436d16ddeac395a9a1dbcc7fd3d8**, production deployment
**60cc4e0e-9eb4-4bc7-a7f1-b85a8d283a56**, required stages and actual terminal
provider logs (`Assets published!` / `Your site was deployed!`,
2026-11-03T10:47:46.572313Z / 10:47:47.671656Z), followed by official HTTP **200**
and static main/shell landmarks. Full sanitized proof is committed under
[self-heal evidence](self-heal/evidence/deployment-gate-live-20261103.json).
No synthetic result or preview was substituted; no provider configuration changed.
The report's production commit differs intentionally from the unmerged verifier
source commit. Main Sonar125870971530 remains C/FAILURE, PR Sonar125871130588 PASS.
Notice observability is extended to include stage states and normalized log hash;
new final-head CI and actual read-only dispatch will validate that changed source.
Controller/real fault-to-deduplicated-repair-PR acceptance is still subsequent work.

### PR #101 — scanner finding despite successful job, corrected without suppression

Actual zizmor **125870780098** reports failure-level **dangerous-triggers** at
cloudflare-pages-status.yml:11 for workflow_run, although the enclosing existing
scanner job concludes success. Recorded TEST_FAILED in
[Issue #71](https://github.com/dizigs/archelaos-site/issues/71#issuecomment-6601886450);
real provider proof does not waive a code-security finding.

Correction **cfb555f3631cf39c5a4d54772d5b035858043de2** removes that trigger and
uses a local reusable verifier after all three existing Rebuild jobs, only on
protected-main pushes. No permission expansion, new scheduler, scanner exception
or release write. Fresh ownership check before editing the Rebuild workflow
found no other active PR owner. Local YAML/needs/main-only/read-only/original
cron checks, 30/30 fault tests and 24/24 observer tests PASS. Actual new-head
scanner/full CI and post-merge wiring must still be observed.

### PR #101 — exact linter failure and compatible correction

Actual head10f471d failed actionlint125878721382 and Static Actions125878721012.
Pinned actionlint1.7.11 reproduced: reusable workflow call `$/...` does not match
`owner/repo/path/to/workflow.yml@ref` or `./path/to/workflow.yml` [workflow-call].
Annotations exposed exit1 only, so the exact pinned official binary was used
locally, SHA256 verified from GitHub release metadata. A prior local Go build
attempt returned `Go: Unknown option: mod`; it was not repeated.

Correction3921c361122506e1356bc5d11c41019e400298a7 restores supported `./` local
syntax. Actual local actionlint exit0 and 30/30 tests PASS; no linter exclusion.
The self-repository style recommendation and pre-existing Rebuild adhoc-packages
warning remain visible; a future toolchain update is a separate task. Actual
check125875932363 no longer reports the failure-level dangerous trigger.
[Exact diagnostic evidence](self-heal/evidence/actionlint-reference-20261103.log).
A second real read-only provider proof, run41623179200/check125873805311, is
recorded with all stage values and log hash under the dedicated evidence folder.
No provider/production configuration or required check was changed.
# 2026-11-03 — central-site durable controller and real repair drill (#105)

- Scope: central site now; reusable department hooks only. No department pages,
  subdomains, DNS, identity/history edits, advertising or consent activation.
- Problem: the existing shell monitor had within-run PR lookup but no persistent
  reservation/cooldown journal, and could mark a source check recovered merely
  because a repair PR was proposed. GitHub-token PR creation also does not assure
  that required Actions checks run.
- Solution: controller/GitHub journal/isolated fixture in commits
  `0a7e0258e1f5d4d182ec590436c3897468b2546f`,
  `7cdb4cb50a9e1aecf37f88768a1daff2e1d813a5`,
  `6242e105d81925cfb16c2055a75dc0e9f717fb5d`; existing main monitor replacement and
  durable once-only dispatch/adoption of four existing CI workflows in
  `7c8a6d6e791ae497b738d98a031fe4cc6ba51405`. No new cron. A failed health observation
  stays failed while a draft repair is pending. Unknown faults only get diagnosis.
- Real acceptance run: [41632129693](https://github.com/dizigs/archelaos-site/actions/runs/41632129693),
  source `cbc0770e89c7963270ab6f5f5004e1212303e1da`, check125904077757 SUCCESS.
  One injected escaped newline, independent guard exit1/findings1 before;
  exit0/findings0 after, exact baseline restored, idempotent. One repair, Issue106,
  Draft107 head `108d0a821a03f7a7fd61934efc7b7e8425c43dd6`. Fresh durable-journal
  replay SUPPRESSED, zero write attempts. Actual evidence:
  `docs/self-heal/evidence/central-fixture-20261103.json`.
- Independent second Actions run41633605768/check125909156657 also SUCCESS:
  reloaded the actual GitHub journal, reused Draft107, zero repair executions and
  zero API write attempts across the entire run. Captured separately in
  `docs/self-heal/evidence/central-fixture-cross-run-20261103.json`.
- Existing exact-head #107 syntax/ESLint, release integrity and Rebuild including
  Chromium desktop/mobile checks were actually dispatched and all10 observed
  check runs completed without failure. The new dispatcher adopted those four
  existing workflow runs rather than launching duplicates. A subsequent replay
  leaves the dispatch journal unchanged. Fixture107 remains Draft, never main.
- Isolation: Draft107 targets `codex/self-heal-staging-central-news-20261103`,
  changes only `self-heal-fixtures/news-head.html`, and must never be merged into
  main. It is not an outage or production deployment.
- Actual failure: #105 source400d7fb Sonar check125904119179 reported Reliability C,
  four annotations: three structured guard-comparison conditions and one identical
  expression assertion. `65955ef` replaced those conditions with explicit exit-code
  checks and tested canonical policy key ordering. Corrected source Sonar passed;
  no exclusions, threshold edits or retries of unchanged failed calls.
- Regression coverage: 51 controller/backend/CI/main-adapter tests plus4 existing
  PR-lookup tests, 4 existing allowlisted-fixer tests, 2 real-source fault injection
  tests and30 provider tests pass locally. Build/verify15 pages/763 profiles,
  source/dist HTML guard and pinned actionlint1.7.11 pass. Exact final-source remote
  CI remains a review gate and is tracked in #105 and #71; dispatch is never logged
  as a passed test.
- Provider component #101 was normally squash-merged as
  `4ffe67fe607c7aa26169f5b20a7a559923870ad9`, without bypass/direct push. Actual
  post-merge Rebuild41632395881 succeeded including Chromium desktop/mobile and
  reused provider gate125907387507. Deployment87480969-f2fb-423e-98e1-208918e7c83f
  matches that exact main; all five stages successful; real terminal provider log
  `Your site was deployed!` at12:03:24.003438UTC and separate official-root HTTP200.
  Sanitized proof: `docs/self-heal/evidence/deployment-post-merge-20261103.json`.
  This verifies that main, not deployment of unmerged #105 or fixture107.
- Remaining P0: main4ffe67f Sonar125905680141 still Security C required A (#66).
  Controller main activation, final CI/review and independent post-merge observer
  verification remain gates. No authorized Live Sheet connector: NOT UPDATED.
