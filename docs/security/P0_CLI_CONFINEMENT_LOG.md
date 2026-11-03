# P0 / #66 — Git argument confinement — 2026-11-03

Base: main `74b6bcb3cc95a6160fb27f298d12f094a2679631`.
Scope: `live_sync_audit.py`, Sonar rule S8705 at the two Git blob reads.
No files owned by open PRs #37, #65 or #67 changed. Their file lists were read
before work. `docs/WORK_LOG.md` belongs to #37, so this separate log avoids a
concurrent edit. No historical or private data changes.

## Confirmed defect and correction

`shell=False` does not prevent command **option** injection. Previously,
`--ref=--output=/tmp/example` became a Git `show` option with `:board.html`
appended. A reproduction against the actual pre-fix source in a disposable Git
repository confirmed that Git created the output file inside that fixture.
It did not touch any real archive or private path.

The auditor now accepts main refs or full commit IDs, resolves the selected
commit with `rev-parse --verify --end-of-options`, validates the resulting hash,
and reads only the two allowlisted public blobs. Git show cannot receive a
user-selected option; external diff/textconv are disabled. Both blobs are read
from one resolved commit. Branch/revision expressions outside this documented
scope are rejected. There are no Sonar suppressions or security-gate changes.

## Actual local results

- Pre-fix boundary suite: 4 tests; 8 failing subcases and 4 error subcases.
- Corrected boundary suite: **4/4 tests pass**, including real main/SHA reads,
  option/revision/path rejection, absence of an injected output file, and missing
  commit failure. Disposable repositories contain synthetic public records only.
- Actual repository integration: `live_sync_audit.py --strict-reviewed` **PASS**;
  135 biography differences remain an editorial review queue, with **zero missing
  reviewed corrections**. These differences were not rewritten.
- Python compile and `git diff --check`: **PASS**.
- A pinned, read-only PR/manual workflow runs these security regressions, with no
  added cron or package installation.

## P0 remains open

GitHub check `125583156246` on the base main SHA is **failure**, summary
`C Security Rating on New Code (required ≥ A)`, annotations count 0.
Direct GET
`https://sonarcloud.io/api/qualitygates/project_status?projectKey=dizigs_archelaos-site&branch=main`
failed locally with `curl: (56) CONNECT tunnel failed, response 403`; proxy
headers identify `server: envoy`. This is destination network policy before an
HTTPS origin response, not a GitHub authentication/permissions diagnosis.
No unchanged failing request was repeated. #66 supplies the previously verified
37-finding inventory; this PR addresses one specific CLI boundary, not all 37.
Main Sonar A, the other findings and final production verification are pending.
