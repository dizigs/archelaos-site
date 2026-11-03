# P0 #66 — public mention CLI confinement — 2026-11-03

Owner: Codex. Coordination: [Issue #71](https://github.com/dizigs/archelaos-site/issues/71).
Original base main: `7f89c55a2b93a368806105325bb5000d5f739a18` (merged #72).
Corrective commit: `171e31c9eb815d1ac9d3ef5031c6581f7ad05433`.
Reported finding: `pythonsecurity:S8707`, `AaGbWnBcJDrY7EFXJ07a`,
the `public_mentions.py` CLI filesystem sink identified in #66. This is
independent of research data, analytics and the site-stability PR.

## Confirmed failure and cause

The old CLI accepted arbitrary `--config` and `--output` paths, read the former
with `Path.read_text` and wrote the latter with `Path.write_text`. Real subprocess
runs in disposable synthetic public fixtures demonstrated acceptance of an
outside registry, overwrite of an outside report sentinel via traversal and
symlink/hardlink destinations, and reads/writes redirected by symlinked parent
directories. It also accepted a registry beyond the intended one-megabyte limit.
The regression baseline ran **10 methods, 9 failing assertions/subcases**. The
ordinary default and existing workflow report path remained positive controls.
No production data, credentials or private files were read or changed.

## Correction and compatibility

The CLI now selects a fixed reviewed registry
`rebuild/research/public-mentions-sources.json` and only two report destinations:

```sh
python rebuild/tools/public_mentions.py
python rebuild/tools/public_mentions.py --output public-mentions-report.json
```

The default remains `rebuild/test-artifacts/public-mentions.json`. All choices
are checkout-relative even when called from another working directory. Arbitrary
paths are intentionally rejected. The second command is the existing
`.github/workflows/public-mentions.yml` contract; that workflow was **not edited**
because #69 owns it. The source registry and all live-feed settings are unchanged.

The fix reuses the directory-descriptor confinement helper already merged in
#72. Static directory components are opened below the checkout with
`O_DIRECTORY | O_NOFOLLOW`. The registry opens via the held parent with
`O_NOFOLLOW | O_NONBLOCK`, must be an ordinary single-link file, and is bounded
to one megabyte both before and during reading. Output validation precedes
collection. Reports are written to an exclusive mode-0600 temporary file and
atomically replaced through the held parent descriptor; destination links are
never opened for writing. Errors exit nonzero without echoing raw supplied paths.
These POSIX operations target existing Linux/Ubuntu CI; Windows is not asserted.

Existing URL allowlists, RSS/Atom parsing, human review, publication-disabled
semantics and warning exit codes are unchanged. The existing integrity self-test
now invokes the new security suite without a second scheduled workflow.

## Actual local tests

- New real-CLI confinement suite: **10/10 PASS** after the correction.
- Existing RSS/Atom/allowlist/candidate tests with fake opener plus the integrated
  security suite: **PASS**.
- Combined mentions/snapshot/Git confinement: **24/24 PASS**.
- Snapshot compatibility self-test: **10 public datasets + 10 security tests PASS**.
- Build and independent release verification: **15 principal pages, 760 profiles PASS**.
- Python compilation and diff checks: **PASS**.

Captured output: [evidence log](evidence/public-mentions-20261103.log).
All CLI network fixtures have no active feeds; collection unit tests use their
existing fake opener. No actual Google News/YouTube request, production action,
new credential, dependency, suppression, Quality Gate change or historical edit
was made. Remote CI and exact-head Sonar results must be reported separately
through the owning PR and Issue #71.

## Remaining limitations and handoff

PR success does not establish Security Rating A on main. The latest verified
main `7f89c55` Sonar check `125752511080` remained C/FAILURE. A fresh provider
inventory after subsequent merges is still needed; no current remaining-issue
count is inferred from the old list of 37. The previously blocked direct Sonar
API was not retried without a network-policy change. Files owned by #37/#69 and
ChatGPT's research/analytics PRs were not edited. Production deployment/logs for
this change are **NOT VERIFIED**.

Keep this task-specific failure/cause/commit/retest record with its owning PR;
it can be linked from `docs/PR_SELF_HEAL_LOG.md` once merged, avoiding concurrent
edits to that shared file in the active stability PR.

## Initial remote CI and latest-main synchronization

At exact head `a5fccb21e9b4f05928dd21abfa634a9e02bc8995`, all remote
checks finished without failure or pending work. Required syntax
`125775362850` and ESLint `125775363062` PASS; SonarCloud `125775647241`
PASS; release integrity `125775362926` PASS; full Rebuild Chromium
`125775513647` PASS. Neutral/skipped checks are not reported as test passes.
These are historical exact-head results, not proof of a later head or main A.

Main subsequently advanced through normally merged site-stability #74 to
`6e2c85c420c540ae2e3e70fba904c0d8d2b4a6c0`. This branch includes that
main unchanged; new combined-head CI is required. The merged shared self-heal
log documents the UI errors and their correction. Main Sonar check
`125777746821` is still FAILURE; no current remaining count is invented.
Actual production provider logs for that main SHA remain NOT VERIFIED here.
No second merge is performed while serial post-merge verification is pending.
