# Self-heal: hourly monitoring and error/solution knowledge base

**Scope:** the central `archelaos.club` website, not the future sports subdomains.

## Operating cadence

The existing [Site watch and safe repair](../../.github/workflows/site-watch-and-repair.yml) workflow runs **once an hour** using `17 * * * *`, at minute **:17 UTC**. The same workflow retains its manual trigger and its existing concurrency group. This **replaces** its former six-hour cron, rather than creating a competing automation or extra ChatGPT scheduled slot. GitHub's scheduled runs are not real-time guarantees and may be delayed or occasionally skipped; inspect actual Actions run IDs to verify execution.

The monitor remains bounded: read-only site checks, source HTML guard, trusted incident journal, diagnosis, then **one verified fix in a Draft PR only** for supported faults. A broken live check remains failed even if a proposed repair exists. Repeated observations do not reset the **180-minute cooldown**, identical-condition attempt cap, or three-attempt ceiling. Manual review and protected CI/merge are unchanged.

## Two complementary stores

1. **Incident database (dynamic):** The existing trusted, append-only GitHub **Issue comments** maintained by `tools/self_heal_github.py` already store incident fingerprints, observations, reservations, exact source signatures, test results, Draft PRs, failed/unknown outcomes, and later observations. They survive separate Actions runs. These are the operational facts; the workflow must not treat a successfully opened PR as an already repaired production problem.
2. **Solution knowledge base (reviewed):** [`error-solution-catalog.json`](error-solution-catalog.json) stores minimal, structured **known symptoms, proven diagnosis, target, guard, evidence and repair policy**. It is initially read-only reference data: adding a JSON entry **does not authorize execution of new code** or change the compiled allowlist. This prevents an untrusted report from teaching the bot arbitrary commands.

For each actual incident the preferred journal schema is: event time UTC, resource/sport, failure class, stable fingerprint, observed/main commit, originating run URL, sanitized error, diagnosis confidence, proposed allowlisted solution, exact pre/post guard status, candidate SHA/PR, CI state, deployed SHA/provider proof, final HTTP check, and status of verification. Keep the original observation and any failures; never overwrite them with a success inferred from a PR or preview.

## Confidence and promotion

- `DIAGNOSE_ONLY`: observations and suggestions are allowed; **no automatic code edits**.
- `ISOLATED_REPAIR_VERIFIED`: an actual injected fault passed the independent before/after guard **on a staging fixture**, with replay deduplication; it is *not* proof of production restoration.
- A new automated recipe is only permitted after owner-reviewed source changes to the **compiled** allowlist, separate regression tests, independent red/green fault injection, exact-head CI, a protected PR and production verification. The catalog itself does not activate repairs.
- Unknown root causes, overlapping PR ownership, missing evidence, permissions problems, unsafe directories and unresolved Sonar findings are **fail-closed**.

The initial catalog documents the verified news-head escaped-whitespace fixture (Issue #106 / Draft #107), unknown public-site health failures (diagnose only) and the independently open main Sonar Security C (Issue #66; *not currently an automatic monitor repair class*).

## Later integration with the central brain

The [event-driven orchestrator work](https://github.com/dizigs/archelaos-site/issues/108) may eventually use Cloudflare D1 for querying incident history and de-duplicated work. D1 is **not required to run the current monitor**; do not create a paid service, replicate private submissions, or introduce another cron. A future migration must preserve provenance, stable IDs, incident states, access controls and retention rules. A solution should be marked *production verified* only after exact deployment/build logs and real HTTP health checks.

## Operational QA

```sh
python -m unittest discover -s tests -p 'test_self_heal_*.py' -v
```

Inspect the [Actions workflow runs](https://github.com/dizigs/archelaos-site/actions/workflows/site-watch-and-repair.yml) after the protected merge. **Scheduling configured** is not the same as a completed hourly run. No automatic merge, deployment rollback or new failure-class fixer is introduced by this change.
