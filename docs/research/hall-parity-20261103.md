# T11 — Hall of Fame parity evidence (2026-11-03)

> Read-only, public-data research checkpoint. Does **not** modify canonical profiles, assert an old snapshot is wrong, or establish historical facts. This is a separate research deliverable, not part of draft PR #37 or Codex UI work.

## Reproducible sources

- Frozen base commit: `74b6bcb3cc95a6160fb27f298d12f094a2679631` on `main`.
- Canonical public master: `hall-of-fame-people.json`, blob `bcba90e6f5792085eefb3eef02b6d7bb675e6022`.
- Older rebuild snapshot: `rebuild/data/people.json`, blob `5ce58ef04a7f58fae76980888ad269a4722451c4`.
- Full machine-readable ID-level ledger: [hall-parity-20261103.json](hall-parity-20261103.json).

## Actual field-level inventory

| Observation | Count |
| --- | ---: |
| Canonical public master IDs | 760 |
| Older rebuild snapshot IDs | 682 |
| Canonical-only IDs | 78 |
| Older snapshot IDs absent from canonical | 0 |
| Shared IDs with at least one different field | 60 |

Differences among the 60 shared profiles: `bio` 57, `bio_en` 32, `refs` 25, `role_en` 2, `role` 1, `name` 1, `name_en` 1. Counts **overlap**; they must not be summed as a count of people.

### Identity and spelling safeguard

- Canonical `arch-f56820c52e55`: **Χρήστος Λιμπανοβνός**, role `Πρώην αθλητής · Προπονητής ενόργανης`.
- Older snapshot, **same ID**: `Χρήστος Λυμπανοβνός`, role `Αθλητής · Ενόργανη`.
- This is a single established identity with an older spelling and role representation, **not a new person**. Preserve the canonical `Λιμπανοβνός` spelling; the older record is not permission to revert it.

The 78 canonical-only entries include newer handball, shooting, wrestling and archery registrations. Their presence only in the canonical master is **not** evidence of invented records; no new profiles should be created merely to make counts equal.

## Research-first processing order

1. **T11, round 1 — names and roles.** Inspect the 2 shared IDs whose role translations changed and the single name variation; retain canonical IDs, check exact source references and protect corrected names. Do not infer that the old snapshot is authoritative.
2. **T11, round 2 — biographies.** For 57 Greek and 32 English biography field differences, compare source-backed additions versus older descriptions. Preserve longer source-supported text and verify any conflicts individually.
3. **T11, round 3 — refs.** Review the 25 source-reference differences with actual source URLs/publication dates; link to existing articles and events without duplicates, and do not publish non-public source identifiers.
4. **T09–T12 handoff.** For evidence-backed, privacy-safe changes, assemble one candidate package per distinct event/person with canonical `personId`, `eventId`, sport, event and publication dates, exact source URL, source-specific claim, image rights/provenance and unresolved questions. Codex owns CI, UI, PR integration and release; do not touch the same content records concurrently.
5. **Before completion.** Run release/parity and browser regression checks, confirm public master and release modal feed consistency, and verify the Cloudflare deployment and logs separately from a GitHub green check.

## Explicit limits and blockers

- A field mismatch is a comparison result, **not** proof of an error or a missing biography. No automatic migration or bulk overwrite of 682 legacy biographies.
- No private Drive/Gmail attachments, source IDs, witness contact details or unverified claims enter this repo report.
- PR #37 remains a separate draft until real authenticated intake, privacy controls, PDF extraction where needed, deduplication and end-to-end verification are completed.
- Report numbers are valid only for the frozen commit named above. Refresh the snapshot before using them to make future edits.

## Self-heal checkpoint

- **Started:** read-only T11 baseline, from two GitHub blobs.
- **Completed:** 760/682 count, set comparison, exact lists of 78 canonical-only IDs and 60 field-level differences; JSON evidence captured.
- **Errors:** none in the comparison; historical source-level verification not attempted.
- **Next:** evidence review and individually scoped source-grounded updates; no production changes in this checkpoint.
