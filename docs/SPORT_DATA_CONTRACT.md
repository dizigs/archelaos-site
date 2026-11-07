# Shared sport-site data & analytics contract — planning layer

The file `config/sport-data-contract.json` defines a **proposed, non-operational contract** for sport subdomains. No analytics events are emitted and no athlete records are imported by this PR.

## Identities
- The canonical `personId` comes from `hall-of-fame-people.json` on **archelaos.club**; never create one solely from a third-party name.
- Third-party athletes use the tuple `(provider, externalPlayerId)` as a candidate identifier. The identity crosswalk requires documented manual or separately approved evidence; *same name* is insufficient. This is particularly important for youth archers and wrestlers.
- A sport microsite may link to `https://archelaos.club/hall-of-fame.html?person=<verified-id>`. Historical biographies remain only on the central site.
- For result attribution, use source URL and event ID; no personal health, guardian or enrollment data.

## Events
- `eventId` is canonical across sites. Reuse the same event ID for a cross-listed event and never create duplicate news just because a microsite surfaced it.
- Persist sources, event date, competition and verified sport key. A competition listing does not establish an athlete's membership.
- Result importers must be provider-specific and rate-limited. VEL​OS remains isolated in PR #86, without dependency on the multisport feature.

## Analytics
- GA4 proposal: shared `sport_section` and `site_host` contexts plus the event names listed in the contract. **No GA4 changes yet**.
- Allowed analytics parameters deliberately exclude athlete IDs, names, emails, search terms, medical/guardian data, free text and document filenames. Do not include such data indirectly in URL paths or query parameters.
- Tracking only when site-specific consent/legal configuration has been reviewed. Cross-subdomain attribution needs a separate validation with Google tag diagnostics and observed data. Do not infer that the existing GA4 property is configured on the new sites.
- The contract checks only metadata. It does not certify Google Ads conversions, consent, cookie scope or data collection.

## Rollout
1. Validate with `python tools/validate_sport_data_contract.py` and run unit tests.
2. After other existing PRs complete, build an independent reusable front-end starter that **reads** the registry and points to the canonical Hall and archive.
3. Obtain actual GA4 and Search Console access evidence before modifying measurement settings; verify zero identifiable information in test events.
4. For each department, collect real assets, current timetables, permitted public result sources and independent Page/Cloudflare release logs before enabling the live site.
