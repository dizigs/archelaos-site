# Public archive artifact recovery rehearsal (read-only)

This branch adds an **offline verifier**, not a backup replacement or production restore.

## Existing verified code path
- `.github/workflows/weekly-public-snapshot.yml` is scheduled Sundays 03:43 UTC and uses `upload-artifact` with `retention-days: 30`.
- `rebuild/tools/public_snapshot.py` inventories **ten public release JSON files** with bytes, counts and SHA-256.
- GitHub source/release history and Cloudflare deployments are separate recovery resources.
- **Missing evidence:** a real downloaded GitHub artifact tested end-to-end. No retrieval of an actual scheduled artifact has been performed in this branch.

## Test a real artifact without extraction
Download the exact `public-archive-snapshot` artifact from a successful weekly workflow run in GitHub Actions, record run/job ID and SHA, then execute locally:

```bash
python rebuild/tools/public_restore_audit.py /path/to/downloaded/public-archive-snapshot.zip
python -m unittest discover -s rebuild/tests -p 'public_restore_audit_test.py' -v
```

The tool verifies **only** the expected manifest + ten public JSON files, validates file sizes, SHA-256 and record counts, and rejects duplicate/unexpected entries, symlinks, traversal and large files. It performs **no extraction and no network or production write**.

An offline PASS means the artifact bytes are internally consistent. It does **not** prove:
- remote artifact is present, accessible after thirty days or stored off GitHub;
- restoration of the actual website, generated HTML/images/media, Cloudflare configuration, DNS, secrets or permissions;
- continuity of private contributions or the Drive archival corpus;
- successful production rollback.

## Real recovery acceptance criteria
1. Confirm latest scheduled workflow run and artifact **from GitHub**, recording URL, timestamp, size, retention and outcome.
2. Download artifact and execute this auditor on actual bytes; retain report and manifest hashes privately.
3. In an isolated workspace, rebuild the exact tagged commit, compare public data with artifact and run release verification/browser tests.
4. Independently inventory canonical root records (`news.json`, `hall-of-fame-people.json`), static profiles and media not included in this ten-file archive; verify that Git history/approved storage recover those exact bytes.
5. Verify Cloudflare production history and known-good deployment logs. A Cloudflare deployment rollback cannot restore DNS, Canva, private Drive or external dependencies.
6. Document RPO/RTO objectives separately with owners and evidence; do not claim an achieved RPO/RTO from a workflow schedule.
7. Keep private archives and credentials out of the public snapshot, GitHub artifacts, PRs, and test fixtures.

## Coordination
No edits to the existing snapshot/health/self-heal workflows or public datasets in this PR. Codex continues to own those active implementation areas; report readiness without marking production success.
