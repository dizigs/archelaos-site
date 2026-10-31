# Hall of Fame ↔ Historical Events ↔ Sources

## What the visitor should see
A single elegant native dialog, using the existing deep-green, cream and gold design. A verified biography has a short "Σχετικά γεγονότα" section, with dated event cards and a source link. Each historical event contains "Συνδεδεμένα πρόσωπα", their roles and a source list. Use one diagonal arrow per interactive card, 44px minimum touch targets, readable paragraphs and reliable close/keyboard/scroll behavior. Do not force another top-level public site page.

A small link "Προτείνετε διόρθωση ή τεκμήριο" opens a contextual form only AFTER a real secure backend exists. Until then, the already working contribution mailto is the honest fallback. This is an actual user-suggestion service, not an unmoderated comments section.

## Strict publication separation
The research file rebuild/research/historical-events.json is public in GitHub but NOT distributed by the website. Each record needs an explicitly reviewed editorial_status=approved before it can enter a public graph. The compiler rebuild/tools/build_event_graph.py emits reciprocal by_person and by_event connections to gitignored rebuild/test-artifacts ONLY. An unresolved research queue event or related disputed 70 Moments claim blocks the event despite a provisional editorial approval. Research source_checked is NOT editorially approved. Changes never overwrite biographies.

## Visitor suggestion architecture (NOT yet live)
- Cloudflare Pages Function POST /api/archive-suggestions validates the typed input, length, event/person ID, allowed public source URL and same-origin request. It must deny unconfigured deployments.
- Server-side Cloudflare Turnstile Siteverify is mandatory; client-side widget alone is insufficient. Add rate limiting, duplicate detection, moderation flags and abuse protection.
- Store suggestions in private D1 with status pending; do not expose the queue in any public response.
- Private admin UI behind Cloudflare Access; decision audit log tracks pending, reviewing, needs_evidence, approved and rejected.
- Approval of a visitor's suggestion is NOT publication. An editor verifies independent historical evidence, writes a reviewed public record and runs all regression tests. The production release remains separately gated.
- No private Drive document URLs, scans, contact addresses or unlicensed photographs go into the public repository. Document privacy policy, deletion requests, storage period and GDPR responsibilities before activating the form.
- Attachments are deferred until authenticated private R2 storage, malware checking, size limits and image rights review are designed.
- Never call a submission successful when there is no backend.

## Useful extensions
1. Show "Where else does this person appear?" with fully verified related moments, museum exhibits and sports departments.
2. Events gain stable IDs, sport, date/season, primary source and linked people; full-profile deep links and accessible dialog.
3. Visitor proposes a correction from the exact event/profile, so moderators never guess which record it concerns.
4. Deduplicate suggestions for the same record and historical source.
5. Internal editor dashboard highlights conflict cases and missing citations; never displays unverified accusations to the public.
6. Add local-device favorites for approved events in a later release.

## Integration and safety gates
Run the offline reciprocal test and candidate export with:
- python rebuild/tests/event_graph.py
- python rebuild/tools/build_event_graph.py

No form deployment, backend, D1 database, security secret, production change or automatic publishing is done by these commands.

## Νέα υλοποίηση: εμφανές «Προς τεκμηρίωση» και δική σου τελική απόφαση

Η σελίδα Συνεισφορά διαθέτει πλέον ενότητα με **εννέα ουδέτερα αιτήματα τεκμηρίων**, ένα για κάθε ενεργό/ιστορικό τμήμα, χωρίς δημοσίευση ανεπιβεβαίωτων αγωνιστικών ισχυρισμών. Κάθε φίλτρο/κάρτα οδηγεί σε προσυμπληρωμένο `mailto` που διατηρεί τον σταθερό κωδικό του αιτήματος. Το D1/Turnstile backend υπάρχει μόνο ως κώδικας υποψήφιας μελλοντικής ανάπτυξης και **δεν** έχει ενεργοποιηθεί ή συνδεθεί με πραγματική υπηρεσία.

Η εσωτερική κατάταξη δημιουργείται με:
```sh
python rebuild/tools/event_triage.py
```
Αποθηκεύει αριθμημένες προτάσεις `event-review-queue.md` και `event-review-queue.json` στα αγνοημένα `rebuild/test-artifacts/`. Η πρόταση «προς έγκριση» είναι **μόνο υπόδειξη με βάση το είδος καταγεγραμμένης πηγής**, όχι τεκμηριωμένη επαλήθευση κάθε ισχυρισμού.

Η επιμελητική εντολή μπορεί να εκφράζεται ως «ενέκρινε `arc-...`» (ή αριθμό συνδεδεμένο με συγκεκριμένο στιγμιότυπο). Το `review_event_decisions.py` ζητά ακριβές `dataset_fingerprint`, ρητή προηγούμενη απόφαση, συγκεκριμένο event ID και αιτιολογία, μπλοκάρει αντίφαση και προεπιλέγει `dry-run`. Δεν αποδέχεται μαζική αυτόματη έγκριση ή αίτημα επισκέπτη ως εξουσιοδότηση. Καμία έγκριση ιστορικού γεγονότος δεν δόθηκε στο παρόν στάδιο.

```sh
python rebuild/tests/event_decisions.py
python rebuild/tests/event_triage.py
python rebuild/tests/verification_requests.py
```

Τα δημοσιευμένα στοιχεία εμφανίζονται μόνο μετά από ξεχωριστό reviewed release. Το παλιό live site παραμένει ανέπαφο.
