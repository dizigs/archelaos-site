# Τοξοβολία — VEL​​OS archival data pipeline (pilot)

## Public sources verified
- `GET https://api.archery.org.gr/matches` — public competition catalogue, JSON array (`data`). Initial research returned 546 matches, earliest valid 2014; this may not cover all dates.
- `GET https://api.archery.org.gr/matches/800/results?include=matchPlayers,matchLeagues` — publicly accessible example match with athlete result data.
- `GET https://api.archery.org.gr/players` returned HTTP 401 during research; do not attempt to bypass login.

## Generated files
- `velos-matches.json`: minimal public competition metadata, copied from the single catalogue API call, with invalid dates normalized to null.
- `velos-results.json`: only GAS Archelaos results from **explicit allowlisted** match IDs.
- `velos-athletes.json`: aggregate of observed Archelaos athlete IDs and their matches; association with Hall of Fame intentionally remains unverified.
- `velos-match-ids.json`: small allowlist for selected match result imports (initially only 800).

The import does **not** download photographs, private athlete records, complete scorecards, passwords, or registration information. No automatic changes to `hall-of-fame-people.json`, `news.json`, or public site pages.

## Running and automation
Run, in order:
```bash
python scripts/sync_velos_catalogue.py
python scripts/sync_velos_archery.py
python scripts/build_velos_athletes.py
python -m unittest discover -s tests -p 'test_velos_*.py'
```
A daily GitHub Actions workflow (07:23 UTC) runs the same chain **only after the feature PR is merged**. It logs counts and failures, retains a 14-day snapshot artifact, and opens a separate review PR when the snapshot changes. It does not push directly to main or alter biographies.

The results importer is capped at 20 explicit match IDs per run, with a two-second delay. Match #800 may contain no Archelaos athletes; an empty result is legitimate. Do not automatically traverse every match ID or scrape all personal records until bulk access terms have been cleared.

## Review and follow-up
1. Confirm whether the Federation permits unattended bulk reuse of competition results, appropriate rate limits, and photo rights.
2. Reconcile alternate historical club names manually to avoid unrelated teams matching `ΑΡΧΕΛΑΟΣ`.
3. Inspect sample matches and actual results coverage; distinguish incomplete federation archive from absent participation.
4. Build a curated `externalPlayerId → hallPersonId` crosswalk only after unambiguous identity checks.
5. Add a separate, reviewed PR for updating Hall of Fame once enough match records have been validated.

## Status
Repository-side pipeline is a pilot; a GitHub PR does not establish that its scheduled Actions run, pass CI or deploy. Check real workflow logs before calling the automation operational.
