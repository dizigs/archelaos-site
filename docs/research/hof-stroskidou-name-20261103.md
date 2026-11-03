# Hall of Fame name spelling correction — 2026-11-03

Canonical ID: `arch-459959b908dd` (unchanged).
User-confirmed spelling: **Αλεξάνδρα Στροσκίδου**.
Old typo: **Αλεξάνδρα Στροστίδου**.
No other biography, dates, event associations, sports attribution or identities were altered.

## Checked files
- `hall-of-fame-people.json`: 3 replacements; exact ID retained; JSON parsed where applicable.
- `archelaos-person-index.json`: 3 replacements; exact ID retained; JSON parsed where applicable.
- `rebuild/data/people.json`: 3 replacements; exact ID retained; JSON parsed where applicable.
- `rebuild/i18n/content/en/people.json`: 2 replacements; exact ID retained; JSON parsed where applicable.
- `people/arch-459959b908dd.html`: 6 replacements; exact ID retained; JSON parsed where applicable.
- `rebuild/source-profiles/arch-459959b908dd.html`: 8 replacements; exact ID retained; JSON parsed where applicable.

## PR collision policy
- Existing draft PR #76 edits four of these source/index files for unrelated Hall identity consolidation. This correction is isolated in its own small PR because #76 is blocked on redirects/identity validation.
- Do not merge #76 before this correction. After this PR merges, synchronize #76 from the new main and explicitly preserve the new canonical spelling.
- No direct push to main. Final release success only after exact-head CI and Cloudflare production logs.

## Work log
- STARTED: identified wrong public search popup spelling and six canonical/generated data representations.
- IMPLEMENTED: replacement in six records while retaining person ID.
- PENDING: PR CI, SonarCloud gate, release build verification, protected merge, Cloudflare production deployment and live search popup.
