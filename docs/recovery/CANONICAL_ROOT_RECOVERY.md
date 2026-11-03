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

## Weekly backup extension — proposed, not active until protected merge

This PR extends the **existing** `weekly-public-snapshot.yml` job (Sunday 03:43 UTC and manual `workflow_dispatch`) with a **second, separately named artifact**: `canonical-root-public-snapshot`. It carries exactly the three public source registries listed above plus `canonical-root-snapshot-manifest.json`, stamped with the originating `GITHUB_SHA`.

The existing artifact `public-archive-snapshot` remains unchanged, including its ten generated JSON files. We do not mix data sets, change their existing backup format, create a second cron, or copy any private Drive files.

Before GitHub uploads the new artifact, the runner:
1. validates the three canonical JSON ID lists, duplicate IDs, size limits and Hall declared count;
2. stages only those public files in a fresh, private-per-run `RUNNER_TEMP/archelaos-public-canonical` directory;
3. rechecks file SHA-256, sorted ID-set SHA-256 and counts against the fixed manifest;
4. refuses any extra or missing entry, symbolic link, invalid commit SHA, source mutation or incorrect record count.

The PR-only checks test both synthetic tampering and staging of the **actual repository checkout**. This proves local staging and readback, **not** an artifact surviving GitHub remote storage or a recovered production website.

**First-run requirement:** The public GitHub Actions page for this weekly workflow showed zero historical runs at the time of review (2026-11-03). After merge, the existing workflow must complete a real manual or scheduled run on `main`, and the two artifacts must be retrieved using GitHub's provider API and verified independently. Until that happens, this recovery layer is **configured but not operationally proven**.

Retention remains 30 days for both artifacts. GitHub storage is not an independent offsite backup. Long-term recovery and private archive continuity require separate, access-controlled retention and a genuine isolated restore drill. Avoid assuming RPO/RTO targets have been met.
