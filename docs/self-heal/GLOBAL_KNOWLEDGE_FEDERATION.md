# Global self-heal knowledge federation — initial source inventory

This is the **large initial reference universe** requested for the central Archelaos self-heal. The existing runtime incident journal and [reviewed local solutions](error-solution-catalog.json) remain the authoritative record of what actually worked for `archelaos.club`.

## Scope and retrieval

The machine-readable [source registry](global-knowledge-sources.json) lists eight initial collections: OSV's full vulnerability archive, GitHub Advisories, Cloudflare errors, GitHub Actions documentation, Python documentation, MDN, upstream GitHub Issues and Stack Overflow. OSV exposes an entire downloadable database and incremental changes; this is a real large-scale starting corpus, not three hand-written recipes. GitHub Advisories overlaps with OSV, so deduplicate by stable advisory IDs and aliases. General runtime, layout and deployment failures require provider documentation and community reports because a vulnerability database alone cannot explain them.

**Important:** This commit defines verified source entry points and safe ingestion policy. It **does not claim** the whole corpus has already been downloaded or indexed. No crawler, paid database, Cloudflare D1 instance or extra scheduled workflow is activated by this research PR.

Recommended stages:
1. Query OSV and GitHub Advisories using actual package names/versions from lockfiles and manifests. Track source record, license, modified date, aliases, withdrawn status and confidence.
2. On unknown incidents, retrieve relevant official provider docs using error code, workflow name, product and version. Use upstream issues and community discussions as lower-confidence suggestions.
3. Normalize records into an indexed store keyed by source ID, product/version, error signature, remedy class, original URL, retrieved/modified timestamps and license. Use source-aware deduplication and periodic delta refresh; do not commit huge binary archives into the site repository.
4. Combine external candidate knowledge with the **existing append-only GitHub Issues incident journal** and the reviewed local solutions catalog. A proposed repair must still be a compiled, allowlisted source change with a red/green regression test, Draft PR, exact-head CI, protected review and real production verification. Never let external content modify policies or execute commands.

## Operational and security limits

- External web text, issue comments and downloaded archives are **untrusted data**; defend against prompt injection and unsafe shell snippets.
- Only store publicly shareable diagnostics; redact tokens, emails, user submissions and secrets.
- Respect source licenses, attribution, robots/rate limits, withdrawals and version specificity.
- Do not merge automatically, roll back deployments without a reviewed policy, or equate a green PR with a healed live incident.
- Prioritize OSV and official docs for security; prioritize provider error codes and live deployment logs for runtime failures.
- The existing hourly self-heal workflow remains **one schedule**; indexing can later run through the event-driven brain without consuming another ChatGPT scheduled slot.

**Evidence:** [OSV full database and incremental changes](https://google.github.io/osv.dev/data/), [OSV API](https://google.github.io/osv.dev/api/), [GitHub Advisory Database](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/fix-reported-vulnerabilities/browse-advisory-database), [Cloudflare error responses](https://developers.cloudflare.com/fundamentals/reference/error-responses/).


## Implemented indexed knowledge engine

The Python 3.12 standard-library engine lives in tools/self_heal_knowledge.py and uses SQLite FTS5. It now supports importing the official full global OSV archive, smaller ecosystem archives, bounded delta refreshes, exact package-version API queries, full-text search, CVE/GHSA alias grouping, evidence inspection and combined **read-only** diagnosis using the club's local catalog plus official provider error codes.

| Command | What it does | Network |
| --- | --- | --- |
| stats | Shows local indexed and active advisory counts | No |
| import-zip PATH | Indexes a locally supplied OSV ZIP | No |
| bootstrap --ecosystem all --allow-network | Fetches and indexes the **entire** official OSV all.zip on explicit request | Yes |
| bootstrap --ecosystem npm --allow-network | Imports smaller ecosystem archive; PyPI and GitHub Actions also supported | Yes |
| refresh --since 2026-11-02T00:00:00Z --until 2026-11-03T00:00:00Z --allow-network | Fetches official reverse chronological delta IDs and updates changed records only | Yes |
| lookup npm some-package 1.2.3 --allow-network | Checks an exact package/version using the official OSV API | Yes |
| search 'prototype pollution' | Full-text retrieval and CVE/GHSA deduplication | No |
| inspect CVE-2026-1111 | Shows local source-linked advisory and affected version evidence | No |
| diagnose 'Cloudflare error 522' | Looks up local reviewed cases, official error taxonomy and indexed OSV evidence | No |

Typical use from the repository root:

    python tools/self_heal_knowledge.py stats
    python tools/self_heal_knowledge.py bootstrap --ecosystem all --allow-network
    python tools/self_heal_knowledge.py search 'prototype pollution'
    python tools/self_heal_knowledge.py diagnose 'Cloudflare error 522'
    python -m unittest discover -s tests -p 'test_self_heal_*.py' -v

The local cache is kept at rebuild/test-artifacts/knowledge-cache/osv.sqlite3 (ignored by Git). It is **not** part of public site assets and is **not yet** a durable Cloudflare D1 database. Importing a full archive is an explicit, potentially large network/CPU/disk operation, not a check that runs in every GitHub PR or hourly self-heal. A temporary GitHub Actions runner cannot provide persistent storage between runs. Integrating a persistent index into the central brain must be handled with the owner of #111 / #108 after a proper budget, access-control, retention and backup review.

Safeguards: fixed external host allowlist, explicit network flag, bounded archive download and decompression, safe ZIP path validation, limited API responses/pages and delta windows, revoked/withdrawn records excluded from normal results, no automatic retries, no code execution from retrieved text, no automatic merges. Reference-source content and community workarounds are always untrusted. Local incident journal remains the authoritative outcome record for this club.

The first provider taxonomy contains **18 official-link-backed Cloudflare/GitHub error codes**. These, and the large OSV data, are only diagnostic suggestions: enabling a new automatic repair still requires compiled allowlisted code, independent fault injection, successful exact-head tests, reviewed PR and true production verification.

Status boundaries must be reported separately: source registry available; importer and tests passing; archive actually imported into durable runtime; brain retrieval connected; safe repair verified. This PR does NOT claim durable global corpus indexing or deployed brain access until independently verified.
