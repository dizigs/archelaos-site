# P0 #66 — calendar report output confinement

Base main: `0108750507241c4bb5f942457c78788ec6f7e0a8`. Functional commit: `5b724e93c11fb2b219fb2e21197cfe2cbb4571f5`.

## Confirmed defect, not an inferred exploit

Real CLI runs in disposable synthetic fixtures reproduced outside-sentinel overwrites through a symlinked report root, a hardlinked destination and an in-root destination symlink. A deterministic parent replacement during parsing also redirected the old writer. Plain outside destination paths were already rejected by the old resolve-relative check. No real calendars, private files or production data were used.

The old guard resolved the proposed path and the allowed root independently. A redirected root was therefore treated as the trusted root. Resolving a path also cannot identify another hardlink to its inode.

## Correction and scope

`--out` now accepts only `rebuild/test-artifacts/match-calendar-review.json`, anchored to the checkout from any current working directory. The existing #79 shared descriptor-based writer is reused: no-follow directory descriptors, ordinary single-link destination validation before input parsing, atomic replacement via an exclusive mode-0600 temporary file, and bounded errors. The held parent descriptor prevents a later directory swap from redirecting the write. No duplicate writer or Sonar suppression was introduced.

The normal no-argument output contract, report bytes, ICS/ZIP parsing, warnings and `never_without_owner_review` policy remain unchanged. The input-path read boundary is a **separate unresolved task**; this output fix is not represented as closing that Sonar finding or the complete P0. The fixed CLI destination intentionally rejects arbitrary custom/absolute paths. No repository caller depended on custom report names.

## Actual validation

- Before: 11 test methods, 10 failing assertions/subcases, including new fixed-choice/permissions/bounded-error requirements; not ten distinct vulnerabilities.
- After: 11/11 calendar output regressions PASS; all 45 `*security_test.py` methods PASS.
- Existing ICS/ZIP/timezone/DST/recurrence/cancellation/duplicate-UID checks PASS.
- Parent-swap test preserves the synthetic outside sentinel and writes only through the held original directory.
- The ordinary report is byte-identical before/after, SHA-256 `406c921ecf29d141b9904b8b4c1cf8b0328a79288413fa2900b4d2982bd306c0`.
- Build/release, root validation, 36 existing Hall guards, Python compilation, actionlint and diff checks PASS. No Hall work was repeated or content changed.
- Existing P0 CLI workflow now exercises calendar/Git tests on relevant PRs and main pushes. No cron, permission, dependency or external service was added.

Structured proof: [calendar-output-20261103.json](evidence/calendar-output-20261103.json). New-head remote CI, main Sonar A and deployment proof remain pending until observed; a PR pass is not main completion.

## Fresh Sonar API availability

Requested endpoint: `https://sonarcloud.io/api/issues/search?componentKeys=dizigs_archelaos-site&branch=main&inNewCodePeriod=true&resolved=false&types=VULNERABILITY&ps=100`.

Actual result: `curl: (56) CONNECT tunnel failed, response 403`; origin HTTP `000`; proxy header `server: envoy`. This is a network CONNECT denial before Sonar TLS/API, not GitHub authentication/permissions and not an origin Sonar 403. No unchanged retry was made. Current individual finding count is **UNKNOWN**, not assumed 37 or 33. A fresh provider snapshot was requested through #71. A narrowly scoped environment draft adds the Sonar host to the known current network destinations; user review/save/publish is needed before runtime access changes. No token was requested or read.

#66 remains open: fix actual findings, preserve Quality Gates, and require current main Security Rating A plus Quality Gate PASS.
