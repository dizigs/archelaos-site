# VEL​​OS archery results (pilot)

- Read-only public result endpoint confirmed: `https://api.archery.org.gr/matches/800/results?include=matchPlayers,matchLeagues`.
- The `matchIds` list is explicit and bounded. **This does not discover all competitions.**
- Stores **only athletes attributed to Γ.Α.Σ. Αρχέλαος** in the result's `teamName`. Other clubs' records, headshots and per-arrow data are intentionally omitted.
- Run `python scripts/sync_velos_archery.py` or use the daily GitHub Actions workflow. Every run uploads a 14-day audit artifact and proposes changed snapshots in a review PR (requires repository Actions permissions for PR creation). It does **not** merge to main or mutate Hall of Fame automatically.
- No modification to `hall-of-fame-people.json` or `news.json`. External `player_id` is a candidate association key, **not** an Archelaos `personId` until verified.
- Manual additions to the ID allowlist are required pending verification of an official competition-list endpoint and the federation's bulk reuse/automation terms.
- The single seeded match, ID 800, may return **zero Archelaos athletes**, which is an expected valid dataset, not an import failure.
- Match identifiers are de-duplicated; error stops the update, not partially overwriting the previous snapshot. Logs report only match IDs and totals.
