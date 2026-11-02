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
