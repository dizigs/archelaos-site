# Fact Check — δημόσιο παιχνίδι / private research separation

- Public: `/fact-check.html` hosts 10 rotating questions per round from 12 manually curated, already-published museum facts in `assets/fact-check.js` (FC001–FC012).
- The canonical private historical claim bank TF001–TF061 is NOT published, copied, encoded, exposed or treated as a verified answer key. It remains in the restricted Google Doc referenced in `docs/LIVE_TASK_TRACKING.md`.
- Each public fact has a museum/retro/sport source link. Do not add a new question without checking the canonical record, person/event ID where applicable and a source link; disputed historical claims stay private until reviewed.
- The quiz stores no user responses, sends no network requests and has no public voting or correction intake endpoint. `Δεν γνωρίζω` skips scoring and exposes the explanation.
- Corrections are directed to the existing `/contact.html?topic=archive` route pending the independent backend/security/privacy release gate for PR #242; do NOT enable `/api/text-corrections` by this PR.
- Same museum CTA lives in `history.html` and `rebuild/history.html`. Same game HTML lives in root and rebuild; rebuild must retain `noindex,nofollow` until `build_release.py` adds production SEO.
- Release gate: required exact-HEAD CI and protected merge, then independent Cloudflare production deployment logs for that merged SHA. This PR by itself does not prove live activation.
