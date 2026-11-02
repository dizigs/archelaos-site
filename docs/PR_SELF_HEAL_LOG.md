# PR self-heal log — 2026-11-02

Scope: dizigs/archelaos-site. Record only evidenced failures, reproducible causes, corrective commits and CI outcomes. Never claim Cloudflare deployment success from GitHub logs.

## PR #9 — Security/accessibility
- Failure: axe workflow run 41414656393 job 125175467880: `Please use browser.newContext()`. Cause: `browser.newPage()` created default page context incompatible with @axe-core/playwright. Fix: explicit `browser.newContext()`, `context.newPage()`, and close context in `.github/scripts/axe_audit.cjs`. Commit `2d10a2c`. Verified: axe audit passed on subsequent run 41520287999.
- Failure: actionlint workflow run 41520287986 job 125534248057: `.github/workflows/free-actions-audit.yml:27` YAML parsing failure. Cause: partly double-quoted `run` scalar with `-color` outside the closing quote. Fix: quote the entire shell command as a YAML scalar. Commit `99b7d7c`. Outcome: new CI verification pending.
- Failure: actionlint on run 41521020591 job 125536746316: ShellCheck SC2046 on unquoted `$(go env GOPATH)`. Fix: correctly double-quote the executable path inside the YAML shell scalar. Commit `05d368f`. Verification pending.
- Finding: security audit run 41521020612 zizmor job 125536745584 reports numerous pre-existing unpinned `uses:` references and checkout credential-persistence warnings across existing workflows. To preserve immediate reports while avoiding blocking unrelated PR work, the existing-repository scan is explicitly `continue-on-error` and remains annotation/console-visible. This is outstanding security debt; it is **not remediated** by this change. Commit `05d368f`; follow-up should pin verified action SHAs and reduce credentials across all workflows before converting the audit to blocking.
- Prevention: keep actionlint mandatory for changes to workflows and explicit contexts for axe; never treat report-only accessibility findings as deployment failure.
- Merge state: waiting for full checks and GitHub branch protection.

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
