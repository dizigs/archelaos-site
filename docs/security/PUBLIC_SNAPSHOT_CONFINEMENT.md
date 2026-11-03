# P0 #66 — public snapshot write confinement — 2026-11-03

Owner: Codex. Coordination: [Issue #71](https://github.com/dizigs/archelaos-site/issues/71).
Base main: `0e767541e7b935b2a00e9bfe80258392bd9c5736` (merged #68).
Corrective commit: `31e5532a3d71b2b89420b6382a57ef09cd96113a`.
Reported Sonar finding: `pythonsecurity:S8707`,
`AaGbWnBaJDrY7EFXJ07Y`, the snapshot CLI output sink identified in #66.

## Confirmed defect

The previous `--output` accepted an arbitrary filesystem path and called
`Path.write_text` on it. Actual CLI runs in disposable public-only fixtures
confirmed that traversal/absolute destinations, an output symlink, a hardlink
and a symlinked output parent could overwrite a sentinel outside the fixture
checkout. These were synthetic sentinel files, never real private data.

The initial seven-method regression suite produced seven failing assertions or
subcases against the unchanged base; default/allowed ordinary outputs continued
to work. It is not a claim that all seven methods failed or that an attacker
exploited production. The local baseline is retained at
`/tmp/public-snapshot-before.log`.

## Scoped correction and compatibility

The CLI permits only these **checkout-relative choices**:

```sh
python rebuild/tools/public_snapshot.py
python rebuild/tools/public_snapshot.py --output rebuild/test-artifacts/public-archive-manifest.json
```

The original default remains `public-archive-manifest.json` in the checkout,
preserving the weekly artifact contract. Absolute paths, traversal and arbitrary
custom destinations are intentionally rejected. Callers using them must select
one of the fixed outputs instead. The ten datasets, format, field names, SHA-256
computation and source-data reads are unchanged.

Directory components come from a closed mapping and are opened beneath ROOT
using `O_DIRECTORY | O_NOFOLLOW`. Held directory descriptors prevent a replaced
parent from redirecting the write. Existing non-regular or multiply-linked
destinations are rejected. An exclusive, mode-0600 temporary file is written and
fsynced, then atomically replaces the directory entry through the held descriptor.
It never opens a destination link for writing. Temporary files are removed on
failure. The POSIX descriptor operations target the existing Linux environment
and Ubuntu CI; Windows portability is not asserted.

No quality-gate changes, suppressions, new cron, dependencies, credentials or
historical-source edits. The existing release-integrity self-test now runs the
new security suite, avoiding edits to workflows owned by #69.

## Actual local validation

- **10/10 snapshot security tests PASS**: default/alternate outputs, forbidden
  paths, destination symlink/hardlink, parent symlink, directory destination,
  missing artifact directory, interrupted partial write and concurrent parent
  replacement. The race fixture proves that replacement stays anchored and
  leaves the outside sentinel unchanged. Partial-write failure preserves the
  prior manifest bytes and leaves no temporary files.
- **14/14 combined CLI security tests PASS**, including the four existing Git
  argument-boundary regressions from merged #68.
- `rebuild/tests/public_snapshot.py` PASS against an actual built release:
  ten public datasets and checksum/byte-count invariants, plus all ten new tests.
- Actual CLI default and alternate outputs **match byte-for-byte**. The generated
  default test report was moved into ignored test-artifacts, not committed.
- Build and independent verify **PASS: 15 principal pages, 760 indexed profiles**.
- Python compile and whitespace checks PASS.
- Open-PR file sets checked: no overlap with #37, #65, #67, #69 or #70.
  Their branches/files and the shared `docs/WORK_LOG.md` are unchanged.

Executed output: [public-snapshot-tests-20261103.log](evidence/public-snapshot-tests-20261103.log).
Remote PR checks are pending at this documentation commit and must be verified
on the actual final head before merge.

## Remaining P0 and production state

Main `0e76754` Sonar check `125742340876` is **FAILURE: Security Rating C,
required A**, annotations count 0. This patch fixes one independently reproduced
snapshot boundary, not all remaining #66 findings. No blocked Sonar API or
detailed Actions-log download was retried under unchanged network conditions.

Cloudflare production deployment/logs: **NOT VERIFIED**. A PR preview/check does
not establish a production deployment. Final PR/CI outcomes and the exact next
step are delivered through new `[CODEX-HANDOFF]` comments on #71.
