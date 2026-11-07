# ΑΡΧΕΛΑΟΣ / Europeana digital heritage — DRAFT, OFFLINE ONLY

**Owner:** automation/europeana-research/** only. This is an isolated research adapter, **not** a deployed integration. No new Worker, cron, GitHub workflow, Pages edits, Brain authority, secret, media download, publication, or production API calls.

## 1. Actual repository baseline and reusable services

Main inspected on 2026-11-06: SHA c89823a21efc1fa9f979b17a6567337a498a1969. Default-branch code search found no existing Europeana implementation. No existing agents' files are edited.

- **brain/** — the existing sole canonical Brain with durable receipts and the single AI budget ledger (20 EUR/month). No need to involve it for read-only, manually initiated research. Any later integration requires a Brain-owner-approved source/event/receipt contract; never add a second dispatcher.
- **rebuild/tools/archive_opportunities.py**, **rebuild/tools/build_canonical_archive_index.py**, **rebuild/research/** and **docs/research/** — existing candidate discovery, identity reviews and historical provenance. Reuse editorial procedures AFTER curator verification, not a direct feed into public JSON.
- **automation/cloudflare-brain-integration/** — existing private-service-binding patterns, but staging/identity prerequisites are not proven. This draft does not use or modify them.
- **Cloudflare Pages, Workers, R2** — none are required now. Do not provision infrastructure for offline discovery.

## 2. Europeana official documentation and use policy

**Search API:** HTTPS GET https://api.europeana.eu/record/v2/search.json with a query and optional profile, rows, cursor, qf, theme and reusability. Europeana documents rows <=100. Basic start/rows pagination covers only the first 1,000 results; cursor=* and response nextCursor enable deeper pagination. Do not combine cursor and start. This adapter deliberately limits rows to 20 and pages to 2.

**Record API:** HTTPS GET https://api.europeana.eu/record/v2/{dataset}/{localRecordId}.json for a Search-returned Europeana ID. Full EDM metadata is richer than the Search summary, and should be inspected for final source/rights review.

**Auth:** Europeana introduced separate Personal and Project keys in 2025. Personal keys are for exploration, **not production**. Project approval remains pending. Use a private X-Api-Key request header, NEVER deprecated wskey in a URL, browser HTML, logs, test results or GitHub. This draft accepts a key only as an injected argument, and never reads process environment variables by itself.

**Rates and costs:** Europeana read APIs are free, but its current Terms reserve the right to limit requests and its Fair Use Policy requires reasonable concurrency. Older FAQ language about unlimited GET must not be treated as a guaranteed quota. No provider-specific approved Project Key rate is verified yet. Internal conservative policy: <=1 request/s, max 20 records/page, max 2 pages/query, maximum 2 attempts, retry 429 and certain 5xx, fail closed (do not retry) when Retry-After exceeds 3s or uses an unparsed date, 24h in-memory cache. This is **our own ceiling**, not a published Europeana quota. No AI, R2, cloud billing, production or bulk harvesting.

**Copyright:** Europeana metadata is CC0. Thumbnails and actual photos/scans/media are governed by item-specific edm:rights/europeana:rights or provider terms. Missing/unknown rights is never permission to reproduce anything. Provide attribution/links to the originating institution and aggregator; honor subsequent takedowns. No media bytes are fetched or copied by this module.

Official sources:
- https://europeana.atlassian.net/wiki/spaces/EF/pages/2385739812
- https://europeana.atlassian.net/wiki/spaces/EF/pages/2462351393
- https://europeana.atlassian.net/wiki/spaces/EF/pages/2704146433
- https://europeana.atlassian.net/wiki/spaces/EF/pages/2360508417
- https://www.europeana.eu/en/rights/terms-of-use

## 3. Research scope

The exported Greek/English seed queries look for Archelaos/Αρχέλαος, Κατερίνη/Katerini, Πιερία/Pieria, sport/αθλητισμός, handball, wrestling, track, gymnastics, newspapers and photographs. First do several narrow and broad searches, then manually inspect high-signal Record objects. The optional Europeana thematic fields newspaper, sport, photography can be trialed later, but must not mask relevant untagged results.

**Year-of-object is not automatically year-of-event.** Do not discard records made before 1956 if the historical context is relevant. Digitisation timestamp is never an event date. Source institution may differ from aggregator. Two records with the same title may be distinct physical objects.

## 4. Normalized candidate schema

See metadata.schema.json (schemaVersion 1).

Each candidate retains: exact Europeana ID and canonical item URL; title and date label/precision; type; source landing URL; data-provider institutions and aggregators; rights statements; original query; endpoint and retrieval timestamp; cautious keyword relevance signals; and the following mandatory defaults:

- clubIdentity = unverified
- publicationStatus = research_only
- relevance.assessment = unreviewed
- mediaCopyAllowed = false
- needsHumanReview = true

**Deduplication:** exact Europeana ID is the only automatic hard dedupe key. Same names/dates/locations/URLs across differing IDs are soft duplicate candidates requiring manual adjudication. Search matches, images and people are **never automatically identified** with the club. No Hall of Fame/person IDs are assigned by the adapter. Research evidence and accepted public historical facts must remain segregated.

For actual publication, a human curator must check original provider source, event/person identity, independent corroboration where necessary, media permissions and credit requirements, date precision, duplicate check against existing site records, and any privacy restrictions. Editorial acceptance must be a separate and explicitly authorized content edit.

## 5. Isolated offline tests

From repository root, after checking out the Draft branch:

    node --check automation/europeana-research/europeana.mjs
    node --test automation/europeana-research/europeana.test.mjs

Uses the Node built-in runner and injected fake transport, no dependencies, no API requests. Covers search seeds, request parameter bounds, IDs, normalization, provenance, fail-closed rights, strict publication defaults, exact dedupe, disabled state, approval gates, pagination caps/cursor repeat, 429 retry delay, 401 fail-closed/no secret in error, malformed response, record-ID mismatch and caching. Locally tested on 2026-11-06: **13/13 PASS**; remote CI is not asserted.

## 6. Activation after project approval — explicit new gates

1. Operator receives and independently verifies Europeana Project Key approval and its service-specific usage limits. Do not use the Personal Key as substitute.
2. Operator approves **staging-only** requests; place the secret as a scoped server-side Cloudflare staging secret in the *existing* suitable service. Never echo it or expose an unauthenticated proxy. No production support is present in this adapter.
3. Re-read current main, resolve any ownership overlap, execute offline tests and review schema/rights assumptions.
4. Review and approve minimal authenticated Search/Record GET sample. Record request counts, HTTP response classes, cursor handling, caching and provenance in **redacted** audit evidence; zero media downloads.
5. Decide only then whether event-driven research provides actual benefit. If yes, ask canonical Brain owner for an authenticated read-only intake contract and durable receipts. Reuse existing Brain state and AI ledger; do not install a new coordinator or Worker.
6. Obtain a separate explicit production change approval, rights/privacy review, observability, cost ceiling and rollback evidence **before** deployment or automated triggers. Any publication still requires its own human editorial approval.

**All activation tasks are BLOCKED until Project Key approval plus explicit staging/operator gates. This Draft PR itself authorizes nothing.**
