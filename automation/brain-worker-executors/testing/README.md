# Testing executor (read-only, fail-closed)

Independent Brain executor module. It never dispatches workflows, bypasses CI,
changes branch protection, merges PRs, deploys, or publishes check statuses.
The caller must supply a fine-scoped token with **repository metadata, contents
and actions read** permissions; do not log or commit the token.

```js
import { runTestingExecutor } from './index.mjs';
const report = await runTestingExecutor({
  repo: 'dizigs/archelaos-site',
  sha: 'FULL_40_CHARACTER_COMMIT_SHA',
  branch: 'the-tested-branch',
  token: process.env.GITHUB_TOKEN,
});
if (report.status !== 'passed') throw new Error('required CI not verified');
```

The executor requires all of these **existing** workflow files for the **exact
commit SHA**, plus their expected jobs: rebuild-check, axe-accessibility,
lighthouse-ci, eslint-guard, codeql-security (both JS and Python),
javascript-syntax-guard, release-qa and validate-site. It checks GitHub's
repository identity, commit identity, workflow path, source repository, branch
(if provided), GitHub Actions run and attempt IDs, and individual job results.
A successful *workflow conclusion alone* is not enough. More recent failure
supersedes older success. Missing, queued, failed, cancelled, timed-out, skipped,
truncated or untrusted required evidence produces `status: 'blocked'`.

**Operational blocker:** On a PR touching only this directory, the existing
rebuild-check and axe-accessibility workflows are path-filtered and normally
will not fire. Their missing evidence is deliberately **not** counted as a pass.
A separately authorized maintainer/orchestrator must arrange the required
CI execution on the correct SHA before a gate can pass. This module intentionally
has no workflow-dispatch or bypass capability. On a later commit, previous
results cannot be reused because every report is SHA-specific.

`maxPolls` (1–10), `pollIntervalMs` (0–60s), `requestTimeoutMs` (1–30s),
`maxDurationMs` (1–600s), `maxPages` (1–5), `maxRetries` (0–3) impose bounds.
Defaults are 3 polls, 10s intervals, 8s HTTP request timeout, 90s deadline,
3 pages and 2 transient-HTTP retries. All calls use GitHub REST GET only; no
third-party URLs are followed. API failures block; exception bodies and
credentials are never exposed by the returned report.

Run offline with Node 22+: `npm test --prefix automation/brain-worker-executors/testing`.
No API access or npm dependencies are required for mock tests.
