# P0 #66 — advisory event-report confinement — 2026-11-03

Owner: Codex. Coordination: [Issue #71](https://github.com/dizigs/archelaos-site/issues/71).
Original base main: `6e2c85c420c540ae2e3e70fba904c0d8d2b4a6c0` (site-stability #74).
Corrective commit: `10d7f47ca3d9b9136adad9024d54ad3c916c3e5a`.
Reported finding: `pythonsecurity:S8707`, `rebuild/tools/event_triage.py:107`
in #66. A current provider issue ID was not available here; none is invented.

## Confirmed problems

The old `resolve().is_relative_to(REPORT_DIR.resolve())` guard rejected ordinary
outside paths but trusted the resolved report root. In disposable public-only
fixtures, symlinking `rebuild/test-artifacts` to another directory made both
reports overwrite synthetic sentinels outside the fixture checkout. Existing
hardlinked report files also overwrote an outside sentinel: resolving a path
does not reveal its other hardlinks. Destination symlinks to unrelated files
inside the ignored directory were followed too.

The old controller wrote JSON before discovering an invalid Markdown destination,
so rejection could still replace the first report. All these observations are
from real CLI subprocesses, not inferred exploits or production incidents.
No private files or source records were modified.

The initial **8-method** suite produced **10 failing assertions/subcases**. That
count also includes the new fixed-choice/cwd contract and validation-before-write
expectations; it is not a count of ten distinct vulnerabilities. Plain outside
paths and outside destination symlinks were already rejected by the old guard.

## Scoped correction

Reports now use two fixed checkout-relative slots. The existing no-argument
workflow command and artifact names remain unchanged:

```sh
python rebuild/tools/event_triage.py
python rebuild/tools/event_triage.py --json rebuild/test-artifacts/event-review-queue.json --markdown rebuild/test-artifacts/event-review-queue.md
```

Custom filenames, absolute CLI paths and traversal are intentionally rejected.
Both output choices are anchored to the checkout from any working directory.
No caller in the checked repository depended on arbitrary custom destinations.

The code reuses merged #72's no-follow directory-descriptor helper, checks both
report entries before reading/rendering/writing, rejects non-ordinary or
multiply-linked destinations, and atomically replaces each via an exclusive
mode-0600 temporary file and the held parent descriptor. It never opens the
destination for writing. Temporary files are removed on errors. Runtime
filesystem failures exit nonzero with a bounded error class. These descriptor
operations target existing Linux/Ubuntu CI, not Windows.

Replacement is atomic **per file**. It is not a two-file transaction if a later
I/O failure occurs; consumers can compare the existing dataset fingerprint in
both reports. The change does ensure an already-invalid second destination
leaves the first report untouched. The helper's parent-swap regression remains
in the snapshot suite; no new event-specific concurrent-race claim is made.

Assessment rules, source loading, stable event IDs, fingerprint, owner-only
decisions and report content remain unchanged. The existing Rebuild self-test
runs the new security suite without editing the workflow owned by #69 or
creating another scheduled workflow.

## Actual local validation

- Focused real-CLI confinement: **8/8 PASS** after correction.
- Existing triage QA plus integrated security suite: **PASS**.
- Existing owner-decision QA: **PASS**, including no auto-approval, stale and
  blocked decision rejection and dry-run default.
- Combined triage/snapshot/Git security suites on this branch: **22/22 PASS**.
  #77's separate ten mentions tests are not part of this unmerged branch.
- Actual public-catalog CLI: **19 advisory events**, both report byte streams
  identical to unmodified main output, source catalog SHA-256 unchanged.
- Build and independent verification: **15 pages/760 profiles PASS**.
- Python compilation and diff checks: **PASS**.

Main advanced through ChatGPT footer #78 to
`f2507575ca52dfac24d01f55381c6aff2c38a869`; this branch includes it unchanged.
Latest-main triage/owner tests, build/verify and footer tests were executed
separately; their exact captured results are in the evidence log. Browser CI
and provider confirmation must be reported on the actual PR head, not inferred.

Captured baseline/recovery output: [task self-heal evidence](evidence/event-triage-20261103.log).
This dedicated log keeps errors, causes, corrective SHA and retests mergeable
without concurrently editing the shared `docs/PR_SELF_HEAL_LOG.md` or
`docs/WORK_LOG.md` while another PR owns those files.

## Remaining verification

Current main `f250757` Sonar check `125780700256` is **FAILURE**,
`C Security Rating on New Code (required ≥ A)`. No suppression, baseline reset,
new key, dependency, private data, history edit or Quality Gate change. A PR pass
will not establish main A. Production logs for this change are **NOT VERIFIED**;
no second merge is performed while previous exact-commit production verification
is outstanding. Fresh full Sonar inventory remains requested through #71.

## Initial remote result and integration with #77

Exact initial head `43650698791d71200afcf68430d5a82187c880a9` completed
remote checks without failure: Sonar `125782321322` PASS; full Rebuild
[41595610331](https://github.com/dizigs/archelaos-site/actions/runs/41595610331)
PASS; strict [41595610640](https://github.com/dizigs/archelaos-site/actions/runs/41595610640)
annotations report 49/49, 72 page/viewports, 608 cards, Chromium 145.0.7632.6 /
Playwright 1.58.0; accessibility 32/0 findings/errors. This is historical-head
evidence, not substituted for the new synchronized head.

Included normal #77 main merge `a60a840775b853eae5d11750eaa4576adaeff83c`
through local merge `2f84756dcfea13f9be3bdec0bd5e2eef50af7c33`. New actual
combined security tests now **32/32 PASS** (triage 8 + mentions 10 + snapshot 10 +
Git 4), both integrated entrypoint tests and owner-decision QA PASS; build and
independent release verify 15 pages/760 profiles PASS. Captured results appended
to the evidence log. The shared self-heal file now indexes both task-specific
records after checking that no other active PR owns that file. Git's expected
invalid-ref rejection in combined output is explicitly identified there.

New main Sonar check `125785270406` still FAILS; #66 stays open. Fresh combined
PR-head CI/review and actual a60a840 production logs remain pending, so no second
merge is performed. No workflow, historical-source or other PR-owned file edits.

## Changed-base duplication failure and shared-writer recovery

Head `0171e0814b2e7f7b370bf1d30708db22c5abe425`, check `125786409534`,
failed the unchanged Quality Gate: **7.6% new-code duplication, maximum 3%**.
No annotations exposed the exact duplicate blocks. Source inspection found
repeated atomic-writing logic after including merged #77. Codex recorded
TEST_FAILED in [#71](https://github.com/dizigs/archelaos-site/issues/71#issuecomment-6598050678),
checked ownership, then refactored the actual copies instead of changing gates.

Correction `aad0651f4ca17a5c17a87d879f9f6a8c0cf15c61` shares one bounded
writer and destination validator in public_snapshot.py across snapshot, mentions
and triage. Driver-specific CLI/directory choices remain closed. The shared
primitive also validates its five approved names independently; traversal and
unknown names fail before any write. Existing interrupted-write and parent-swap
tests remain active, with the temporary-file cleanup assertion updated to the
shared prefix. No extra module/dependency or workflow was needed.

Actual corrected local results: **34/34 combined security tests**, all three
integrated entrypoints and owner-decision QA PASS, build/verify 15 pages/760
profiles PASS, Python compilation/diff PASS, both 19-event outputs byte-identical
and source unchanged. Snapshot/shared primitive now has 12 tests, mentions 10,
triage 8, Git 4. Captured output follows in the evidence log. New-head remote
Sonar/CI still needs real verification; no current pass is inferred here.
