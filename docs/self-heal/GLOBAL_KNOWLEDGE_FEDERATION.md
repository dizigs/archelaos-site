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
