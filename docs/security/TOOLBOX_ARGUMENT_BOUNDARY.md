# Toolbox argument boundary / Issue66

Current main finding AaGbWnBlJDrY7EFXJ07h (pythonsecurity:S8705) points to the generic subprocess dispatch. The old argv list used no shell, so this is not a claim of reproduced remote shell execution. Source review reproduced option-like search values being reparsed as child options (exit2 instead of literal search). Five of six new dispatch/boundary regressions failed before correction.

The CLI now executes only seven fixed, reviewed checkout scripts through runpy, preserving their __main__ behavior and removing the OS-command boundary. Runner selection is a closed internal allowlist. Named values use --option=value; positional search is after --. Runtime argv/import path/cwd are restored even after a child exits or input fails. No apply/push/merge/deploy command is exposed by toolbox.

Validation:6 security tests, full toolbox health (site/editorial/translations/media), all workflow actionlint and diff checks PASS. Existing P0 workflow runs the new suite; no new schedule. New exact-head Sonar/main analysis remains required; no suppression or gate reset. Input-read findings in calendar/ingest are separate work, not claimed fixed here.
