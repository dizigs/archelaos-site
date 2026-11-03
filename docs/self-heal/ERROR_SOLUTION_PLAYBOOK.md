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

## Large initial global knowledge base (owner preference)

Rather than wait for enough incidents to accumulate locally, the system begins with a **registered federation of ten global reference sources** described in [`external-knowledge-sources.json`](external-knowledge-sources.json). Official sources include **OSV's entire public vulnerabilities export** and its per-ecosystem/incremental manifests, the GitHub Advisory Database, NVD, MITRE CWE, Cloudflare Pages and DNS troubleshooting, GitHub Actions documentation, and MDN HTTP references. GitHub public Issues/PRs and Stack Overflow are additional *community evidence*, not authority to execute repairs.

This is **a global-source directory, not an assertion that millions of rows were already copied into this repository**. Keep all huge public corpora outside website git history; otherwise every production clone/build would become slower and could violate content/data licensing. The remote OSV full archive is available at `https://storage.googleapis.com/osv-vulnerabilities/all.zip`; the incremental change list is `https://storage.googleapis.com/osv-vulnerabilities/modified_id.csv`. A retrieval service can start querying upstream public records immediately once connected. It must respect attribution, rate limits and absence of guarantees for third-party data. Existing evidence and trusted incident journals remain the single source of truth about what *actually* happened to the club website.

**The first bulk import, when explicitly implemented by the owning brain PR #111, should be:**

1. **Versioned intake:** fetch only from an approved URL registry, start with npm/PyPI/GitHub Actions ecosystems, validate content sizes/checksums/ETags and source licenses, and support incremental updates without redownloading every record.
2. **Normalize + deduplicate:** key advisories by OSV/GHSA/CVE aliases; key operational symptoms by platform + error code + version; store source URL, publication/modified times, affected/fixed versions, safety category, and provenance; mark unresolved conflicting records.
3. **Search, then reason:** before suggesting a repair, retrieve top relevant results matching exact site stack, incident evidence, error text, versions and source timestamps. Prefer official docs and verified upstream fixes; label community answers lower confidence.
4. **Learn verified site outcomes:** an incident/fix becomes a local proven recipe only after independent red/green tests, protected exact-head CI, real production deployment proof and live recheck. Track failed attempts and regressions, not just successes.

The **Cloudflare Worker/D1/Queues orchestration belongs to the ongoing #111 / Issue #108 work**, where storage, capacity, costs and privacy are assessed. This PR does not enable R2, D1, a crawler, vector embeddings, paid AI, another schedule or execution of unreviewed Internet scripts. Budget policy stays at **≤20€/calendar month of AI use** for the whole project; the public source registry itself introduces no billable AI call.

## Later integration with the central brain

The [event-driven orchestrator work](https://github.com/dizigs/archelaos-site/issues/108) may eventually use Cloudflare D1 for querying incident history and de-duplicated work. D1 is **not required to run the current monitor**; do not create a paid service, replicate private submissions, or introduce another cron. A future migration must preserve provenance, stable IDs, incident states, access controls and retention rules. A solution should be marked *production verified* only after exact deployment/build logs and real HTTP health checks.

## Operational QA

```sh
python -m unittest discover -s tests -p 'test_self_heal_*.py' -v
```

Inspect the [Actions workflow runs](https://github.com/dizigs/archelaos-site/actions/workflows/site-watch-and-repair.yml) after the protected merge. **Scheduling configured** is not the same as a completed hourly run. No automatic merge, deployment rollback or new failure-class fixer is introduced by this change.
