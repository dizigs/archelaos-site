# Multi-sport subdomains: shared foundations (non-deploying draft)

## Boundary and ownership
**archelaos.club owns the canonical history, stories, Hall of Fame and person IDs.** Sport sites serve contemporary operational content (training, facilities, coaches, FAQ, documents, local contact, event calendars, verified results). Link history to the main-site archive instead of republishing it.

This PR introduces a **planning registry and validation contract only**. No DNS records, Cloudflare Pages deployments, analytics tags, tracking cookies, data imports, or changes to HOF/news.

## Registry
`config/sport-sites.json` contains proposed hosts, sport keys, an archery-only approved theme; all other palettes are undecided, and references to canonical history and Hall. Only `archery` has an approved visual identity and is an existing subdomain with a redesign plan; `wrestling` is a planned example, others are candidates **not claims of live sites**.

## Architecture conventions
1. Use one stable `sportKey` across websites, calendars, news, analytics, sources, and archive.
2. Hall profiles are linked by an existing verified `personId`. Federation IDs live in a separate crosswalk `(provider, externalPlayerId) → personId`. Never auto-merge same-name people or rewrite canonical IDs.
3. A distinct event gets one `eventId`, independent of syndication to another sport site. News remains centrally authored; sites may surface the same canonical record using a source URL rather than copying/editing it.
4. Sport sites must never import private contribution archives or publish health/registration/guardian details. Documents are provided as static blank forms, with private submission via authorized central flow only.
5. The central `/hall-of-fame-people.json` may be read publicly, but avoid exposing unreviewed federation athlete images or newly inferred identities.
6. Historical menu links use a normal navigation to the central site (no duplicate History article).
7. Add any new site using the registry, then run `python tools/validate_sport_sites.py` before review.

## Analytics plan: not yet configured
- **GA4**: evaluate one shared property with the existing GA4 measurement and explicit `sport_section` plus `site_host` dimensions, subject to actual tag/configuration/consent audit. Property `510627658` currently appears in existing read-only aggregate automation; this does not prove the proposed subdomains are tracked.
- **Search Console**: existing `sc-domain:archelaos.club` should be inspected for subdomain coverage/ownership. Prefer separate URL-prefix views per subdomain if useful; no ownership or verification claim here.
- Event vocabulary: `page_view` (native), `sport_contact_click`, `sport_schedule_view`, `sport_document_download`, `sport_event_open`, `sport_athlete_open`, `sport_history_open`. Only send after privacy/consent decisions are validated; never include athlete names, free-text, email, phone, health/child data, or person IDs as analytics parameters.
- Cardinality: `sport_section` is a controlled enum from the registry, `site_host` is the hostname. Track outbound main-site links without pretending a single same-origin popup works across subdomains.
- Cross-domain attribution and cookie behavior require a concrete Google Tag/Consent Mode design and observed end-to-end test, not assumptions.

## Release gates per new sport site
- Approved ownership and URL, DNS zone/subdomain routed to the intended Pages project, real deployment SHA/status and logs.
- Canonical/hreflang/robots/sitemap strategy, redirects and 404, accessibility, performance, responsive QA, CSP, legal and contact.
- Verified site-specific search and telemetry, with consent handling and opt-out tests.
- Normalized sport-specific schedule and sources; federated results only through permitted read-only interfaces with provenance, rate limits, dedupe and rollback.
- Verified links between live sport site and canonical central Hall, museum/history; no duplicated historical copy.
- Separate status in private live tracker; **no tick for PR-only work**.

## Non-overlap with active PRs
PR #86 is VEL​​OS-only pilot and does not implement the multisport registry. PRs #76/#84/#85 handle Hall canonical/rebuild issues; leave them untouched. Codex owns UI/release/deployment. This foundation PR is isolated to a new config, validator and docs. Merge only after CI and conflict checks.
