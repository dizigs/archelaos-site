# Cross-PR Builders & Testing Acceptance — review only

This package intentionally owns **only**
`automation/brain-worker-executors/acceptance/**` and the new independent
`.github/workflows/brain-builder-acceptance.yml`. It does not edit the Brain,
existing dispatcher, provider adapters, Testing executor, other workflows, or
any source owned by the active PR teams.

## Verified inputs and provenance
`sources.json` locks the exact GitHub commit SHAs of PR #209 (scaffold),
#214 (Gemini), #211 (Gemma), #212 (Testing) and #213 (Integration).
CI checks out these exact SHAs into five separate directories, verifies each
local Git HEAD, and reads back each current source PR HEAD using read-only
GitHub API. **Any moved, closed, non-draft or forked source PR fails closed**.
Update a pin only after reviewing and re-testing the changed source.

## Synthetic acceptance
Run on the GitHub Actions Node 22 runner:
```bash
node automation/brain-worker-executors/acceptance/verify-pins.mjs
node automation/brain-worker-executors/acceptance/verify-source-heads.mjs
node --test automation/brain-worker-executors/acceptance/*.test.mjs
```
The verify scripts require the five pinned checkout directories and the PR
readback step requires only the standard read-only GitHub Actions token.
Native source PR test suites are also rerun from their immutable checkouts.

Cross-PR tests import **actual modules**, not copied implementation code. They
exercise Gemini generateContent mock response parsing, Cloudflare Gemma binding
mock response parsing, normalization by the independent integration coordinator,
Brain receipt rejection, immutable SHA and file-scope constraints, pricing
reservations and receipts, retry/timeout bounds already covered by native
source tests, the exact GitHub Actions Testing executor with eight mocked
workflows/jobs, independent run-attempt readback, skipped/missing/wrong-SHA/newer
failure gates, two concurrent build locks, replay and UNKNOWN leases, and
central EUR20 monthly hard-cap contracts.

Mock authorization and prices prove only the interfaces. They do **not**
verify real account access, provider billing, shared ledger persistence,
credentials, live GitHub workflow availability, deployed Cloudflare bindings,
or actual integration with the runtime Brain. Native provider adapters own
their own reservation/settlement callbacks: the #213 coordinator correctly
**blocks** their direct nesting to prevent double reservations. An audited,
single-budget-owner adapter must exist before enabling live routing.

## Safety and release criteria
- No network calls to Google or Cloudflare AI. No paid inference. GitHub API
  use is **read-only** and only for verifying PR HEAD provenance.
- No shells or generated code execution from any model output; no merge,
  deployment, code writes, auto-created PRs or production settings.
- Max **2** concurrent builds with scope exclusion and held UNKNOWN leases.
- One shared **EUR20/month** atomic Brain ledger, never two local ledgers.
- The eight required CI workflows and their exact jobs must be green at the
  **same immutable commit SHA**. Skipped, missing, untrusted, duplicates,
  mismatched repository/run-attempt or failed runs remain blocking.
- A PASS from mocked synthetic CI does **not** mean live E2E, deploy approval,
  production readiness or permission to merge.

Source PRs are independently owned. Re-pin and re-run after any upstream update.
