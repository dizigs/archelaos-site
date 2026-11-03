# Canonical root recovery coverage — DR-002

This is a **read-only inventory** of the source-of-truth public registries, which are **not** all included in the existing weekly ten-file `dist/assets/site/data` backup:

- `news.json` → `items[].id`
- `hall-of-fame-people.json` → `people[].id`, plus its declared `count`
- `archelaos-history-events.json` → `events[].id`

`python rebuild/tools/canonical_root_inventory.py` prints one deterministic JSON report to stdout with file SHA-256, size, record count, and sorted **set of IDs** SHA-256. The script rejects missing files, symlinks, malformed JSON, empty/duplicate IDs, count mismatch and files larger than 25 MiB. It does not print biography content, archive sources or private documents.

To compare against a separately preserved, approved inventory from a known-good release:
```sh
python rebuild/tools/canonical_root_inventory.py > canonical-root-inventory.json
# After an authorized release, store this JSON privately with its verified SHA and CI URL.
python rebuild/tools/canonical_root_inventory.py --baseline canonical-root-inventory.json
```
Differences in content or IDs produce a nonzero exit. An intentional new article or person changes checksums too: the baseline must be **version-appropriate**, never used to block legitimate updates based on a stale count.

**Evidence boundary**: hashing and testing a checkout proves current **source integrity**, not recovery from a remote backup, external storage durability, Cloudflare deployment, or restoration of static profiles and photographs.

The existing weekly workflow remains untouched. This PR adds no cron, no backup upload, no persistent writes, no private data and no production modification. A separate operational decision is needed before including these root registries in an approved offsite recovery strategy.

## Integration with the rest of the site

The canonical person IDs must be matched from documented sources; this scanner only checks for malformed and duplicate IDs, never merges identities. News events, archive events, legacy `rebuild/data` and central public profiles are still verified by their own existing release checks. There is no automatic promotion of 682 legacy staged profiles over current canonical records.
