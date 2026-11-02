### PR #52 — SonarCloud detected unsafe JSON path / 2026-11-02

- **DETECTED (failed security check):** SonarCloud PR #52 `Quality Gate failed`, `C Security Rating on New Code`. One High security finding at `rebuild/tools/intake_contributions.py:42`: potential `read_json(path)` path traversal from a malformed CLI path. Finding: https://sonarcloud.io/project/issues?pullRequest=52&open=AaGduh3YPkI5f9IHs3rc&id=dizigs_archelaos-site . Other CI (private intake, syntax, release, actionlint) had passed; **PR was not merged**.
- **FIX PREPARED:** `read_json` now takes mandatory `within` trusted root, resolves the file (including symlink targets), enforces membership, `.json` suffix and regular-file existence before reading. CLI envelope is restricted to `.archive-intake/incoming`; receipts, private research/matches and public catalogs use their exact respective whitelisted base directories. Internal callers updated, not merely suppressing Sonar.
- **REGRESSION TEST PREPARED:** Reject reading a JSON outside the allowed directory, including a symlink pointed outside; preserve correct reading of internal JSON. Re-run SonarCloud Quality Gate, private intake CI and full release QA before merge. Do not mark corrected until actual check success.

## Ασφαλές ιδιωτικό intake / προέλευση συνεισφορών — 2026-11-02

- **STARTED:** Ανασκόπηση του ανοικτού Draft [PR #37](https://github.com/dizigs/archelaos-site/pull/37). Περιέχει πολλαπλές ξεπερασμένες αλλαγές σε κεντρικό build/UI που θα συγκρούονταν με τα πρόσφατα PR #48–#51. Δεν το συγχωνεύουμε αυτούσιο.
- **INCREMENTAL IMPLEMENTATION:** Εξαγωγή αποκλειστικά των offline Python intake / match / queue modules και των δοκιμών τους από το #37, χωρίς ιδιωτικά δεδομένα ή αλλαγές στο live UI. Gitignored `.archive-intake/`, SHA-256 idempotency, διακριτές revisions, ασφαλής ανάγνωση DOCX, ρητό PDF pending και canonical matching.
- **CI:** Νέο read-only, SHA-pinned, path-triggered workflow. Χωρίς cron ή secrets· οι δοκιμές χρησιμοποιούν μόνο dummy αρχεία. Δεν ισχυριζόμαστε ότι Gmail/Drive poller ή αυτοδημοσίευση είναι ήδη ενεργά από αυτά τα scripts.
- **NEXT:** Πλήρες CI, διορθώσεις των πραγματικών αποτυχιών (αν υπάρξουν), τελικό PR+merge+production logs, στη συνέχεια σχεδιασμός χωριστού ιδιωτικού collector με πραγματική σύνδεση στο Drive χωρίς διαρροή ευαίσθητων πηγών.

# Archelaos — Operational work log / Ημερολόγιο εργασιών

> Ενεργό αρχείο εργασίας, **όχι λίστα «να φτιάξουμε αργότερα logs»**.  
> Ώρα καταγραφής: 2026-11-02, Ελλάδα (Europe/Athens).  
> Κεντρικό έργο: `dizigs/archelaos-site`. Κάθε νέα συνεδρία εργασιών πρέπει να διαβάζει αυτό το αρχείο και να συνεχίζει από το **Next action**, χωρίς να αναλαμβάνει ότι έχει ολοκληρωθεί ό,τι είναι μόνο σε PR.


## Πάγιος κανόνας καταγραφής σφαλμάτων

**Κάθε σφάλμα ή αποτυχία ελέγχου καταγράφεται υποχρεωτικά εδώ στην ίδια εργασία, όχι εκ των υστέρων.** Η εγγραφή περιλαμβάνει: ημερομηνία/ώρα (με ζώνη όπου διατίθεται), επηρεαζόμενο σύστημα και αναγνωριστικό issue/run, παρατηρημένο σύμπτωμα και πραγματικά στοιχεία, επιβεβαιωμένη αιτία ή ρητά «άγνωστη», ενέργεια διόρθωσης με commit/PR, αποτέλεσμα επανελέγχου και κατάσταση (**OPEN**, **IN_PROGRESS**, **DONE_IN_PR**, **VERIFIED**, **DEPLOYED**, **BLOCKED**). Οι αποτυχίες που δεν έχουν επιλυθεί δεν χαρακτηρίζονται λυμένες επειδή ακολούθησε επιτυχημένο run. Όταν υπάρξει νέο εύρημα ή αλλαγή κατάστασης, ενημερώνεται η ίδια εγγραφή ή προστίθεται χρονολογική συνέχεια· δεν διαγράφεται το ιστορικό σφάλματος. **Κλείσιμο issue μόνο με τεκμηριωμένη επαλήθευση.**

## Τρόπος καταγραφής (ισχύει από την παρούσα εγγραφή)

Σε κάθε ουσιαστική αλλαγή προστίθεται εγγραφή με ημερομηνία/ώρα, αντικείμενο, `STARTED | IN_PROGRESS | BLOCKED | DONE_IN_PR | DEPLOYED | VERIFIED`, σύνδεσμο τεκμηρίου (PR/commit/CI/log), τι άλλαξε, τι **δεν** άλλαξε και **ακριβές επόμενο βήμα**. Το `DONE_IN_PR` δεν σημαίνει `DEPLOYED`. Αποτυχίες CI/deployment καταγράφονται με τα πραγματικά logs και δεν χαρακτηρίζονται επιτυχίες χωρίς επιβεβαίωση. Οι διορθώσεις ιστορικών στοιχείων/βιογραφικών απαιτούν επαληθευμένες πηγές και δεν αυτοδημοσιεύονται.

## Τρέχουσα αποτύπωση — 2026-11-02

| Αντικείμενο | Κατάσταση | Τεκμήριο / Παρατηρήσεις | Ακριβές επόμενο βήμα |
|---|---|---|---|
| News → interviews / clippings / people / events, έλεγχοι συνοχής και self-heal | **DONE_IN_PR · όχι production** | [PR #42](https://github.com/dizigs/archelaos-site/pull/42), branch `news/central-european-cup-2025-photo-heal-20261102`; ανοιχτό, unmerged, τελευταία κεφαλή `95d744c1cfdfecbd0bbc4015acbf0b36558b605b`; αλλαγές στα `rebuild/tools/build_news_media_candidates.py`, `rebuild/js/archive-catalog.js`, `rebuild/tests/news_media_candidates_test.py`, `rebuild/tools/news_pipeline_self_heal.py`, `rebuild/js/departments.js` και workflows. | Έλεγχος ταξινόμησης και end-to-end ροής σε πραγματικά, τεκμηριωμένα παραδείγματα. |
| CI στο τελευταίο PR #42 commit | **VERIFIED (GitHub Actions runs)** | 2026-11-02: `Validate website`, `ESLint JavaScript quality`, `Release integrity`, `Hall of Fame news crosscheck`, `Lighthouse CI - website quality`, `JavaScript syntax guard`, `Site release QA`, `Internal news event ledger`, `Rebuild validation`: **success**. `Validate ImgBot-only changes`: **skipped** (όχι failure). | Επανέλεγχος CI *μετά* από νέες αλλαγές. Ξεχωριστή επαλήθευση Cloudflare και τυχόν εξωτερικών checks πριν από merge. |
| Αυτόματη αναγνώριση νέων συνεντεύξεων/αποκομμάτων κατά την εισαγωγή | **DONE_IN_PR (εσωτερικές προτάσεις) · PENDING CI** | Προστέθηκε ασφαλής ανίχνευση ενδείξεων από σαφείς τίτλους σε `rebuild/tools/build_news_media_candidates.py`, commit [`a16bb11`](https://github.com/dizigs/archelaos-site/commit/a16bb110ef18bb15a2ab120391c9217e33c90ab1), με τεστ [`45589ad`](https://github.com/dizigs/archelaos-site/commit/45589ad99de556b23e3269f1461a3514672af37c). Οι προτάσεις μπαίνουν μόνο στο internal JSON ως `needs_review`; **κανένα αυτόματο tagging, αναγνώριση ταυτότητας ή δημοσίευση**. Έλεγχοι νέου commit δεν έχουν επιβεβαιωθεί ακόμη. | Επιβεβαίωση νέου GitHub CI, επιθεώρηση πραγματικών υποψηφίων και επόμενη επέκταση με τεκμηριωμένο source-level Q&A χωρίς ψευδείς ταυτοποιήσεις. |
| Υφιστάμενες 118 ειδήσεις, 28 συνεντεύξεις, 10 παλιά αποκόμματα | **REVIEW NEEDED** | Αριθμοί από προηγούμενη καταγραφή της συνεδρίας, **όχι νέα απογραφή**. Καμία μαζική αυθαίρετη ταξινόμηση. | Απογραφή πραγματικών JSON/πηγών και ασφαλής κατάταξη μόνο όπου υπάρχει τεκμήριο. |
| Πλήρες ιστορικό γεγονότων, κρυφές σελίδες/event IDs και συνδέσεις σε HOF/timelines | **IN_PROGRESS / AUDIT NEEDED** | Από προηγούμενη συζήτηση: έλεγχος μοναδικών IDs σε δύο datasets· δεν σημαίνει ότι το πλήρες ιστορικό ή οι μη δημόσιες σελίδες είναι ολοκληρωμένα. | Πλήρης απογραφή events, uniqueness, πηγές, relationships και κατάσταση μη δημόσιων σελίδων. Χωρίς έκθεση στο sitemap ώσπου να επαληθευτούν. |
| Ωριαία ανίχνευση σφαλμάτων / καθημερινός αναλυτικός έλεγχος | **PREVIOUSLY REPORTED ENABLED · NEEDS RUNTIME VERIFICATION** | Η προηγούμενη συνεδρία ανέφερε ωριαίο έλεγχο και αναλυτικό στις 10:00· δεν έχει επανελεγχθεί εδώ η επόμενη εκτέλεση ή το τελικό αποτέλεσμα. | Επιθεώρηση πραγματικών run logs, αποκλεισμός διπλοεγγραφών, τεκμηρίωση retry και ασφαλούς self-heal. |
| Cloudflare publishing | **HISTORICAL ISSUE / VERIFY CURRENT** | [Issue #43](https://github.com/dizigs/archelaos-site/issues/43) καταγράφει αποτυχίες asset publishing από προηγούμενα runs. Προηγούμενη συνομιλία ανέφερε επιτυχή preview αλλά **όχι** production merge. | Έλεγχος deployment logs στο σχετικό commit. |
| Google Ad Grants (χωριστή διοικητική εκκρεμότητα) | **ACTIVATED · SETUP PENDING** | [Issue #41](https://github.com/dizigs/archelaos-site/issues/41). Προσκλήσεις Ads / Payments, όροι χρήσης, προθεσμία Payments **2026-11-16**. Δεν έχει επαληθευτεί προβολή διαφημίσεων. | Διαχειριστής αποδέχεται προσκλήσεις, μετά καμπάνιες/μετρήσεις. Το παρόν log δεν αντικαθιστά τη διαχείριση του issue. |

## Χρονικό ενεργειών

- **2026-11-02 (συνέχεια) — DONE_IN_PR:** Δόθηκε σε κάθε νέα είδηση αυτόματη δημιουργία *εσωτερικής πρότασης* για συνέντευξη, δήλωση ή απόκομμα όταν ο τίτλος το δηλώνει ρητά. Οι προτάσεις έχουν σταθερό ID, αιτιολογία, παραπομπή στην αρχική πηγή και \u0060needs_review\u0060. Δεν ενημερώνουν τα δημόσια JSON, πρόσωπα ή χρονολόγια και δεν κάνουν merge.
- **2026-11-02 (συνέχεια) — STARTED / PENDING CI:** Προστέθηκαν regression tests για επιτρεπόμενες/λανθασμένες ταξινομήσεις, μη εξαγωγή από γενικές αναφορές σε συνέντευξη, εξαίρεση συνέντευξης Τύπου, ήδη ταξινομημένες και ανεπιβεβαίωτες ειδήσεις. Η νέα έκδοση χρειάζεται GitHub CI πριν χαρακτηριστεί επαληθευμένη.

- **2026-11-02 (παρούσα συνεδρία) — STARTED:** επιθεώρηση PR #42, ονόματος branch, changed files, πραγματικών GitHub workflow runs και Issue #41.
- **2026-11-02 (παρούσα συνεδρία) — VERIFIED:** PR #42 παραμένει **open / unmerged**, 13 commits / 17 changed files. Οι 9 καταγεγραμμένοι έλεγχοι του head commit ήταν `success`, ένας `skipped`. Καμία δήλωση για συγχώνευση ή δημοσίευση.
- **2026-11-02 (παρούσα συνεδρία) — DONE_IN_PR:** Δημιουργία του παρόντος ημερολογίου εργασιών στο branch του PR #42. Η τήρηση logs ξεκίνησε με πραγματική καταχώριση και δεν προστέθηκε ως ξεχωριστή εκκρεμότητα.
- **2026-11-02 (από προηγούμενη συνομιλία) — REPORTED:** νέα σύνδεση ειδήσεων/συνεντεύξεων/αποκομμάτων και αμυντικά tests στο PR #42· επιβεβαίωση ολοκλήρωσης μόνον όπου συνοδεύεται από συγκεκριμένο commit/CI.


## Έλεγχος PR #42 — 2026-11-02 (νεότερες διορθώσεις)

| Πρόβλημα / παρατήρηση | Ενέργεια | Commit | Κατάσταση |
|---|---|---|---|
| Οι πρόσθετες πηγές (`additionalSources`) της είδησης δεν εμφανίζονταν στον αναγνώστη | Προστέθηκε εμφάνιση συνδέσμων HTTPS με ασφαλές `rel` στο `assets/news.js` | [`fd0b032`](https://github.com/dizigs/archelaos-site/commit/fd0b032360dda0d4ab27940ee5de763697c5b829) | **DONE_IN_PR — CI επανέλεγχος εκκρεμεί** |
| Έγκυρες τοπικές φωτογραφίες σε υποφακέλους ή με κεφαλαία επέκταση θεωρούνταν λανθασμένα προς αντικατάσταση | Διορθώθηκε το `needs_archive` ώστε να δέχεται ασφαλείς nested paths και case-insensitive extensions | [`609137a`](https://github.com/dizigs/archelaos-site/commit/609137a30c35158125ccd3adda743eef1bfccb20) | **DONE_IN_PR — CI επανέλεγχος εκκρεμεί** |
| CodeRabbit: μη παρατεθειμένη εντολή εγκατάστασης Pillow στο YAML | Προστέθηκαν εισαγωγικά στο `run` του `archive-news-images.yml` | [`5a55f91`](https://github.com/dizigs/archelaos-site/commit/5a55f91cdb2e730c73260b6820cfefd736230995) | **DONE_IN_PR — CI επανέλεγχος εκκρεμεί** |
| Υπόλοιπες παρατηρήσεις CodeRabbit στο PR #42 | Εντοπίστηκαν συνολικά 16 ανοιχτά review threads πριν τις παραπάνω αλλαγές· απαιτείται έλεγχος εγκυρότητας και επιδιόρθωση των υπολοίπων | [PR #42](https://github.com/dizigs/archelaos-site/pull/42) | **IN_PROGRESS** |
| Cloudflare asset publishing / GitHub workflow no-jobs | Τα προηγούμενα failures καταγράφονται χωριστά στα [#43](https://github.com/dizigs/archelaos-site/issues/43) και [#44](https://github.com/dizigs/archelaos-site/issues/44), χωρίς τεκμηριωμένη οριστική λύση | Issues #43 / #44 | **OPEN — όχι αποδεδειγμένα επιλυμένα** |

**Δημοσίευση:** Το PR #42 δεν έχει συγχωνευτεί στο `main`· η νέα είδηση για το Central European Cup στην Κροατία **δεν έχει ακόμη επιβεβαιωθεί στο live**. Πριν από merge χρειάζεται επανέλεγχος των checks στο νεότερο head και των ουσιαστικών review comments.

## Συστηματική επιδιόρθωση PR #42 — 2026-11-02 (συνέχεια)

**Κανόνας:** Κάθε σφάλμα καταχωρίζεται με πραγματική ένδειξη, διόρθωση, commit, επαλήθευση και υπόλοιπο. «DONE_IN_PR» δεν σημαίνει «DEPLOYED».

| Τεκμηριωμένο σφάλμα / κίνδυνος | Επιδιόρθωση & αποδεικτικό commit | Κατάσταση |
|---|---|---|
| Χαλασμένη τοπική φωτογραφία μπορούσε να αντικατασταθεί με άλλη εικόνα της σελίδας αντί με την τεκμηριωμένη | Περιορισμός επισκευής στη δηλωμένη `imageSourceUrl`, απαίτηση HTTPS hostname και ξεχωριστή testable συνάρτηση: [18c93f0](https://github.com/dizigs/archelaos-site/commit/18c93f0cacf244ff8c7970deb8c4764325080fca), [c7eabf7](https://github.com/dizigs/archelaos-site/commit/c7eabf7266d3038d1e578cc4847fe1ac7559bfab), [fd43fc9](https://github.com/dizigs/archelaos-site/commit/fd43fc9ac24806f60882530ee33ad7554850d64a) | DONE_IN_PR / τελικός CI σε εξέλιξη |
| Οι αναφορές περιστατικών χάνονταν όταν απέτυχε το βήμα παραγωγής artifact | `if: always()` στο artifact upload: [b050765](https://github.com/dizigs/archelaos-site/commit/b050765e4870219e666331cef71fad07bb2358f7) | DONE_IN_PR |
| Η εύρεση παλιού issue περιοριζόταν στα 200 τελευταία και μπορούσε να δημιουργήσει διπλό | Αναζήτηση με fingerprint και έλεγχος ακριβούς τίτλου: [b050765](https://github.com/dizigs/archelaos-site/commit/b050765e4870219e666331cef71fad07bb2358f7) | DONE_IN_PR |
| Ο προέλεγχος μπορούσε να καταρρεύσει σε άκυρα IDs, αριθμητικό sourceUrl, `https://` χωρίς hostname, λάθος μορφή eventDate ή μη-string photo | Αμυντικοί έλεγχοι, σαφή incident codes, και έλεγχος κενού τίτλου: [7e34732](https://github.com/dizigs/archelaos-site/commit/7e34732b2b65c81c63ab7692f7c362174d934e04), [a3546c7](https://github.com/dizigs/archelaos-site/commit/a3546c71245775c53c80f491cf49afa4e729a151), tests [823af00](https://github.com/dizigs/archelaos-site/commit/823af00617d4bce8fe745ec9c562cfa15672bbe5) | DONE_IN_PR / τελικός CI σε εξέλιξη |
| Αποκομμένα αποκόμματα Τύπου δεν εμφανίζονταν στα Αγαπημένα | Αντιστοίχιση παλιού τύπου `interview` με `press` facet: [a6add1f](https://github.com/dizigs/archelaos-site/commit/a6add1f2c178c3218208774de70a23287c19b4a4) | DONE_IN_PR |
| Αργή φόρτωση βιογραφικών έκρυβε timeline· άκυρη ημερομηνία μπορούσε να σταματήσει όλα τα γεγονότα | Περιορισμένο 2,5 s wait και έγκυρα eventDate: [5dc3523](https://github.com/dizigs/archelaos-site/commit/5dc3523e22da7b481062be5c8df30ace97c365d5), [963643f](https://github.com/dizigs/archelaos-site/commit/963643f5055b71977f6908d83c82d644189cb7d9) | DONE_IN_PR |
| Συνέντευξη σε τοξοβολία/άλλο άθλημα εμφανιζόταν ως «Διοίκηση» και links σε παλιές συνεντεύξεις ήταν κενά | Αντιστοίχιση αθλήματος από ελληνικό `sport`, redirect του deep-link σε υπάρχον αρχείο: [f81c59f](https://github.com/dizigs/archelaos-site/commit/f81c59f21027867acb7bc48ab714dd9a1f253aa5) | DONE_IN_PR |
| **Σφάλμα κατά τη δική μας επιδιόρθωση:** σε Python/JavaScript πέρασαν κυριολεκτικές ακολουθίες `\\n` αντί για κανονικές αλλαγές γραμμής. Θα έσπαγαν τη σύνταξη. | Αποκατάσταση πραγματικών αλλαγών γραμμής και regex, πρόσθετα tests: [c7eabf7](https://github.com/dizigs/archelaos-site/commit/c7eabf7266d3038d1e578cc4847fe1ac7559bfab), [963643f](https://github.com/dizigs/archelaos-site/commit/963643f5055b71977f6908d83c82d644189cb7d9), [fd43fc9](https://github.com/dizigs/archelaos-site/commit/fd43fc9ac24806f60882530ee33ad7554850d64a) | FIXED_IN_PR / CI επί νεότερου head απαιτείται |
| CodeRabbit review threads | GitHub review threads: 16/16 resolved. Follow-up legacy interview alias implemented in `f81c59f`. | **VERIFIED_RESOLVED** |
| Ένταξη στο live | [PR #42](https://github.com/dizigs/archelaos-site/pull/42) merged: [`70d9de4`](https://github.com/dizigs/archelaos-site/commit/70d9de47f70df541711c30b06918559b89504673). Cloudflare production `aa4439ee-27a0-4b3c-b487-b29d4327fa56` success; live news.json, article and JPEG HTTP 200. | **MERGED / VERIFIED_LIVE** |

### Επαλήθευση αυτής της φάσης
- Στο head `fd43fc9`: **Validate website: success, ESLint: success, Internal news event ledger: success, Hall of Fame news crosscheck: success**. Άλλοι έλεγχοι ήταν ακόμα `pending` / `in_progress` κατά τον έλεγχο.
- Κάθε νέα αλλαγή επανεκκινεί checks· οριστικό αποτέλεσμα μόνο από το τελικό head και από production deploy logs.
- Χωριστά issues [#43](https://github.com/dizigs/archelaos-site/issues/43) και [#44](https://github.com/dizigs/archelaos-site/issues/44) παραμένουν ανοιχτά μέχρι ανεξάρτητη τεκμηρίωση επίλυσης.

## PR #42 — VERIFIED LIVE / Τελικό αρχείο αποκατάστασης · 2026-11-02

**Κλείσιμο:** [PR #42](https://github.com/dizigs/archelaos-site/pull/42) συγχωνεύτηκε στο `main`, squash commit [`70d9de47`](https://github.com/dizigs/archelaos-site/commit/70d9de47f70df541711c30b06918559b89504673). GitHub `merged: true` και `state: closed`.

**Έλεγχοι στο head `a341782c`:** `Validate website`, `JavaScript syntax guard`, `ESLint`, `Release integrity`, `Site release QA`, `Internal news event ledger`, `Hall of Fame news crosscheck`, `Lighthouse CI`, `Rebuild validation` = **success**. Μόνον `Validate ImgBot-only changes` = `skipped` (αναμενόμενο). Τα jobs του rebuild, συμπεριλαμβανομένου Chromium desktop/mobile, WCAG 2.2 A/AA, επιβεβαιώθηκαν **success**. Όλα τα 16 CodeRabbit review threads = resolved.

**Cloudflare production:** Deployment `aa4439ee-27a0-4b3c-b487-b29d4327fa56`, `environment=production`, `main`, SHA `70d9de47f70df541711c30b06918559b89504673`, `deploy.status=success`. Πραγματικό τέλος logs: `Success: Assets published!`, `Success: Your site was deployed!`.

**Δημόσια επαλήθευση:** `https://archelaos.club/news.json` HTTP 200 και 118 ειδήσεις, ανάμεσά τους `archery-central-european-cup-novi-marof-2025`. HTTP 200 στην `/news.html?article=archery-central-european-cup-novi-marof-2025` και στη φωτογραφία `/images/news/archery-central-european-cup-novi-marof-2025.jpg` (`image/jpeg`). Η επιβεβαίωση έγινε με φρέσκια δημόσια ανάκτηση (`maxAge=0`), όχι από το preview.

**Διόρθωση με καταγεγραμμένο regression:** Προσωρινό σφάλμα Python/JavaScript λόγω κυριολεκτικών `\\n` στο source (Cloudflare preview log: `SyntaxError: missing ) after argument list` σε `departments.js`). Αντιμετωπίστηκε με commits [`c7eabf7`](https://github.com/dizigs/archelaos-site/commit/c7eabf7266d3038d1e578cc4847fe1ac7559bfab) και [`963643f`](https://github.com/dizigs/archelaos-site/commit/963643f5055b71977f6908d83c82d644189cb7d9). Επιτυχές preview `8124269a-4575-4da4-b725-a61775c8113d`, επιτυχή τελικά CI και production. Το σφάλμα **δεν διαγράφηκε** από το ιστορικό.

**Χωριστά ανοιχτά θέματα:** [#43](https://github.com/dizigs/archelaos-site/issues/43) (Cloudflare intermittent asset publishing), [#44](https://github.com/dizigs/archelaos-site/issues/44) (GitHub Actions no-jobs) **δεν θεωρούνται επιλυμένα** από το επιτυχές PR #42. Το στιγμιότυπο χρήστη του SonarCloud εμφάνιζε `Quality Gate failed: C Security Rating on New Code (required A)` σε διαφορετικό main check· απαιτεί ξεχωριστή διερεύνηση πριν χαρακτηριστεί resolved.

**Μόνιμος κανόνας:** Κάθε σφάλμα/ανίχνευση/διόρθωση καταχωρίζεται εδώ ή σε αντίστοιχο tracked Issue/PR με commit, κατάσταση και πραγματική επαλήθευση. Η έλλειψη τελικού ελέγχου σημειώνεται ως pending, ποτέ ως completed.

## Ενοποιημένες συνδέσεις δημόσιου αρχείου — 2026-11-02

**Αίτημα:** Όλες οι τεκμηριωμένες δημόσιες πληροφορίες να διασυνδέονται με όλα τα συναφή πρόσωπα, ειδήσεις, χρονολόγια, τμήματα, ιστορίες, συνεντεύξεις και μουσειακά εκθέματα. Όχι αυθαίρετα συμπεράσματα ή διπλές εγγραφές. Υλικό Google Drive παραμένει ιδιωτικό μέχρι να γίνει κατάλληλη δημόσια ασφαλής αξιοποίηση.

| Ώρα/στάδιο | Τεκμηριωμένη εργασία και αιτία | Κατάσταση/επαλήθευση |
|---|---|---|
| STARTED | Έλεγχος public canonical sources `hall-of-fame-people.json` (760), `news.json` (118), `archelaos-history-events.json` (100), 70 Στιγμές, 21 Ιστορίες, 28 συνεντεύξεις και 26 εκθέματα. Έλεγχος ρητών personIds / story eventIds: **0 dangling IDs** στο ελεγχθέν σύνολο. | **CHECKED** |
| IMPLEMENTED | Δημιουργία `rebuild/tools/build_archive_relationships.py` με ένα δημόσιο γράφημα σταθερών IDs και αμφίδρομες ακμές `by_node`, χωρίς αναζήτηση ιδιωτικών δεδομένων, εικαστική ταυτοποίηση ή δεύτερο άρθρο ανά γεγονός. | **IN_PR / CI PENDING** |
| IMPLEMENTED | Ενσωμάτωση στο `rebuild/tools/build_release.py`, με `assets/site/data/archive-relationships.json` στο `dist` και τελικό έλεγχο αμφιδρομίας στο `verify_release.py`. | **IN_PR / CI PENDING** |
| IMPLEMENTED | `assets/archive-links.js` + `.css`: σύνδεσμοι σε cards/popups χωρίς διακοσμητικά βελάκια ή underline. Προστέθηκαν hooks στο κοινό popup, Hall of Fame και popup ειδήσεων. | **IN_PR / BROWSER QA PENDING** |
| IMPLEMENTED | Python tests για graph, αμφίδρομες συνδέσεις, τέσσερα πρόσωπα / ένα event Κροατίας, παλιά historical relationships, αποτυχία σε άκυρο ID, αποκλεισμό `unverified` from public linkage. Συνδέθηκαν με release CI και `news-event-ledger` CI. | **IN_PR / CI PENDING** |
| OPEN SEPARATE | SonarCloud `Quality Gate failed: C Security Rating on New Code`, περιγράφεται στο [Issue #47](https://github.com/dizigs/archelaos-site/issues/47). Χωρίς πρόσβαση στα line-level findings, δεν δηλώνεται επιλυμένο. | **OPEN** |

**Επόμενο:** Δημιουργία PR, πραγματικά tests και διόρθωση κάθε εντοπισμένου regression με νέο commit εδώ. Ούτε merge ούτε επιτυχές production υπονοούνται από την ύπαρξη commit.

## GitHub PR #43–#48: έλεγχοι ασφαλείας και διαδοχική ολοκλήρωση — 2026-11-02

- **Issue #43 · OPEN/MONITOR:** Παλαιότερες Cloudflare provider αποτυχίες στο στάδιο `deploy/assets` παρά επιτυχές build. Νεότερα previews `d1c38034`, `d553451a` και production #45 πέτυχαν, **όχι απόδειξη επιδιόρθωσης της παλιάς ασταθούς αιτίας**. Ένα ενδιάμεσο #48 failure `b51eec77` οφείλεται σε **σπασμένο static asset link** και δεν πρέπει να συγχέεται με την αρχική provider βλάβη. Το link αποκαταστάθηκε στα επόμενα commits και επιβεβαιώθηκε επιτυχές preview.
- **Issue #44 · OPEN ROOT CAUSE:** Τρεις αποτυχίες GitHub Actions χωρίς jobs στις μη κύριες branches. Έγινε προληπτική αποκατάσταση trigger μέσω [PR #45](https://github.com/dizigs/archelaos-site/pull/45): push εκτέλεση μόνο στο `main`. Παραμένει άγνωστο γιατί ο παλιός workflow scheduler απέτυχε.
- **PR #45 · MERGED:** Αρχική branch έκδοση ήταν ξεπερασμένη και θα αναιρούσε προηγούμενες επιδιορθώσεις φωτογραφιών· η `.github/workflows/archive-news-images.yml` αποκαταστάθηκε από τρέχον `main` με μόνη αλλαγή το `push.branches: main`. Commit `68e3e135`. Κατόπιν το merge μπλοκαρίστηκε (**GitHub HTTP 405: 2 of 2 required status checks expected**), επειδή η branch ήταν behind του protected main (strict policy). Το ακριβές ruleset GitHub `26357426` απαιτεί `JavaScript syntax (all site scripts)` και `ESLint JavaScript quality`. Δημιουργήθηκε fast-forward merge commit `a539478c` με δύο γονείς (feature + current main), διατηρώντας τα διορθωμένα περιεχόμενα. Όλα τα required checks, SonarCloud, Lighthouse, Cloudflare Preview και Release Integrity **success**. Squash merge στο `main`: [`ce7db057`](https://github.com/dizigs/archelaos-site/commit/ce7db057e5c8cd7837e4940f6db5b8be14ccce41). Cloudflare production `e868d5e0-3f56-4119-8f9a-06a4c4be0e62`: **success**, πραγματικά logs `Success: Assets published!` / `Success: Your site was deployed!`.
- **PR #48 · IN_PROGRESS:** Νέο δημόσιο reciprocal graph, UI συνδέσμων, ελεγκτές παραπομπών, tests και logs. Συνδέθηκε επιπλέον το ειδικό custom popup των Φωνών μέσω [`68e6c26`](https://github.com/dizigs/archelaos-site/commit/68e6c26ecd680082222e870a25d4fa5d9d365be1). Τα CI του νέου head απαιτούν επανέλεγχο και συγχρονισμό με `main` μετά το #45.
- **NotebookLM / Shared Drive · RESEARCH:** Παραλήφθηκε 8σέλιδο παράγωγο μητρώο μεταλλίων, επιτυχιών και σκορ (πηγές: έγγραφα στο ίδιο ιστορικό Drive). Δεν είναι ξεχωριστή πρωτογενής πηγή. Εντοπίστηκαν στα περιεχόμενα του Drive τα πρωτότυπα έγγραφα για Κύπελλο Χάντμπολ, Titov Veles, Τοξοβολία/ΕΦΟΤ, Σκοποβολή/ΣΚΟΕ και τα αριθμημένα αποκόμματα Τύπου. **Δεν έχουν ακόμη επαληθευτεί μία προς μία οι επιδόσεις με το πρωτότυπο**, ούτε δημοσιεύτηκαν αυτόματα ιστορικές εγγραφές από τη σύνθεση. Η σελίδα καλαθοσφαίρισης του παραγώγου απαιτεί ιδιαίτερη διάκριση ΓΑΣ vs. συγχωνευμένου ΣΦΚ.
- **Issue #47 · OPEN:** SonarCloud main Quality Gate screenshot (Security C) απαιτεί πρωτογενή issue-level ευρήματα. Το SonarCloud Quality Gate για PR #45 και #48 **success** δεν αρκεί για να χαρακτηριστεί κλειστό το παλαιότερο main θέμα.

**Κανόνας:** Κρατούμε ακόμη και τα προσωρινά σφάλματα με πραγματικό commit, URL, διόρθωση και τελικό έλεγχο. Ούτε status success preview ούτε βήμα build ισοδυναμούν με production επιτυχία χωρίς deployment logs.

## PR #48 — CodeRabbit review / τελικές επιδιορθώσεις (2026-11-02)

| Παρατήρηση / βλάβη | Διόρθωση | Κατάσταση |
|---|---|---|
| Χαμηλή αντίθεση στην ετικέτα τύπου αρχείου έναντι ανοιχτόχρωμου card/hover | `assets/archive-links.css`: σκούρο χρυσό `#6f5a2a`, commit `d8c5f07` | FIXED_IN_PR / QA pending |
| Ελληνικές ετικέτες ακόμη και όταν `document.lang=en` | `assets/archive-links.js`: κατάλληλες label/aria ετικέτες, commit `a039870`; δεν επανέρχεται toggle γλώσσας | FIXED_IN_PR / QA pending |
| Οι κάρτες αθλητικών τμημάτων χρησιμοποιούσαν favourite key `page:department-...` αντί του canonical `department:key` | Ξεχωριστό `relation` ID χωρίς αλλαγή στα Αγαπημένα, commits `24aa899` / `c0adc34` | FIXED_IN_PR / browser QA pending |
| Τα ίδια δύο στοιχεία με διαφορετικές σχέσεις παρήγαν διπλές αμφίδρομες ακμές | `build_archive_relationships.py`: μία ακμή ανά ταξινομημένο ζεύγος κόμβων + regression test, commits `5c6a482` / `65035ea` | FIXED_IN_PR / CI pending |

**Σημείωση:** Δεν είναι εντολή να καταργηθεί CodeRabbit security/quality check. Τα σχόλια επιλύονται μόνο μετά από θετική επαλήθευση των συγκεκριμένων αλλαγών στο τελικό head. Χωρίς ολοκληρωμένα required checks δεν γίνεται merge.

## Αρχειακή τεκμηρίωση — οριστική οδηγία και αυτοματισμοί · 2026-11-02

- **Οδηγία διαχειριστή:** Όσα αποτελέσματα, ονόματα, συμμετοχές, ημερομηνίες και γεγονότα είναι καθαρά αναγνώσιμα στα αρχειακά κείμενα θεωρούνται επαρκώς τεκμηριωμένα για εμπλουτισμό, χωρίς αίτημα ξεχωριστής έγκρισης ή υποχρεωτική αναζήτηση δεύτερης ανεξάρτητης πηγής. Η πηγή/σελίδα και ο χαρακτήρας του τεκμηρίου (πρωτότυπο έναντι NotebookLM σύνθεσης) διατηρούνται. Ειδικές αντιφάσεις, αβέβαιες ταυτότητες, προσωπικά δεδομένα και διαχωρισμός συγχωνευμένου μπάσκετ παραμένουν οριοθετημένες εκκρεμότητες και δεν μπλοκάρουν άλλα σαφή στοιχεία.
- **UPDATED AND READ-BACK:** Οι τρεις ενεργοί αυτοματισμοί `Νέα & ανάπτυξη Αρχέλαου`, `Έλεγχος site & αρχείου Drive`, `Συνεισφορές & ωριαίο self-heal` ενημερώθηκαν επιτυχώς με ρητό κανόνα `ΡΗΤΟΣ ΚΑΝΟΝΑΣ ΑΡΧΕΙΑΚΗΣ ΤΕΚΜΗΡΙΩΣΗΣ`. Αντίστοιχες τελευταίες επιτυχημένες ενημερώσεις: 2026-11-02 18:22:12, 18:22:16, 18:22:21 UTC.
- **NO CLAIM OF DATA IMPORT:** Η ενημέρωση του prompt δεν ισοδυναμεί με νέα καταχώριση στο δημόσιο μητρώο. Οι αλλαγές στο site απαιτούν ξεχωριστά commits, tests, merge και production logs. Οι ιδιωτικές πηγές Drive δεν δημοσιεύονται αυτούσιες χωρίς νόμιμη βάση.

## Πηγές από συνομιλίες / ασφαλής αρχειοθέτηση — 2026-11-02

- **STARTED → COMPLETED:** Δημιουργήθηκε μέσα στον ιδιωτικό κύριο φάκελο του ΓΑΣ στο Google Drive υποφάκελος «Πηγές από ChatGPT — Τεκμήρια & συνθέσεις». Ελέγχθηκε ότι ο στόχος είναι ο σωστός γονικός φάκελος και ότι η μεταφόρτωση επιστρέφει εκεί.
- **ARCHIVED & READ-BACK VERIFIED:** Το PDF που υπέβαλε ο χρήστης, οκτασέλιδη σύνθεση του NotebookLM με κατάλογο μεταλλίων/διακρίσεων/σκορ, αποθηκεύτηκε ως νέο τεκμήριο. Έγινε αναζήτηση στον φάκελο και επαλήθευση τύπου PDF, μεγέθους και γονικού φακέλου. **Το NotebookLM δεν λογίζεται δεύτερη ανεξάρτητη πηγή** απέναντι στις πρωτογενείς αρχειακές σελίδες.
- **DEDUPED:** Προϋπάρχον πρωτότυπο από τον ίδιο ιστορικό χώρο Google Drive δεν αντιγράφηκε ξανά. Στιγμιότυπα GitHub/Cloudflare checks δεν καταχωρίστηκαν ως αθλητικές/ιστορικές πηγές. Ιδιωτικά URLs/IDs και στοιχεία τρίτων δεν προστίθενται στο δημόσιο log.
- **AUTOMATION UPDATED:** Στα υπάρχοντα schedules «Έλεγχος site & αρχείου Drive» και «Συνεισφορές & ωριαίο self-heal» προστέθηκε ρητή παρακολούθηση του νέου υποφακέλου για καινούρια/τροποποιημένα αρχειακά τεκμήρια. Πρόκειται για επιτυχή αλλαγή scheduled instructions, όχι τεκμήριο ότι έχει ήδη εκτελεστεί η επόμενη βαθιά έρευνα ή δημοσίευση.
- **UI regression FIXED_IN_PR:** Στο κοινό popup ακυρώνεται προηγούμενη ασύγχρονη φόρτωση συνδέσεων όταν αλλάζει η τρέχουσα εγγραφή. Commit [`b5697d13`](https://github.com/dizigs/archelaos-site/commit/b5697d13fac868352911b9a2c0118bd28a3a7053). Τελικό CI απαιτείται πριν από merge.

## PR #48: αμφίδρομη δημόσια διασύνδεση — VERIFIED LIVE / 2026-11-02

- **MERGED:** [PR #48](https://github.com/dizigs/archelaos-site/pull/48), squash commit [`936178196d6926fcf61dc5473483e22ba3c8b852`](https://github.com/dizigs/archelaos-site/commit/936178196d6926fcf61dc5473483e22ba3c8b852) στο `main`. GitHub αναφέρει `merged=true`, `state=closed`.
- **FINAL CI:** `Release integrity`, `Lighthouse CI`, `Rebuild validation`, `JavaScript syntax guard`, `ESLint`, `Site release QA`, `Hall of Fame news crosscheck`, `Validate website`, `Internal news event ledger` = **success** στο head `3fce236fce92cc4a18c5888be264eae553b1c745`. `Validate ImgBot-only changes` = `skipped` (αναμενόμενο). Τα 3 jobs του Rebuild validation (HTML/data, Chromium desktop/mobile, release assembly) = success. SonarCloud PR Quality Gate = success· CodeRabbit review threads **4/4 resolved** μετά τις τεκμηριωμένες επιδιορθώσεις χρωματικής αντίθεσης WCAG, ετικετών γλώσσας, relation keys και μοναδικών ζευγών.
- **CLOUDFLARE PRODUCTION:** Deployment `56f3ba20-1eb2-4665-a257-97921e10719f`, `production`, SHA `93617819`, `deploy.status=success`. Πραγματικό τέλος logs: `Success: Assets published!`, `Success: Your site was deployed!`.
- **PUBLIC LIVE:** Fresh public HTTP 200 για `https://archelaos.club/assets/site/data/archive-relationships.json` (schema `explicit_public_references_only`, περιλαμβάνει event/people σχέσεις Κροατίας), `/assets/archive-links.js` και `/news.html`. Δεν δηλώνεται ειδικό click-by-click user test πέρα από τα επιτυχή Chromium CI.
- **SCOPE:** Ενσωματώθηκε μηχανισμός αμφίδρομων **συνδέσμων από ρητές ήδη υπάρχουσες αναφορές**. Αυτό **δεν** αποτελεί ακόμη πλήρως αυτοματοποιημένη εγγραφή νέων facts στο βασικό JSON βιογραφικών/ιστορικών γεγονότων ή σύστημα thumbs up/down.

### Αποθήκευση πηγών ChatGPT — οριστικός προορισμός και διόρθωση

- **PROBLEM DETECTED:** Αρχικά καταχωρίστηκε φάκελος ChatGPT και οκτασέλιδη παράγωγη σύνθεση NotebookLM κάτω από ομώνυμο **προσωπικό** φάκελο και όχι στο πραγματικό Κοινόχρηστο Drive.
- **CORRECTION VERIFIED:** Με `Google Drive list_drives` εντοπίστηκε το πραγματικό «ΓΑΣ Αρχέλαος | Ψηφιακό Μουσείο». Δημιουργήθηκε οριστικός υποφάκελος κάτω από «05 · Ευρετήριο και τεκμηρίωση» και αντιγράφηκε το PDF. Metadata/readback επιβεβαίωσε `drive_id`, ακριβή γονικό φάκελο, `application/pdf`, 248081 bytes και παρουσία στον κατάλογο. Οι **δικές μας προσωρινές αντιγραφές** PDF και προσωπικού φακέλου διαγράφηκαν μετά την επιβεβαίωση, χωρίς αλλαγή σε παλαιά πρωτότυπα.
- **SCHEDULES:** Τα δύο ήδη ενεργά scheduled jobs `Έλεγχος site & αρχείου Drive` και `Συνεισφορές & ωριαίο self-heal` ενημερώθηκαν με τον οριστικό Shared Drive υποφάκελο και επιβεβαιώθηκε με δεύτερη ανάγνωση ότι τα παλιά IDs δεν εμφανίζονται πλέον. Ενημέρωση prompt **δεν** ισοδυναμεί με πραγματική ολοκλήρωση εκτέλεσης/εισαγωγής νέων ειδήσεων.
- **SOURCE PROVENANCE:** Το NotebookLM PDF είναι **σύνθεση από αρχειακά έγγραφα**, όχι ανεξάρτητη πρωτογενής δημοσίευση. Η ημερομηνία 28/07/1994 που αναφέρει για την επίδοση μήκους 8,36 μ. του Κώστα Κουκοδήμου συγκρούεται με την τεκμηριωμένη 05/06/1994. Ελέγχθηκε δημοσίως με Σύλλογο Ελλήνων Ολυμπιονικών και άρθρο της εφημερίδας `ΤΑ ΝΕΑ` (1999). Παραμένει η 05/06/1994 στο υπάρχον βιογραφικό. Το υπόλοιπο σαφές υλικό παραμένει αξιοποιήσιμο με δική του προέλευση.
- **PRIVACY:** Ιδιωτικά links και Drive IDs, προσωπικά στοιχεία υποβολών και πρωτότυπα αρχεία δεν καταχωρίζονται στο δημόσιο GitHub log.

**Επόμενα ξεχωριστά θέματα:** Ολοκλήρωση του μηχανισμού εγγραφής νέων τεκμηριωμένων γεγονότων/βιογραφικών, τα ανοικτά περιστατικά GitHub/Cloudflare [#43](https://github.com/dizigs/archelaos-site/issues/43), [#44](https://github.com/dizigs/archelaos-site/issues/44), και το αποτυχημένο SonarCloud main Quality Gate [#47](https://github.com/dizigs/archelaos-site/issues/47). Καμία από αυτές τις εκκρεμότητες δεν δηλώνεται επιλυμένη από το PR #48.

## SonarCloud main Quality Gate — έξι συγκεκριμένα ζητήματα / 2026-11-02

**STARTED:** Το SonarCloud στο main είχε `Quality Gate failed — C Security Rating on New Code (required A)`. Δεν θεωρούμε το πράσινο PR Sonar check απόδειξη ότι επιλύθηκαν οι παλαιότερες επισημάνσεις στο main. Η ζωντανή λίστα `OPEN,CONFIRMED` / new code εμφάνισε 6 ευρήματα σε 3 GitHub Actions workflows. Καταχωρίστηκαν μαζί με Sonar finding IDs στο [Issue #47](https://github.com/dizigs/archelaos-site/issues/47).

| Ευρεθέν πρόβλημα | Διόρθωση στο branch | Απόδειξη / κατάσταση |
|---|---|---|
| `google-analytics-aggregate.yml:19`: floating `google-github-actions/auth@v2`, High | Πλήρες commit SHA από το επίσημο GitHub tag ref: `c200f3691d83b41bf9bbd8638997a462592937ed` | `9991224` / IN_PR |
| `google-analytics-aggregate.yml:27`: pip μπορεί να εκτελέσει source setup scripts | `python -m pip install --only-binary=:all:` με ήδη pinned packages | `9991224` / IN_PR |
| `eslint-guard.yml:22`: `npx` εγκαθιστά/εκτελεί on-demand scripts | `npm install --no-save --no-package-lock --ignore-scripts eslint@9.39.1` και τοπικό `./node_modules/.bin/eslint` | `d3a9ce6` / IN_PR |
| `live-site-guard.yml:23`: npm εγκατάσταση με lifecycle scripts | Προσθήκη `--ignore-scripts` και `--no-package-lock`, διατήρηση pinned `playwright@1.56.1` | `4ee5223` / IN_PR |
| `live-site-guard.yml:24`: δυνατότητα `npx` για on-demand εγκατάσταση | Άμεση εκτέλεση ήδη εγκατεστημένου `./node_modules/.bin/playwright` | `4ee5223` / IN_PR |
| `live-site-guard.yml:24`: μη δηλωμένη exact version στο `npx` | Ενιαία, ρητή τοπική `playwright@1.56.1` | `4ee5223` / IN_PR |
| Κίνδυνος παλινδρόμησης σε επόμενη αλλαγή workflow | Νέα offline tests: `rebuild/tests/security_workflows_test.py`, ενσωμάτωση στο `Release integrity` CI | `e761ee4` / `678addc` / CI PENDING |

**Έλεγχοι που απαιτούνται πριν το merge:** πραγματικά νέα tests, GitHub JavaScript syntax + ESLint, SonarCloud PR Quality Gate, Release integrity, Lighthouse και Cloudflare preview. Μετά το merge απαιτείται **νέο SonarCloud check στο `main`** και πραγματικό Cloudflare production log πριν δηλωθεί διορθωμένο ή δημοσιευμένο. Δε γίνονται suppressions, acceptances ή χαλάρωση του quality gate.

## SonarCloud after PR #51 — actionlint dependency lock regression (2026-11-02)

- **INCIDENT:** GitHub CI/actionlint for PR #51 and Cloudflare production were successful; however the subsequent **main** SonarCloud scan found **1 new Medium Security issue**, causing `Quality Gate failed`: `.github/workflows/actionlint-guard.yml:29` used `go install ...@v1.7.11` without explicit `go.mod/go.sum` dependency-lock enforcement. Finding https://sonarcloud.io/project/issues?open=AaGdtZKK-wJaCmcKf5js&id=dizigs_archelaos-site . Filed [Issue #53](https://github.com/dizigs/archelaos-site/issues/53). Previous Issue #47 (six old findings) remains separately closed.
- **FIX PREPARED:** Fetch upstream `rhysd/actionlint` tag `v1.7.11` and **verify the exact immutable commit** `393031adb9afb225ee52ae2ccd7a5af5525e03e8` before executing its code. Run upstream `go mod verify` and `go build -mod=readonly` using its versioned `go.mod` and `go.sum`. Pin Go runtime to `1.27.3`; remove the unsafe `go install ...@version` path. No loosening of Sonar, no additional cron.
- **RETEST REQUIRED:** PR actionlint and all required CI, official PR Sonar, protected merge, **main Sonar Quality Gate / zero open new-code findings**, real Cloudflare production logs. Mark #53 resolved only after verification.

# Archelaos — Operational work log / Ημερολόγιο εργασιών

> Ενεργό αρχείο εργασίας, **όχι λίστα «να φτιάξουμε αργότερα logs»**.  
> Ώρα καταγραφής: 2026-11-02, Ελλάδα (Europe/Athens).  
> Κεντρικό έργο: `dizigs/archelaos-site`. Κάθε νέα συνεδρία εργασιών πρέπει να διαβάζει αυτό το αρχείο και να συνεχίζει από το **Next action**, χωρίς να αναλαμβάνει ότι έχει ολοκληρωθεί ό,τι είναι μόνο σε PR.


## Πάγιος κανόνας καταγραφής σφαλμάτων

**Κάθε σφάλμα ή αποτυχία ελέγχου καταγράφεται υποχρεωτικά εδώ στην ίδια εργασία, όχι εκ των υστέρων.** Η εγγραφή περιλαμβάνει: ημερομηνία/ώρα (με ζώνη όπου διατίθεται), επηρεαζόμενο σύστημα και αναγνωριστικό issue/run, παρατηρημένο σύμπτωμα και πραγματικά στοιχεία, επιβεβαιωμένη αιτία ή ρητά «άγνωστη», ενέργεια διόρθωσης με commit/PR, αποτέλεσμα επανελέγχου και κατάσταση (**OPEN**, **IN_PROGRESS**, **DONE_IN_PR**, **VERIFIED**, **DEPLOYED**, **BLOCKED**). Οι αποτυχίες που δεν έχουν επιλυθεί δεν χαρακτηρίζονται λυμένες επειδή ακολούθησε επιτυχημένο run. Όταν υπάρξει νέο εύρημα ή αλλαγή κατάστασης, ενημερώνεται η ίδια εγγραφή ή προστίθεται χρονολογική συνέχεια· δεν διαγράφεται το ιστορικό σφάλματος. **Κλείσιμο issue μόνο με τεκμηριωμένη επαλήθευση.**

## Τρόπος καταγραφής (ισχύει από την παρούσα εγγραφή)

Σε κάθε ουσιαστική αλλαγή προστίθεται εγγραφή με ημερομηνία/ώρα, αντικείμενο, `STARTED | IN_PROGRESS | BLOCKED | DONE_IN_PR | DEPLOYED | VERIFIED`, σύνδεσμο τεκμηρίου (PR/commit/CI/log), τι άλλαξε, τι **δεν** άλλαξε και **ακριβές επόμενο βήμα**. Το `DONE_IN_PR` δεν σημαίνει `DEPLOYED`. Αποτυχίες CI/deployment καταγράφονται με τα πραγματικά logs και δεν χαρακτηρίζονται επιτυχίες χωρίς επιβεβαίωση. Οι διορθώσεις ιστορικών στοιχείων/βιογραφικών απαιτούν επαληθευμένες πηγές και δεν αυτοδημοσιεύονται.

## Τρέχουσα αποτύπωση — 2026-11-02

| Αντικείμενο | Κατάσταση | Τεκμήριο / Παρατηρήσεις | Ακριβές επόμενο βήμα |
|---|---|---|---|
| News → interviews / clippings / people / events, έλεγχοι συνοχής και self-heal | **DONE_IN_PR · όχι production** | [PR #42](https://github.com/dizigs/archelaos-site/pull/42), branch `news/central-european-cup-2025-photo-heal-20261102`; ανοιχτό, unmerged, τελευταία κεφαλή `95d744c1cfdfecbd0bbc4015acbf0b36558b605b`; αλλαγές στα `rebuild/tools/build_news_media_candidates.py`, `rebuild/js/archive-catalog.js`, `rebuild/tests/news_media_candidates_test.py`, `rebuild/tools/news_pipeline_self_heal.py`, `rebuild/js/departments.js` και workflows. | Έλεγχος ταξινόμησης και end-to-end ροής σε πραγματικά, τεκμηριωμένα παραδείγματα. |
| CI στο τελευταίο PR #42 commit | **VERIFIED (GitHub Actions runs)** | 2026-11-02: `Validate website`, `ESLint JavaScript quality`, `Release integrity`, `Hall of Fame news crosscheck`, `Lighthouse CI - website quality`, `JavaScript syntax guard`, `Site release QA`, `Internal news event ledger`, `Rebuild validation`: **success**. `Validate ImgBot-only changes`: **skipped** (όχι failure). | Επανέλεγχος CI *μετά* από νέες αλλαγές. Ξεχωριστή επαλήθευση Cloudflare και τυχόν εξωτερικών checks πριν από merge. |
| Αυτόματη αναγνώριση νέων συνεντεύξεων/αποκομμάτων κατά την εισαγωγή | **DONE_IN_PR (εσωτερικές προτάσεις) · PENDING CI** | Προστέθηκε ασφαλής ανίχνευση ενδείξεων από σαφείς τίτλους σε `rebuild/tools/build_news_media_candidates.py`, commit [`a16bb11`](https://github.com/dizigs/archelaos-site/commit/a16bb110ef18bb15a2ab120391c9217e33c90ab1), με τεστ [`45589ad`](https://github.com/dizigs/archelaos-site/commit/45589ad99de556b23e3269f1461a3514672af37c). Οι προτάσεις μπαίνουν μόνο στο internal JSON ως `needs_review`; **κανένα αυτόματο tagging, αναγνώριση ταυτότητας ή δημοσίευση**. Έλεγχοι νέου commit δεν έχουν επιβεβαιωθεί ακόμη. | Επιβεβαίωση νέου GitHub CI, επιθεώρηση πραγματικών υποψηφίων και επόμενη επέκταση με τεκμηριωμένο source-level Q&A χωρίς ψευδείς ταυτοποιήσεις. |
| Υφιστάμενες 118 ειδήσεις, 28 συνεντεύξεις, 10 παλιά αποκόμματα | **REVIEW NEEDED** | Αριθμοί από προηγούμενη καταγραφή της συνεδρίας, **όχι νέα απογραφή**. Καμία μαζική αυθαίρετη ταξινόμηση. | Απογραφή πραγματικών JSON/πηγών και ασφαλής κατάταξη μόνο όπου υπάρχει τεκμήριο. |
| Πλήρες ιστορικό γεγονότων, κρυφές σελίδες/event IDs και συνδέσεις σε HOF/timelines | **IN_PROGRESS / AUDIT NEEDED** | Από προηγούμενη συζήτηση: έλεγχος μοναδικών IDs σε δύο datasets· δεν σημαίνει ότι το πλήρες ιστορικό ή οι μη δημόσιες σελίδες είναι ολοκληρωμένα. | Πλήρης απογραφή events, uniqueness, πηγές, relationships και κατάσταση μη δημόσιων σελίδων. Χωρίς έκθεση στο sitemap ώσπου να επαληθευτούν. |
| Ωριαία ανίχνευση σφαλμάτων / καθημερινός αναλυτικός έλεγχος | **PREVIOUSLY REPORTED ENABLED · NEEDS RUNTIME VERIFICATION** | Η προηγούμενη συνεδρία ανέφερε ωριαίο έλεγχο και αναλυτικό στις 10:00· δεν έχει επανελεγχθεί εδώ η επόμενη εκτέλεση ή το τελικό αποτέλεσμα. | Επιθεώρηση πραγματικών run logs, αποκλεισμός διπλοεγγραφών, τεκμηρίωση retry και ασφαλούς self-heal. |
| Cloudflare publishing | **HISTORICAL ISSUE / VERIFY CURRENT** | [Issue #43](https://github.com/dizigs/archelaos-site/issues/43) καταγράφει αποτυχίες asset publishing από προηγούμενα runs. Προηγούμενη συνομιλία ανέφερε επιτυχή preview αλλά **όχι** production merge. | Έλεγχος deployment logs στο σχετικό commit. |
| Google Ad Grants (χωριστή διοικητική εκκρεμότητα) | **ACTIVATED · SETUP PENDING** | [Issue #41](https://github.com/dizigs/archelaos-site/issues/41). Προσκλήσεις Ads / Payments, όροι χρήσης, προθεσμία Payments **2026-11-16**. Δεν έχει επαληθευτεί προβολή διαφημίσεων. | Διαχειριστής αποδέχεται προσκλήσεις, μετά καμπάνιες/μετρήσεις. Το παρόν log δεν αντικαθιστά τη διαχείριση του issue. |

## Χρονικό ενεργειών

- **2026-11-02 (συνέχεια) — DONE_IN_PR:** Δόθηκε σε κάθε νέα είδηση αυτόματη δημιουργία *εσωτερικής πρότασης* για συνέντευξη, δήλωση ή απόκομμα όταν ο τίτλος το δηλώνει ρητά. Οι προτάσεις έχουν σταθερό ID, αιτιολογία, παραπομπή στην αρχική πηγή και \u0060needs_review\u0060. Δεν ενημερώνουν τα δημόσια JSON, πρόσωπα ή χρονολόγια και δεν κάνουν merge.
- **2026-11-02 (συνέχεια) — STARTED / PENDING CI:** Προστέθηκαν regression tests για επιτρεπόμενες/λανθασμένες ταξινομήσεις, μη εξαγωγή από γενικές αναφορές σε συνέντευξη, εξαίρεση συνέντευξης Τύπου, ήδη ταξινομημένες και ανεπιβεβαίωτες ειδήσεις. Η νέα έκδοση χρειάζεται GitHub CI πριν χαρακτηριστεί επαληθευμένη.

- **2026-11-02 (παρούσα συνεδρία) — STARTED:** επιθεώρηση PR #42, ονόματος branch, changed files, πραγματικών GitHub workflow runs και Issue #41.
- **2026-11-02 (παρούσα συνεδρία) — VERIFIED:** PR #42 παραμένει **open / unmerged**, 13 commits / 17 changed files. Οι 9 καταγεγραμμένοι έλεγχοι του head commit ήταν `success`, ένας `skipped`. Καμία δήλωση για συγχώνευση ή δημοσίευση.
- **2026-11-02 (παρούσα συνεδρία) — DONE_IN_PR:** Δημιουργία του παρόντος ημερολογίου εργασιών στο branch του PR #42. Η τήρηση logs ξεκίνησε με πραγματική καταχώριση και δεν προστέθηκε ως ξεχωριστή εκκρεμότητα.
- **2026-11-02 (από προηγούμενη συνομιλία) — REPORTED:** νέα σύνδεση ειδήσεων/συνεντεύξεων/αποκομμάτων και αμυντικά tests στο PR #42· επιβεβαίωση ολοκλήρωσης μόνον όπου συνοδεύεται από συγκεκριμένο commit/CI.


## Έλεγχος PR #42 — 2026-11-02 (νεότερες διορθώσεις)

| Πρόβλημα / παρατήρηση | Ενέργεια | Commit | Κατάσταση |
|---|---|---|---|
| Οι πρόσθετες πηγές (`additionalSources`) της είδησης δεν εμφανίζονταν στον αναγνώστη | Προστέθηκε εμφάνιση συνδέσμων HTTPS με ασφαλές `rel` στο `assets/news.js` | [`fd0b032`](https://github.com/dizigs/archelaos-site/commit/fd0b032360dda0d4ab27940ee5de763697c5b829) | **DONE_IN_PR — CI επανέλεγχος εκκρεμεί** |
| Έγκυρες τοπικές φωτογραφίες σε υποφακέλους ή με κεφαλαία επέκταση θεωρούνταν λανθασμένα προς αντικατάσταση | Διορθώθηκε το `needs_archive` ώστε να δέχεται ασφαλείς nested paths και case-insensitive extensions | [`609137a`](https://github.com/dizigs/archelaos-site/commit/609137a30c35158125ccd3adda743eef1bfccb20) | **DONE_IN_PR — CI επανέλεγχος εκκρεμεί** |
| CodeRabbit: μη παρατεθειμένη εντολή εγκατάστασης Pillow στο YAML | Προστέθηκαν εισαγωγικά στο `run` του `archive-news-images.yml` | [`5a55f91`](https://github.com/dizigs/archelaos-site/commit/5a55f91cdb2e730c73260b6820cfefd736230995) | **DONE_IN_PR — CI επανέλεγχος εκκρεμεί** |
| Υπόλοιπες παρατηρήσεις CodeRabbit στο PR #42 | Εντοπίστηκαν συνολικά 16 ανοιχτά review threads πριν τις παραπάνω αλλαγές· απαιτείται έλεγχος εγκυρότητας και επιδιόρθωση των υπολοίπων | [PR #42](https://github.com/dizigs/archelaos-site/pull/42) | **IN_PROGRESS** |
| Cloudflare asset publishing / GitHub workflow no-jobs | Τα προηγούμενα failures καταγράφονται χωριστά στα [#43](https://github.com/dizigs/archelaos-site/issues/43) και [#44](https://github.com/dizigs/archelaos-site/issues/44), χωρίς τεκμηριωμένη οριστική λύση | Issues #43 / #44 | **OPEN — όχι αποδεδειγμένα επιλυμένα** |

**Δημοσίευση:** Το PR #42 δεν έχει συγχωνευτεί στο `main`· η νέα είδηση για το Central European Cup στην Κροατία **δεν έχει ακόμη επιβεβαιωθεί στο live**. Πριν από merge χρειάζεται επανέλεγχος των checks στο νεότερο head και των ουσιαστικών review comments.

## Συστηματική επιδιόρθωση PR #42 — 2026-11-02 (συνέχεια)

**Κανόνας:** Κάθε σφάλμα καταχωρίζεται με πραγματική ένδειξη, διόρθωση, commit, επαλήθευση και υπόλοιπο. «DONE_IN_PR» δεν σημαίνει «DEPLOYED».

| Τεκμηριωμένο σφάλμα / κίνδυνος | Επιδιόρθωση & αποδεικτικό commit | Κατάσταση |
|---|---|---|
| Χαλασμένη τοπική φωτογραφία μπορούσε να αντικατασταθεί με άλλη εικόνα της σελίδας αντί με την τεκμηριωμένη | Περιορισμός επισκευής στη δηλωμένη `imageSourceUrl`, απαίτηση HTTPS hostname και ξεχωριστή testable συνάρτηση: [18c93f0](https://github.com/dizigs/archelaos-site/commit/18c93f0cacf244ff8c7970deb8c4764325080fca), [c7eabf7](https://github.com/dizigs/archelaos-site/commit/c7eabf7266d3038d1e578cc4847fe1ac7559bfab), [fd43fc9](https://github.com/dizigs/archelaos-site/commit/fd43fc9ac24806f60882530ee33ad7554850d64a) | DONE_IN_PR / τελικός CI σε εξέλιξη |
| Οι αναφορές περιστατικών χάνονταν όταν απέτυχε το βήμα παραγωγής artifact | `if: always()` στο artifact upload: [b050765](https://github.com/dizigs/archelaos-site/commit/b050765e4870219e666331cef71fad07bb2358f7) | DONE_IN_PR |
| Η εύρεση παλιού issue περιοριζόταν στα 200 τελευταία και μπορούσε να δημιουργήσει διπλό | Αναζήτηση με fingerprint και έλεγχος ακριβούς τίτλου: [b050765](https://github.com/dizigs/archelaos-site/commit/b050765e4870219e666331cef71fad07bb2358f7) | DONE_IN_PR |
| Ο προέλεγχος μπορούσε να καταρρεύσει σε άκυρα IDs, αριθμητικό sourceUrl, `https://` χωρίς hostname, λάθος μορφή eventDate ή μη-string photo | Αμυντικοί έλεγχοι, σαφή incident codes, και έλεγχος κενού τίτλου: [7e34732](https://github.com/dizigs/archelaos-site/commit/7e34732b2b65c81c63ab7692f7c362174d934e04), [a3546c7](https://github.com/dizigs/archelaos-site/commit/a3546c71245775c53c80f491cf49afa4e729a151), tests [823af00](https://github.com/dizigs/archelaos-site/commit/823af00617d4bce8fe745ec9c562cfa15672bbe5) | DONE_IN_PR / τελικός CI σε εξέλιξη |
| Αποκομμένα αποκόμματα Τύπου δεν εμφανίζονταν στα Αγαπημένα | Αντιστοίχιση παλιού τύπου `interview` με `press` facet: [a6add1f](https://github.com/dizigs/archelaos-site/commit/a6add1f2c178c3218208774de70a23287c19b4a4) | DONE_IN_PR |
| Αργή φόρτωση βιογραφικών έκρυβε timeline· άκυρη ημερομηνία μπορούσε να σταματήσει όλα τα γεγονότα | Περιορισμένο 2,5 s wait και έγκυρα eventDate: [5dc3523](https://github.com/dizigs/archelaos-site/commit/5dc3523e22da7b481062be5c8df30ace97c365d5), [963643f](https://github.com/dizigs/archelaos-site/commit/963643f5055b71977f6908d83c82d644189cb7d9) | DONE_IN_PR |
| Συνέντευξη σε τοξοβολία/άλλο άθλημα εμφανιζόταν ως «Διοίκηση» και links σε παλιές συνεντεύξεις ήταν κενά | Αντιστοίχιση αθλήματος από ελληνικό `sport`, redirect του deep-link σε υπάρχον αρχείο: [f81c59f](https://github.com/dizigs/archelaos-site/commit/f81c59f21027867acb7bc48ab714dd9a1f253aa5) | DONE_IN_PR |
| **Σφάλμα κατά τη δική μας επιδιόρθωση:** σε Python/JavaScript πέρασαν κυριολεκτικές ακολουθίες `\\n` αντί για κανονικές αλλαγές γραμμής. Θα έσπαγαν τη σύνταξη. | Αποκατάσταση πραγματικών αλλαγών γραμμής και regex, πρόσθετα tests: [c7eabf7](https://github.com/dizigs/archelaos-site/commit/c7eabf7266d3038d1e578cc4847fe1ac7559bfab), [963643f](https://github.com/dizigs/archelaos-site/commit/963643f5055b71977f6908d83c82d644189cb7d9), [fd43fc9](https://github.com/dizigs/archelaos-site/commit/fd43fc9ac24806f60882530ee33ad7554850d64a) | FIXED_IN_PR / CI επί νεότερου head απαιτείται |
| CodeRabbit review threads | GitHub review threads: 16/16 resolved. Follow-up legacy interview alias implemented in `f81c59f`. | **VERIFIED_RESOLVED** |
| Ένταξη στο live | [PR #42](https://github.com/dizigs/archelaos-site/pull/42) merged: [`70d9de4`](https://github.com/dizigs/archelaos-site/commit/70d9de47f70df541711c30b06918559b89504673). Cloudflare production `aa4439ee-27a0-4b3c-b487-b29d4327fa56` success; live news.json, article and JPEG HTTP 200. | **MERGED / VERIFIED_LIVE** |

### Επαλήθευση αυτής της φάσης
- Στο head `fd43fc9`: **Validate website: success, ESLint: success, Internal news event ledger: success, Hall of Fame news crosscheck: success**. Άλλοι έλεγχοι ήταν ακόμα `pending` / `in_progress` κατά τον έλεγχο.
- Κάθε νέα αλλαγή επανεκκινεί checks· οριστικό αποτέλεσμα μόνο από το τελικό head και από production deploy logs.
- Χωριστά issues [#43](https://github.com/dizigs/archelaos-site/issues/43) και [#44](https://github.com/dizigs/archelaos-site/issues/44) παραμένουν ανοιχτά μέχρι ανεξάρτητη τεκμηρίωση επίλυσης.

## PR #42 — VERIFIED LIVE / Τελικό αρχείο αποκατάστασης · 2026-11-02

**Κλείσιμο:** [PR #42](https://github.com/dizigs/archelaos-site/pull/42) συγχωνεύτηκε στο `main`, squash commit [`70d9de47`](https://github.com/dizigs/archelaos-site/commit/70d9de47f70df541711c30b06918559b89504673). GitHub `merged: true` και `state: closed`.

**Έλεγχοι στο head `a341782c`:** `Validate website`, `JavaScript syntax guard`, `ESLint`, `Release integrity`, `Site release QA`, `Internal news event ledger`, `Hall of Fame news crosscheck`, `Lighthouse CI`, `Rebuild validation` = **success**. Μόνον `Validate ImgBot-only changes` = `skipped` (αναμενόμενο). Τα jobs του rebuild, συμπεριλαμβανομένου Chromium desktop/mobile, WCAG 2.2 A/AA, επιβεβαιώθηκαν **success**. Όλα τα 16 CodeRabbit review threads = resolved.

**Cloudflare production:** Deployment `aa4439ee-27a0-4b3c-b487-b29d4327fa56`, `environment=production`, `main`, SHA `70d9de47f70df541711c30b06918559b89504673`, `deploy.status=success`. Πραγματικό τέλος logs: `Success: Assets published!`, `Success: Your site was deployed!`.

**Δημόσια επαλήθευση:** `https://archelaos.club/news.json` HTTP 200 και 118 ειδήσεις, ανάμεσά τους `archery-central-european-cup-novi-marof-2025`. HTTP 200 στην `/news.html?article=archery-central-european-cup-novi-marof-2025` και στη φωτογραφία `/images/news/archery-central-european-cup-novi-marof-2025.jpg` (`image/jpeg`). Η επιβεβαίωση έγινε με φρέσκια δημόσια ανάκτηση (`maxAge=0`), όχι από το preview.

**Διόρθωση με καταγεγραμμένο regression:** Προσωρινό σφάλμα Python/JavaScript λόγω κυριολεκτικών `\\n` στο source (Cloudflare preview log: `SyntaxError: missing ) after argument list` σε `departments.js`). Αντιμετωπίστηκε με commits [`c7eabf7`](https://github.com/dizigs/archelaos-site/commit/c7eabf7266d3038d1e578cc4847fe1ac7559bfab) και [`963643f`](https://github.com/dizigs/archelaos-site/commit/963643f5055b71977f6908d83c82d644189cb7d9). Επιτυχές preview `8124269a-4575-4da4-b725-a61775c8113d`, επιτυχή τελικά CI και production. Το σφάλμα **δεν διαγράφηκε** από το ιστορικό.

**Χωριστά ανοιχτά θέματα:** [#43](https://github.com/dizigs/archelaos-site/issues/43) (Cloudflare intermittent asset publishing), [#44](https://github.com/dizigs/archelaos-site/issues/44) (GitHub Actions no-jobs) **δεν θεωρούνται επιλυμένα** από το επιτυχές PR #42. Το στιγμιότυπο χρήστη του SonarCloud εμφάνιζε `Quality Gate failed: C Security Rating on New Code (required A)` σε διαφορετικό main check· απαιτεί ξεχωριστή διερεύνηση πριν χαρακτηριστεί resolved.

**Μόνιμος κανόνας:** Κάθε σφάλμα/ανίχνευση/διόρθωση καταχωρίζεται εδώ ή σε αντίστοιχο tracked Issue/PR με commit, κατάσταση και πραγματική επαλήθευση. Η έλλειψη τελικού ελέγχου σημειώνεται ως pending, ποτέ ως completed.

## Ενοποιημένες συνδέσεις δημόσιου αρχείου — 2026-11-02

**Αίτημα:** Όλες οι τεκμηριωμένες δημόσιες πληροφορίες να διασυνδέονται με όλα τα συναφή πρόσωπα, ειδήσεις, χρονολόγια, τμήματα, ιστορίες, συνεντεύξεις και μουσειακά εκθέματα. Όχι αυθαίρετα συμπεράσματα ή διπλές εγγραφές. Υλικό Google Drive παραμένει ιδιωτικό μέχρι να γίνει κατάλληλη δημόσια ασφαλής αξιοποίηση.

| Ώρα/στάδιο | Τεκμηριωμένη εργασία και αιτία | Κατάσταση/επαλήθευση |
|---|---|---|
| STARTED | Έλεγχος public canonical sources `hall-of-fame-people.json` (760), `news.json` (118), `archelaos-history-events.json` (100), 70 Στιγμές, 21 Ιστορίες, 28 συνεντεύξεις και 26 εκθέματα. Έλεγχος ρητών personIds / story eventIds: **0 dangling IDs** στο ελεγχθέν σύνολο. | **CHECKED** |
| IMPLEMENTED | Δημιουργία `rebuild/tools/build_archive_relationships.py` με ένα δημόσιο γράφημα σταθερών IDs και αμφίδρομες ακμές `by_node`, χωρίς αναζήτηση ιδιωτικών δεδομένων, εικαστική ταυτοποίηση ή δεύτερο άρθρο ανά γεγονός. | **IN_PR / CI PENDING** |
| IMPLEMENTED | Ενσωμάτωση στο `rebuild/tools/build_release.py`, με `assets/site/data/archive-relationships.json` στο `dist` και τελικό έλεγχο αμφιδρομίας στο `verify_release.py`. | **IN_PR / CI PENDING** |
| IMPLEMENTED | `assets/archive-links.js` + `.css`: σύνδεσμοι σε cards/popups χωρίς διακοσμητικά βελάκια ή underline. Προστέθηκαν hooks στο κοινό popup, Hall of Fame και popup ειδήσεων. | **IN_PR / BROWSER QA PENDING** |
| IMPLEMENTED | Python tests για graph, αμφίδρομες συνδέσεις, τέσσερα πρόσωπα / ένα event Κροατίας, παλιά historical relationships, αποτυχία σε άκυρο ID, αποκλεισμό `unverified` from public linkage. Συνδέθηκαν με release CI και `news-event-ledger` CI. | **IN_PR / CI PENDING** |
| OPEN SEPARATE | SonarCloud `Quality Gate failed: C Security Rating on New Code`, περιγράφεται στο [Issue #47](https://github.com/dizigs/archelaos-site/issues/47). Χωρίς πρόσβαση στα line-level findings, δεν δηλώνεται επιλυμένο. | **OPEN** |

**Επόμενο:** Δημιουργία PR, πραγματικά tests και διόρθωση κάθε εντοπισμένου regression με νέο commit εδώ. Ούτε merge ούτε επιτυχές production υπονοούνται από την ύπαρξη commit.

## GitHub PR #43–#48: έλεγχοι ασφαλείας και διαδοχική ολοκλήρωση — 2026-11-02

- **Issue #43 · OPEN/MONITOR:** Παλαιότερες Cloudflare provider αποτυχίες στο στάδιο `deploy/assets` παρά επιτυχές build. Νεότερα previews `d1c38034`, `d553451a` και production #45 πέτυχαν, **όχι απόδειξη επιδιόρθωσης της παλιάς ασταθούς αιτίας**. Ένα ενδιάμεσο #48 failure `b51eec77` οφείλεται σε **σπασμένο static asset link** και δεν πρέπει να συγχέεται με την αρχική provider βλάβη. Το link αποκαταστάθηκε στα επόμενα commits και επιβεβαιώθηκε επιτυχές preview.
- **Issue #44 · OPEN ROOT CAUSE:** Τρεις αποτυχίες GitHub Actions χωρίς jobs στις μη κύριες branches. Έγινε προληπτική αποκατάσταση trigger μέσω [PR #45](https://github.com/dizigs/archelaos-site/pull/45): push εκτέλεση μόνο στο `main`. Παραμένει άγνωστο γιατί ο παλιός workflow scheduler απέτυχε.
- **PR #45 · MERGED:** Αρχική branch έκδοση ήταν ξεπερασμένη και θα αναιρούσε προηγούμενες επιδιορθώσεις φωτογραφιών· η `.github/workflows/archive-news-images.yml` αποκαταστάθηκε από τρέχον `main` με μόνη αλλαγή το `push.branches: main`. Commit `68e3e135`. Κατόπιν το merge μπλοκαρίστηκε (**GitHub HTTP 405: 2 of 2 required status checks expected**), επειδή η branch ήταν behind του protected main (strict policy). Το ακριβές ruleset GitHub `26357426` απαιτεί `JavaScript syntax (all site scripts)` και `ESLint JavaScript quality`. Δημιουργήθηκε fast-forward merge commit `a539478c` με δύο γονείς (feature + current main), διατηρώντας τα διορθωμένα περιεχόμενα. Όλα τα required checks, SonarCloud, Lighthouse, Cloudflare Preview και Release Integrity **success**. Squash merge στο `main`: [`ce7db057`](https://github.com/dizigs/archelaos-site/commit/ce7db057e5c8cd7837e4940f6db5b8be14ccce41). Cloudflare production `e868d5e0-3f56-4119-8f9a-06a4c4be0e62`: **success**, πραγματικά logs `Success: Assets published!` / `Success: Your site was deployed!`.
- **PR #48 · IN_PROGRESS:** Νέο δημόσιο reciprocal graph, UI συνδέσμων, ελεγκτές παραπομπών, tests και logs. Συνδέθηκε επιπλέον το ειδικό custom popup των Φωνών μέσω [`68e6c26`](https://github.com/dizigs/archelaos-site/commit/68e6c26ecd680082222e870a25d4fa5d9d365be1). Τα CI του νέου head απαιτούν επανέλεγχο και συγχρονισμό με `main` μετά το #45.
- **NotebookLM / Shared Drive · RESEARCH:** Παραλήφθηκε 8σέλιδο παράγωγο μητρώο μεταλλίων, επιτυχιών και σκορ (πηγές: έγγραφα στο ίδιο ιστορικό Drive). Δεν είναι ξεχωριστή πρωτογενής πηγή. Εντοπίστηκαν στα περιεχόμενα του Drive τα πρωτότυπα έγγραφα για Κύπελλο Χάντμπολ, Titov Veles, Τοξοβολία/ΕΦΟΤ, Σκοποβολή/ΣΚΟΕ και τα αριθμημένα αποκόμματα Τύπου. **Δεν έχουν ακόμη επαληθευτεί μία προς μία οι επιδόσεις με το πρωτότυπο**, ούτε δημοσιεύτηκαν αυτόματα ιστορικές εγγραφές από τη σύνθεση. Η σελίδα καλαθοσφαίρισης του παραγώγου απαιτεί ιδιαίτερη διάκριση ΓΑΣ vs. συγχωνευμένου ΣΦΚ.
- **Issue #47 · OPEN:** SonarCloud main Quality Gate screenshot (Security C) απαιτεί πρωτογενή issue-level ευρήματα. Το SonarCloud Quality Gate για PR #45 και #48 **success** δεν αρκεί για να χαρακτηριστεί κλειστό το παλαιότερο main θέμα.

**Κανόνας:** Κρατούμε ακόμη και τα προσωρινά σφάλματα με πραγματικό commit, URL, διόρθωση και τελικό έλεγχο. Ούτε status success preview ούτε βήμα build ισοδυναμούν με production επιτυχία χωρίς deployment logs.

## PR #48 — CodeRabbit review / τελικές επιδιορθώσεις (2026-11-02)

| Παρατήρηση / βλάβη | Διόρθωση | Κατάσταση |
|---|---|---|
| Χαμηλή αντίθεση στην ετικέτα τύπου αρχείου έναντι ανοιχτόχρωμου card/hover | `assets/archive-links.css`: σκούρο χρυσό `#6f5a2a`, commit `d8c5f07` | FIXED_IN_PR / QA pending |
| Ελληνικές ετικέτες ακόμη και όταν `document.lang=en` | `assets/archive-links.js`: κατάλληλες label/aria ετικέτες, commit `a039870`; δεν επανέρχεται toggle γλώσσας | FIXED_IN_PR / QA pending |
| Οι κάρτες αθλητικών τμημάτων χρησιμοποιούσαν favourite key `page:department-...` αντί του canonical `department:key` | Ξεχωριστό `relation` ID χωρίς αλλαγή στα Αγαπημένα, commits `24aa899` / `c0adc34` | FIXED_IN_PR / browser QA pending |
| Τα ίδια δύο στοιχεία με διαφορετικές σχέσεις παρήγαν διπλές αμφίδρομες ακμές | `build_archive_relationships.py`: μία ακμή ανά ταξινομημένο ζεύγος κόμβων + regression test, commits `5c6a482` / `65035ea` | FIXED_IN_PR / CI pending |

**Σημείωση:** Δεν είναι εντολή να καταργηθεί CodeRabbit security/quality check. Τα σχόλια επιλύονται μόνο μετά από θετική επαλήθευση των συγκεκριμένων αλλαγών στο τελικό head. Χωρίς ολοκληρωμένα required checks δεν γίνεται merge.

## Αρχειακή τεκμηρίωση — οριστική οδηγία και αυτοματισμοί · 2026-11-02

- **Οδηγία διαχειριστή:** Όσα αποτελέσματα, ονόματα, συμμετοχές, ημερομηνίες και γεγονότα είναι καθαρά αναγνώσιμα στα αρχειακά κείμενα θεωρούνται επαρκώς τεκμηριωμένα για εμπλουτισμό, χωρίς αίτημα ξεχωριστής έγκρισης ή υποχρεωτική αναζήτηση δεύτερης ανεξάρτητης πηγής. Η πηγή/σελίδα και ο χαρακτήρας του τεκμηρίου (πρωτότυπο έναντι NotebookLM σύνθεσης) διατηρούνται. Ειδικές αντιφάσεις, αβέβαιες ταυτότητες, προσωπικά δεδομένα και διαχωρισμός συγχωνευμένου μπάσκετ παραμένουν οριοθετημένες εκκρεμότητες και δεν μπλοκάρουν άλλα σαφή στοιχεία.
- **UPDATED AND READ-BACK:** Οι τρεις ενεργοί αυτοματισμοί `Νέα & ανάπτυξη Αρχέλαου`, `Έλεγχος site & αρχείου Drive`, `Συνεισφορές & ωριαίο self-heal` ενημερώθηκαν επιτυχώς με ρητό κανόνα `ΡΗΤΟΣ ΚΑΝΟΝΑΣ ΑΡΧΕΙΑΚΗΣ ΤΕΚΜΗΡΙΩΣΗΣ`. Αντίστοιχες τελευταίες επιτυχημένες ενημερώσεις: 2026-11-02 18:22:12, 18:22:16, 18:22:21 UTC.
- **NO CLAIM OF DATA IMPORT:** Η ενημέρωση του prompt δεν ισοδυναμεί με νέα καταχώριση στο δημόσιο μητρώο. Οι αλλαγές στο site απαιτούν ξεχωριστά commits, tests, merge και production logs. Οι ιδιωτικές πηγές Drive δεν δημοσιεύονται αυτούσιες χωρίς νόμιμη βάση.

## Πηγές από συνομιλίες / ασφαλής αρχειοθέτηση — 2026-11-02

- **STARTED → COMPLETED:** Δημιουργήθηκε μέσα στον ιδιωτικό κύριο φάκελο του ΓΑΣ στο Google Drive υποφάκελος «Πηγές από ChatGPT — Τεκμήρια & συνθέσεις». Ελέγχθηκε ότι ο στόχος είναι ο σωστός γονικός φάκελος και ότι η μεταφόρτωση επιστρέφει εκεί.
- **ARCHIVED & READ-BACK VERIFIED:** Το PDF που υπέβαλε ο χρήστης, οκτασέλιδη σύνθεση του NotebookLM με κατάλογο μεταλλίων/διακρίσεων/σκορ, αποθηκεύτηκε ως νέο τεκμήριο. Έγινε αναζήτηση στον φάκελο και επαλήθευση τύπου PDF, μεγέθους και γονικού φακέλου. **Το NotebookLM δεν λογίζεται δεύτερη ανεξάρτητη πηγή** απέναντι στις πρωτογενείς αρχειακές σελίδες.
- **DEDUPED:** Προϋπάρχον πρωτότυπο από τον ίδιο ιστορικό χώρο Google Drive δεν αντιγράφηκε ξανά. Στιγμιότυπα GitHub/Cloudflare checks δεν καταχωρίστηκαν ως αθλητικές/ιστορικές πηγές. Ιδιωτικά URLs/IDs και στοιχεία τρίτων δεν προστίθενται στο δημόσιο log.
- **AUTOMATION UPDATED:** Στα υπάρχοντα schedules «Έλεγχος site & αρχείου Drive» και «Συνεισφορές & ωριαίο self-heal» προστέθηκε ρητή παρακολούθηση του νέου υποφακέλου για καινούρια/τροποποιημένα αρχειακά τεκμήρια. Πρόκειται για επιτυχή αλλαγή scheduled instructions, όχι τεκμήριο ότι έχει ήδη εκτελεστεί η επόμενη βαθιά έρευνα ή δημοσίευση.
- **UI regression FIXED_IN_PR:** Στο κοινό popup ακυρώνεται προηγούμενη ασύγχρονη φόρτωση συνδέσεων όταν αλλάζει η τρέχουσα εγγραφή. Commit [`b5697d13`](https://github.com/dizigs/archelaos-site/commit/b5697d13fac868352911b9a2c0118bd28a3a7053). Τελικό CI απαιτείται πριν από merge.

## PR #48: αμφίδρομη δημόσια διασύνδεση — VERIFIED LIVE / 2026-11-02

- **MERGED:** [PR #48](https://github.com/dizigs/archelaos-site/pull/48), squash commit [`936178196d6926fcf61dc5473483e22ba3c8b852`](https://github.com/dizigs/archelaos-site/commit/936178196d6926fcf61dc5473483e22ba3c8b852) στο `main`. GitHub αναφέρει `merged=true`, `state=closed`.
- **FINAL CI:** `Release integrity`, `Lighthouse CI`, `Rebuild validation`, `JavaScript syntax guard`, `ESLint`, `Site release QA`, `Hall of Fame news crosscheck`, `Validate website`, `Internal news event ledger` = **success** στο head `3fce236fce92cc4a18c5888be264eae553b1c745`. `Validate ImgBot-only changes` = `skipped` (αναμενόμενο). Τα 3 jobs του Rebuild validation (HTML/data, Chromium desktop/mobile, release assembly) = success. SonarCloud PR Quality Gate = success· CodeRabbit review threads **4/4 resolved** μετά τις τεκμηριωμένες επιδιορθώσεις χρωματικής αντίθεσης WCAG, ετικετών γλώσσας, relation keys και μοναδικών ζευγών.
- **CLOUDFLARE PRODUCTION:** Deployment `56f3ba20-1eb2-4665-a257-97921e10719f`, `production`, SHA `93617819`, `deploy.status=success`. Πραγματικό τέλος logs: `Success: Assets published!`, `Success: Your site was deployed!`.
- **PUBLIC LIVE:** Fresh public HTTP 200 για `https://archelaos.club/assets/site/data/archive-relationships.json` (schema `explicit_public_references_only`, περιλαμβάνει event/people σχέσεις Κροατίας), `/assets/archive-links.js` και `/news.html`. Δεν δηλώνεται ειδικό click-by-click user test πέρα από τα επιτυχή Chromium CI.
- **SCOPE:** Ενσωματώθηκε μηχανισμός αμφίδρομων **συνδέσμων από ρητές ήδη υπάρχουσες αναφορές**. Αυτό **δεν** αποτελεί ακόμη πλήρως αυτοματοποιημένη εγγραφή νέων facts στο βασικό JSON βιογραφικών/ιστορικών γεγονότων ή σύστημα thumbs up/down.

### Αποθήκευση πηγών ChatGPT — οριστικός προορισμός και διόρθωση

- **PROBLEM DETECTED:** Αρχικά καταχωρίστηκε φάκελος ChatGPT και οκτασέλιδη παράγωγη σύνθεση NotebookLM κάτω από ομώνυμο **προσωπικό** φάκελο και όχι στο πραγματικό Κοινόχρηστο Drive.
- **CORRECTION VERIFIED:** Με `Google Drive list_drives` εντοπίστηκε το πραγματικό «ΓΑΣ Αρχέλαος | Ψηφιακό Μουσείο». Δημιουργήθηκε οριστικός υποφάκελος κάτω από «05 · Ευρετήριο και τεκμηρίωση» και αντιγράφηκε το PDF. Metadata/readback επιβεβαίωσε `drive_id`, ακριβή γονικό φάκελο, `application/pdf`, 248081 bytes και παρουσία στον κατάλογο. Οι **δικές μας προσωρινές αντιγραφές** PDF και προσωπικού φακέλου διαγράφηκαν μετά την επιβεβαίωση, χωρίς αλλαγή σε παλαιά πρωτότυπα.
- **SCHEDULES:** Τα δύο ήδη ενεργά scheduled jobs `Έλεγχος site & αρχείου Drive` και `Συνεισφορές & ωριαίο self-heal` ενημερώθηκαν με τον οριστικό Shared Drive υποφάκελο και επιβεβαιώθηκε με δεύτερη ανάγνωση ότι τα παλιά IDs δεν εμφανίζονται πλέον. Ενημέρωση prompt **δεν** ισοδυναμεί με πραγματική ολοκλήρωση εκτέλεσης/εισαγωγής νέων ειδήσεων.
- **SOURCE PROVENANCE:** Το NotebookLM PDF είναι **σύνθεση από αρχειακά έγγραφα**, όχι ανεξάρτητη πρωτογενής δημοσίευση. Η ημερομηνία 28/07/1994 που αναφέρει για την επίδοση μήκους 8,36 μ. του Κώστα Κουκοδήμου συγκρούεται με την τεκμηριωμένη 05/06/1994. Ελέγχθηκε δημοσίως με Σύλλογο Ελλήνων Ολυμπιονικών και άρθρο της εφημερίδας `ΤΑ ΝΕΑ` (1999). Παραμένει η 05/06/1994 στο υπάρχον βιογραφικό. Το υπόλοιπο σαφές υλικό παραμένει αξιοποιήσιμο με δική του προέλευση.
- **PRIVACY:** Ιδιωτικά links και Drive IDs, προσωπικά στοιχεία υποβολών και πρωτότυπα αρχεία δεν καταχωρίζονται στο δημόσιο GitHub log.

**Επόμενα ξεχωριστά θέματα:** Ολοκλήρωση του μηχανισμού εγγραφής νέων τεκμηριωμένων γεγονότων/βιογραφικών, τα ανοικτά περιστατικά GitHub/Cloudflare [#43](https://github.com/dizigs/archelaos-site/issues/43), [#44](https://github.com/dizigs/archelaos-site/issues/44), και το αποτυχημένο SonarCloud main Quality Gate [#47](https://github.com/dizigs/archelaos-site/issues/47). Καμία από αυτές τις εκκρεμότητες δεν δηλώνεται επιλυμένη από το PR #48.

## SonarCloud main Quality Gate — έξι συγκεκριμένα ζητήματα / 2026-11-02

**STARTED:** Το SonarCloud στο main είχε `Quality Gate failed — C Security Rating on New Code (required A)`. Δεν θεωρούμε το πράσινο PR Sonar check απόδειξη ότι επιλύθηκαν οι παλαιότερες επισημάνσεις στο main. Η ζωντανή λίστα `OPEN,CONFIRMED` / new code εμφάνισε 6 ευρήματα σε 3 GitHub Actions workflows. Καταχωρίστηκαν μαζί με Sonar finding IDs στο [Issue #47](https://github.com/dizigs/archelaos-site/issues/47).

| Ευρεθέν πρόβλημα | Διόρθωση στο branch | Απόδειξη / κατάσταση |
|---|---|---|
| `google-analytics-aggregate.yml:19`: floating `google-github-actions/auth@v2`, High | Πλήρες commit SHA από το επίσημο GitHub tag ref: `c200f3691d83b41bf9bbd8638997a462592937ed` | `9991224` / IN_PR |
| `google-analytics-aggregate.yml:27`: pip μπορεί να εκτελέσει source setup scripts | `python -m pip install --only-binary=:all:` με ήδη pinned packages | `9991224` / IN_PR |
| `eslint-guard.yml:22`: `npx` εγκαθιστά/εκτελεί on-demand scripts | `npm install --no-save --no-package-lock --ignore-scripts eslint@9.39.1` και τοπικό `./node_modules/.bin/eslint` | `d3a9ce6` / IN_PR |
| `live-site-guard.yml:23`: npm εγκατάσταση με lifecycle scripts | Προσθήκη `--ignore-scripts` και `--no-package-lock`, διατήρηση pinned `playwright@1.56.1` | `4ee5223` / IN_PR |
| `live-site-guard.yml:24`: δυνατότητα `npx` για on-demand εγκατάσταση | Άμεση εκτέλεση ήδη εγκατεστημένου `./node_modules/.bin/playwright` | `4ee5223` / IN_PR |
| `live-site-guard.yml:24`: μη δηλωμένη exact version στο `npx` | Ενιαία, ρητή τοπική `playwright@1.56.1` | `4ee5223` / IN_PR |
| Κίνδυνος παλινδρόμησης σε επόμενη αλλαγή workflow | Νέα offline tests: `rebuild/tests/security_workflows_test.py`, ενσωμάτωση στο `Release integrity` CI | `e761ee4` / `678addc` / CI PENDING |

**Έλεγχοι που απαιτούνται πριν το merge:** πραγματικά νέα tests, GitHub JavaScript syntax + ESLint, SonarCloud PR Quality Gate, Release integrity, Lighthouse και Cloudflare preview. Μετά το merge απαιτείται **νέο SonarCloud check στο `main`** και πραγματικό Cloudflare production log πριν δηλωθεί διορθωμένο ή δημοσιευμένο. Δε γίνονται suppressions, acceptances ή χαλάρωση του quality gate.

## Workflow safety follow-up #8 / #44 / actionlint — 2026-11-02

- **STARTED:** Reviewed open PR #8 vs current `main` and issue #44. PR #8 is stale: would delete the active scheduled photo-import trigger, downgrade previously pinned Pillow and remove its photo-recovery regression tests. **Do not merge PR #8 verbatim.**
- **FIX PREPARED:** Branch `ci/guard-archive-workflows-and-actionlint-20261102`, commit `93c84dc1`, adds only `jobs.archive.if: github.ref == 'refs/heads/main'` to current `.github/workflows/archive-news-images.yml`. Retains the `schedule`, `workflow_dispatch`, main-only `push`, exact Pillow version and all current tests. This makes even manual runs on non-main branches skip the write-enabled job.
- **PREVENTIVE CHECK PREPARED:** Commit `0c0881bb`, new `.github/workflows/actionlint-guard.yml`: a read-only, SHA-pinned checkout/setup-go job runs versioned `actionlint@v1.7.11` on workflow PRs and main pushes. **No extra periodic schedule** and no token write permissions.
- **KNOWN INCIDENT #44:** Original pre-job failures on feature branches cannot be retroactively assigned a root cause without workflow validation annotations. This change prevents one hazardous trigger, and actionlint catches workflow syntax problems going forward. It is **not yet evidence that issue #44 has been definitively reproduced/resolved**.
- **INCIDENT DETECTED BY NEW CHECK:** [PR #51](https://github.com/dizigs/archelaos-site/pull/51) initial `actionlint` run [41507906115](https://github.com/dizigs/archelaos-site/actions/runs/41507906115) **failed** on `.github/workflows/archive-news-images.yml:52`: ShellCheck `SC2016` twice (literal triple backticks in single-quoted `echo`) and `SC2129` (repeated redirects to `$GITHUB_STEP_SUMMARY`). This was a **workflow shell warning**, not a failure of actual photograph processing. These were the only logged actionlint warnings.
- **FIX APPLIED:** Commit `c0495626`: consolidated summary into a single redirect and Markdown-indented log lines via `sed 's/^/    /'`, eliminating fragile quote/backtick sequences while preserving summary content. Re-run actionlint and all required checks; **do not claim resolved until new successful logs**.
- **NEXT:** Run actual CI, inspect failed actionlint lines and repair any reported syntax faults, confirm branch protection, merge only passing PR, verify Cloudflare production logs, and close or mark PR #8 superseded with reason. Log all incidents and fix SHA.

## Σημείο συνέχισης

1. Διαβάζουμε αυτό το log **και** την τρέχουσα κατάσταση PR #42 / workflow runs.
2. Το PR #42 ολοκληρώθηκε και επιβεβαιώθηκε LIVE. Τα επόμενα θέματα είναι ανεξάρτητα: Issues #43/#44, και διερεύνηση SonarCloud quality gate. Οι εσωτερικές προτάσεις `classification_suggestions` εξακολουθούν να απαιτούν έλεγχο πηγής/ομιλητή.
3. Ελέγχουμε πραγματικά logs του ωριαίου/ημερήσιου self-heal και ολοκληρώνουμε event ID/hidden pages audit.
4. Καταγράφουμε κάθε πρόοδο/μπλοκάρισμα εδώ, με commit ή issue/run link. Merge μόνο με επαληθευμένα checks — όχι επειδή γράφτηκε «έτοιμο» στο log.

**Προσοχή:** Ένα GitHub αρχείο δεν γράφεται αυτόματα από μόνο του όταν κλείνει μια συνομιλία. Η ενημέρωση γίνεται με πραγματικές commits σε κάθε συνεδρία εργασιών ή με ξεχωριστό, επαληθευμένα εγκατεστημένο workflow. Δεν δηλώνουμε αυτοματοποιημένη επιμονή χωρίς τέτοιο workflow.


## Sourced biography update — 2026-11-02 (archery register)

- **STARTED / SOURCE:** Read the already archived 5-page club archery results register. Page 3 records an identifiable 13 October 2024 Nea Chrani result for Ελισάβετ Στεργιοπούλου: girls' recurve 15 m, 2nd place, 648 points (318+330), citing archival source “0001-0500.pdf”. The record is a private archived compilation; neither its original bytes nor private Drive identifiers are committed to GitHub.
- **CHECKED:** Existing person ID `arch-77461943b4f2` found; no second profile was created. Preserve separate 2026 delegation wording and do not incorrectly attribute the team's medal to that person.
- **IMPLEMENTED IN BRANCH:** Targeted Greek/English biography changes in `hall-of-fame-people.json`, `rebuild/data/people.json` and the corresponding `rebuild/source-profiles/arch-77461943b4f2.html` source page. Metadata and Person JSON-LD were updated to avoid the obsolete “exact event unknown” assertion.
- **CONSTRAINT:** Main root Hall registry has **760** people, while the rebuild working registry currently contains **682**. This branch preserves both counts; normalizing the two catalogs needs a separate guarded audit, not a wholesale replacement hidden in a biography edit.
- **STATUS: IN_PR / UNVERIFIED FOR PUBLICATION.** Require source-data and release tests, browser checks, GitHub required checks, Cloudflare preview and production logs after a protected merge. This item is a manual pilot, **not** proof that the real private Gmail/Shared Drive collector in [Issue #55](https://github.com/dizigs/archelaos-site/issues/55) is functional.

- **REGRESSION DETECTED → FIX IN BRANCH:** First PR #56 `Validate website` job failed: `ERROR: Outdated profile biography: arch-77461943b4f2` (run `41516623765`, job `125521727873`). Cause: the root static `people/arch-77461943b4f2.html` remained stale after root HOF JSON changed. Updated the fourth canonical source HTML with the exact new Greek and English biographies, Person JSON-LD and descriptions in commit [`b320b09`](https://github.com/dizigs/archelaos-site/commit/b320b092262b4eeb574fb5930d32985a39cb30f1). No validator relaxation. **CI re-run required; not yet merged.**
- **PARITY AUDIT:** Read-only comparison confirmed 78 root-only person IDs and 58 divergent shared biographies. Tracked separately in [Issue #57](https://github.com/dizigs/archelaos-site/issues/57); do not destructively merge the registries in PR #56.


## Published Environment / GitHub access audit — 2026-11-02 23:14 Europe/Athens

- **ENVIRONMENT REUSED:** Existing managed runtime and checkout for `dizigs/archelaos-site`; no replacement environment or configuration changes. Runtime reports current observations, running/connected, enforced restricted HTTP policy, no VPN configured. `api.github.com` and `github.com` are allowed. Main observed at `5881ce1acde80bf65bfc5067671dada09fd26371`.
- **AUTHENTICATION VERIFIED:** `gh api user` succeeds as `dizigs`; repository API succeeds and reports pull/push/admin/maintain/triage permissions. This repository metadata does not establish the integration token's permission on every administrative endpoint.
- **PERMISSIONS LIMITATION (exact response):** Both `GET /repos/dizigs/archelaos-site/branches/main/protection` and `GET /repos/dizigs/archelaos-site/actions/permissions` return HTTP 403, `Resource not accessible by integration`. These are endpoint-specific integration permissions restrictions, not missing authentication or a GitHub API network denial. Actions permission settings and classic branch protection cannot be verified through those endpoints.
- **REQUIRED RULES VERIFIED:** `GET /repos/dizigs/archelaos-site/rules/branches/main` succeeds. Ruleset 26357426 requires a pull request, resolution of review threads, strict up-to-date required checks `JavaScript syntax (all site scripts)` and `ESLint JavaScript quality` (integration 15368), and prevents deletion/non-fast-forward updates. No rule changes or bypass requested/performed.
- **NUMERIC PR ORDER:** Complete REST open-PR response contains only [Draft #37](https://github.com/dizigs/archelaos-site/pull/37), examined first at head `4b90811d0ea29c9e8f700e5f10711d8e0074c30a`. Both required checks succeed; mergeability is MERGEABLE/CLEAN. Review list and review threads are empty (`hasNextPage=false`). Preserve Draft: its body explicitly requires tests and source verification before merge; green CI alone does not establish source verification or production readiness.
- **PR #37 ACTIONS:** All 18 Actions check jobs succeed, including offline research/intake tests, actionlint, zizmor, release/website checks, axe, browser smoke and all three Rebuild jobs. ImgBot is skipped. SonarCloud, GitGuardian and Cloudflare Pages checks succeed; CodeRabbit is skipped. Rebuild [41524363944](https://github.com/dizigs/archelaos-site/actions/runs/41524363944) is now complete, superseding the earlier in-progress checkpoint. Required runs: [syntax 41524363862](https://github.com/dizigs/archelaos-site/actions/runs/41524363862), [ESLint 41524363929](https://github.com/dizigs/archelaos-site/actions/runs/41524363929). A preview status is not evidence of a production deployment.
- **ACTIONS INVENTORY:** API lists 29 workflows, all active. Latest 30 main-branch runs sampled are completed/success; this bounded sample is not a claim that all historical/scheduled executions succeeded. Current main required runs [41522462513](https://github.com/dizigs/archelaos-site/actions/runs/41522462513) and [41522462590](https://github.com/dizigs/archelaos-site/actions/runs/41522462590) succeed. Job/step metadata for [audit 41524363975](https://github.com/dizigs/archelaos-site/actions/runs/41524363975) confirms successful actionlint and zizmor steps.
- **NETWORK LIMITATION (exact errors):** `gh run view 41524363975 --log-failed` fails downloading the redirected log archive with `failed to get run log` / `Forbidden` at `results-receiver.actions.githubusercontent.com`. A separate HTTPS request to that host returns `HTTP/1.1 403 Forbidden`, `server: envoy`, and `curl: (56) CONNECT tunnel failed, response 403`. That hostname is absent from the enforced allowlist. This is a proxy/network restriction on log downloads, separate from administrative API permissions. Signed log URLs are deliberately omitted. No proxy bypass, credential replacement or network configuration change performed.
- **DELIVERY:** Documentation-only branch from current origin/main, separate from Draft #37 and existing local repair work. No direct push to main, merge, forced update, required-check bypass, or production deployment. Follow-up: allow log-download hostname through the normal environment configuration workflow if full logs are needed; separately grant the integration appropriate administrative read permissions if settings inspection is needed. Continue with #37 source verification before treating it as merge-ready.


## PR #58 — required-check evidence and 403 classification — 2026-11-02

Observed commit: `c0cf3fbb690ef5d09bb290c7bf01c1295be96345`. Results below belong to this exact head, not automatically to later documentation commits.

| Required check (ruleset 26357426) | Actual result | Evidence |
| --- | --- | --- |
| JavaScript syntax (all site scripts) | completed / success, 2026-11-02 21:14:51 UTC | [Run 41526552621](https://github.com/dizigs/archelaos-site/actions/runs/41526552621), check 125555653960; syntax validation step success |
| ESLint JavaScript quality | completed / success, 2026-11-02 21:14:53 UTC | [Run 41526552649](https://github.com/dizigs/archelaos-site/actions/runs/41526552649), check 125555653866; exact ESLint install and lint steps success |

- **Available evidence used:** REST check-run outputs, annotations and Actions jobs/steps were read successfully. Required-check summaries/text are null, so no detailed summary was invented. Both annotation endpoints return a Node.js 20 deprecation warning (`actions/checkout@v4`, `actions/setup-node@v4` forced onto Node.js 24) and an Ubuntu 26 migration notice for `ubuntu-latest`; neither is a failed syntax/lint assertion.
- **Other checks at observation:** Release integrity, Hall crosscheck, website validation and production-build QA succeed. Lighthouse remains in progress. ImgBot is skipped. SonarCloud summary says `Quality Gate passed`, 0 new issues and 0 security hotspots; GitGuardian says one commit scanned, no secrets. Cloudflare summary explicitly supplies a successful **preview**, not production evidence. CodeRabbit is **neutral**, with summary `Result: Rate limited - Review rate limited`; no completed review is claimed.
- **403 / GitHub permissions:** Exact endpoints are `GET https://api.github.com/repos/dizigs/archelaos-site/branches/main/protection` and `GET https://api.github.com/repos/dizigs/archelaos-site/actions/permissions`. Previously captured GitHub JSON is `{"message":"Resource not accessible by integration","status":"403"}` (with endpoint documentation URL). Successful authenticated user/repository/rules/check APIs distinguish these endpoint-specific authorization failures from missing authentication or blocked API networking. Repository admin metadata does not override the integration's endpoint permissions.
- **403 / network:** The failed redirected archive request was `GET https://results-receiver.actions.githubusercontent.com/rest/runs/2a73c74c-4453-8088-a929-07c76d040d08/logs?filename=logs_112526792381.zip&signature=[REDACTED]`. Exact stable path/filename recorded; signed credential query value intentionally omitted. `gh` reported `failed to get run log` / `Forbidden`. The independent `https://results-receiver.actions.githubusercontent.com/` probe returned proxy `HTTP/1.1 403 Forbidden`, `server: envoy`, `curl: (56) CONNECT tunnel failed, response 403`. This denies the CONNECT tunnel before GitHub archive authorization; it is a network-policy restriction, not evidence of inadequate Actions read permissions. Current runtime still reports enforced restricted policy without this hostname.
- **NO UNCHANGED RETRIES:** Neither denied administrative endpoint nor log download/probe was repeated. Used successful checks/annotations/summaries instead. No token replacement, network changes, workflow reruns or bypass.
- **PR ORDER / MERGE GUARD:** #37 reconfirmed OPEN and Draft; no merge or ready-for-review change. This update stays in existing #58. No merge of either PR, direct main push or required-check bypass. A new documentation commit must receive its own checks; the table above is retained as historical evidence for the audited SHA.


## PR #58 final required checks / next isolated technical repair — 2026-11-02

- **#58 head verified:** `de151f87f0278f39e8b8c19608f5b4d8481bcaf5` has required ESLint **pass** ([41526815585](https://github.com/dizigs/archelaos-site/actions/runs/41526815585), job 125556557005, 14 s) and JavaScript syntax **pass** ([41526815624](https://github.com/dizigs/archelaos-site/actions/runs/41526815624), job 125556557327, 7 s). `gh pr checks 58 --required --watch` completed successfully. This records the updated documentation head separately from the earlier c0cf3fb results in #58. No merge performed.
- **NEXT TECHNICAL PATCH:** Isolated from current origin/main `5881ce1`; carries forward only the existing local repair-lookup implementation and regression test from `f580a59`. No biography, historical registry, source profile, archive evidence, news content or research ledger changes. Draft #37 remains untouched.
- **REPRODUCED OFFLINE:** Both original workflow shell blocks (`archive-news-images.yml`, `site-watch-and-repair.yml`) attempt `git push` after a simulated failing `gh pr list`, because the lookup is inside an `if` pipeline. These are isolated command doubles, not real remote writes or new failing API requests. Photo workflow stops at a later failed lookup after its push; no claim that both original blocks complete PR creation.
- **FIX / VERIFIED:** Capture PR lookup output in a standalone assignment under existing shell error handling before deciding whether the result is empty. Failed lookup now stops before push/PR creation; existing PR exits without writes; successful empty lookup can propose a patch. Three regression tests execute both real shell blocks (six scenarios), all pass. Three existing workflow security tests pass; `git diff --check` passes. Regression suite is wired into release integrity and both affected maintenance workflows. Local actionlint executable is unavailable; remote workflow checks remain necessary. No production run or successful deployment claimed.


## Protected continuation — 2026-11-02

- **#58 MERGED:** Normal squash merge with expected head `de151f87f0278f39e8b8c19608f5b4d8481bcaf5`, after both required checks and all other running checks completed successfully (ImgBot skipped; CodeRabbit neutral/rate-limited). No review threads or reviews were present. GitHub confirms merged at 21:18:30 UTC, main commit `ca79bd09313f729d3d2849f36a479a7c05ee1067`. No admin bypass or direct push to main.
- **#59 CI ON ce0a13a:** Release integrity [41527003030](https://github.com/dizigs/archelaos-site/actions/runs/41527003030) completed successfully; job metadata explicitly confirms `Ensure repair automation stops when PR lookup fails` success. Both actionlint checks and zizmor succeeded. Rebuild/browser checks were still running at this observation; no final all-green claim.
- **#59 BASE UPDATE:** Merged current protected main into the feature branch to satisfy strict up-to-date rules after #58. Only append-only WORK_LOG conflict required resolution; retained both complete records. New feature-branch checks required before merge. Draft #37 and historical content remain untouched.


## Follow-up: confirmed Actions security annotations — 2026-11-02

- **EVIDENCE:** #59 head `bbaef834041ac7ebdac4c5907f6c1bca5f870f33`, audit [41527209642](https://github.com/dizigs/archelaos-site/actions/runs/41527209642), zizmor check 125557913257. Job conclusion is success, but annotations include ten `failure`-level `unpinned-uses` findings in `archive-news-images.yml`, `axe-accessibility.yml`, `clarity-daily-export.yml` and `cloudflare-pages-status.yml`. Existing scanner step has `continue-on-error: true`; job success is not a clean security scan. Warnings also report credential persistence, ad-hoc package installation and runner deprecations. These findings were read through the annotations API, without attempting denied archive downloads.
- **ISOLATED FIX:** Pin all twelve Action uses in those four annotated files to full 40-character commit SHAs, including two additional floating uses in the same files. Verified official `GET /repos/actions/{checkout,setup-python,setup-node,upload-artifact}/git/ref/tags/{v4,v5,v4,v4}` refs resolve to commits: checkout `11d5960a326750d5838078e36cf38b85af677262`, setup-python `a26af69be951a213d495a4c3e4e4022e16d87065`, setup-node `49933ea5288caeca8642d1e84afbd3f7d6820020`, upload-artifact `ea165f8d65b6e75b540449e92b4886f43607fa02`. Keep original major-version comments and action inputs. No policy/severity suppression or workflow permission changes.
- **LOCAL VALIDATION:** All twelve references are full SHAs; normalizing each SHA to its version comment reproduces the original workflow byte-for-byte. Three existing workflow-security tests and three repair-lookup tests pass; diff whitespace check passes. Local `/usr/bin/go` rejects installation with `Go: Unknown option: install`; no actionlint installation success is claimed or repeated. Remote actionlint and zizmor annotations must establish the final result.
- **SCOPE:** Only four workflow files and this log. No historic records, biographies, research evidence, production writes, or private data. Remaining baseline warnings outside this pinning fix are not claimed resolved.

- **MAIN SONAR LIMITATION:** After #58 merge, main `ca79bd09313f729d3d2849f36a479a7c05ee1067` Sonar check 125558363569 reports `Quality Gate failed`: `C Security Rating on New Code (required ≥ A)`, with zero annotations and no issue-level detail in its output. Issue #47 is currently closed, but this fresh check does not establish resolution. PR Sonar success is distinct from main baseline success. No root cause, issue-level repair, or restored main gate is claimed. `sonarcloud.io` is not in the current network allowlist; did not attempt an unapproved direct route or assert that action pinning fixes this separate condition.

- **CENTRAL HANDOFF:** Added `docs/AUTOMATION_PLAN.md`, linked from README: one ordered T01–T16 backlog, evidence/acceptance criteria, access blockers and division between technical work and parallel ChatGPT history research. Verified scheduled monitoring runs plus Google/Clarity export/job successes; no claim that full private intake/publication or every schedule works. Secret/variable metadata endpoints each returned integration HTTP 403 once; no repeated calls or secret reads.


## #59 protected merge / central automation handoff — 2026-11-02

- **#59 FINAL CI:** Head `bbaef834041ac7ebdac4c5907f6c1bca5f870f33`: required syntax [41527209706](https://github.com/dizigs/archelaos-site/actions/runs/41527209706) success; ESLint [41527209605](https://github.com/dizigs/archelaos-site/actions/runs/41527209605) success; Release integrity [41527209629](https://github.com/dizigs/archelaos-site/actions/runs/41527209629) success. Rebuild [41527209637](https://github.com/dizigs/archelaos-site/actions/runs/41527209637): all three jobs success, including Chromium 4m37s. Actionlint, axe, browser smoke, Lighthouse, website QA, Sonar PR and preview succeed. CodeRabbit neutral/rate-limited, ImgBot skipped; baseline zizmor findings retained as described above.
- **MERGED:** GitHub confirms #59 normal squash merge at 21:25:55 UTC to `165beb94797322ce80584ff3e41e85ccd8ced225`. Expected head checked; no review threads/reviews, clean/up-to-date branch. No admin bypass, direct main push, production success claim or #37 modification.
- **NEXT PR:** Action-pinning/handoff branch rebased onto this merged main before publishing, keeping only four workflow pin changes, README link, central plan and this log. Central plan T01 now DONE; remaining tasks have explicit acceptance criteria. Full automation is not declared complete.


## #60 pinning scope completed after real annotation feedback — 2026-11-02

- On initial #60 head `c969457`, zizmor check 125561832496 no longer reports the original four files as unpinned, but exposes more unpinned references in ESLint, Google aggregate, HOF and the audit workflow. This proves the first limited patch did not clear the repository baseline. Expanded the same PR to all 66 floating references across 24 workflows, retaining existing versions/inputs; no suppression or severity change.
- Additional official GitHub tag refs verified: setup-go v5 `40f1582b2485089dde7abd97c1529aa768e1baff`, cache v4 `0057852bfaa89a56745cba8c7296529d2fc39830`, lychee-action v2.9.0 `e7477775783ea5526144ba13e8db5eec57747ce8`. Existing full-SHA pins remain intact. Normalizing SHA/comment pairs exactly reproduces origin/main workflow contents; all workflow uses are now full-SHA references. Six existing tests and diff check pass again.
- This supersedes the earlier four-workflow-only scope description; no content/research data changes. Final remote actionlint and zizmor annotations still required. Changing the existing PR-permission-smoke workflow will naturally exercise its pre-existing disposable probe on a main push after protected merge; no new probe mechanism or schedule introduced.


## #60 actual scan result / handoff completion — 2026-11-02

- Head `30ff4430aed464b2fa60238287ce8aa93f44f8c3`: zizmor check 125562777452 annotations now contain **zero unpinned-uses findings**. They still include six credential-persistence warnings, four ad-hoc-package warnings, Node/Ubuntu notices and `Process completed with exit code 13`. Job success comes from the existing nonblocking baseline configuration; a fully clean scan is NOT claimed. Central plan T17 explicitly tracks the remaining work.
- Added single central task handoff with README entry; #60 includes the actual action-pinning fix and the backlog. Public link QA and news candidate validation on head 30ff443 succeed; final-head required checks and actionlint remain prerequisites before merge. No external credential settings or historical records were changed.


## T05 — actual automation health evidence, not just green workflow badges — 2026-11-02

- **BASE / ORDER:** Continued from protected main `9a49cea191e8e5345a5b77890b3eddc56bc31c60`. Only open PR remains Draft #37; untouched. #60 main post-merge checks succeed (including disposable probe, live monitors and photo workflow), except Sonar check 125565224945 still reports Quality Gate failure. T03 now DONE, T02 remains unresolved; no blocked admin/log calls repeated.
- **IMPLEMENTED:** Read-only observer `.github/scripts/automation_health.py`, cadence policy covering all 17 existing scheduled workflows, and SHA-pinned `automation-health.yml`. Every six hours it reads inventory/latest main/latest schedule metadata, emits Actions summary and technical JSON artifact. No secondary execution of existing jobs, write permission, PR/issue creation, content change, private ingestion or production deployment.
- **FAIL-CLOSED EVIDENCE:** Missing/stale/disabled/failed/skipped/cancelled/unknown are distinguished; recent manual success cannot hide absent schedules. API error is not retried and does not turn into success. Schedule-policy drift fails tests. Running is pending evidence; observer excludes itself and does not claim external dead-man coverage.
- **REAL LOCAL OBSERVATION:** At `2026-11-02T21:37:22Z`, API inspection of 28 workflows found 14 healthy observations, 13 with no scheduled-run evidence, 1 event-driven workflow not observed on main (ImgBot). Reporter exits 1 because evidence needs attention. This is not a claim that 13 automations are broken; many are new and may not have reached their first schedule. Known Google/Clarity manual successes are retained alongside missing schedule evidence. Raw report stays outside Git under `/tmp`.
- **IMPLEMENTATION INCIDENT:** Initial request to `GET https://api.github.com/repos/dizigs/archelaos-site/` returned HTTP 404 due to an unnecessary trailing slash. Corrected to the exact REST repository endpoint and added regression coverage before the successful actual observation. This is distinct from prior integration/network 403s. No unchanged failed request was retried.
- **VALIDATION:** 16 meaningful offline tests pass: missing/stale schedules despite successful manual runs, disabled/missing workflow, skipped/cancelled/running, future/malformed timestamps, unknown API data, policy drift, pagination, exact endpoint, single-attempt HTTP 403 and no credential leakage. `git diff --check` passes. Real scheduled/main execution of the new workflow remains pending protected merge; PR runs use offline fixtures only.


## #62 — Sonar path-traversal finding corrected before merge — 2026-11-02

- **ACTUAL FAILURE:** Sonar check 125569275354 on head `4a1788fb91dc60a710c2fdc29c0930c4ff2a4920` reports `C Security Rating on New Code (required ≥ A)` with two failure annotations: `.github/scripts/automation_health.py` lines 245/246, `Path Traversal via faulty LLM-supplied CLI arguments in automation_health.main()`. Finding IDs `AaGeNTHaMuwTm92g328J` and `AaGeNTHaMuwTm92g328K` were obtained from the accessible GitHub annotations API, not blocked Sonar/log requests.
- **FIX:** Removed arbitrary `--output`/`--summary` paths. Reports now have two fixed allowed names under the gitignored `rebuild/test-artifacts/automation-health/`. Anchored directory file descriptors with `O_NOFOLLOW` reject symlinked ancestors; exclusive temporary files and atomic replacement prevent report symlinks/hardlinks from overwriting other files. No suppression, accepted issue or gate change. Workflow artifact/summary paths and documentation updated accordingly.
- **VERIFIED LOCALLY:** 19 tests pass, including CLI path rejection, ancestor-symlink refusal and preservation of symlink/hardlink targets. Existing missing/stale/API evidence tests still pass; diff check passes. Sonar must re-evaluate the new head before merge. The unrelated six-workflow credential-persistence fix is prepared on a separate local branch; it is not mixed into #62 or historical research.


## #62 protected merge / follow-up report-job credential hygiene — 2026-11-02

- **#62 VERIFIED & MERGED:** Final head `136bf5655ac0d1c9ea4e093cf415d130bf244a95`: Sonar check 125570290791 = `Quality Gate passed`, 0 new issues, 0 security hotspots, 0 annotations. Observer test job run 41530748609 succeeds, including all 19 tests; required syntax 41530748940 and ESLint 41530748895 pass. All other checks completed without failure; no unresolved review threads/reviews. Normal squash merge at 21:44:03 UTC to `2c53ae3a5d7883cd3e1b9418522f8acb54282bac`; Draft #37 unchanged.
- **FIRST REAL MAIN OBSERVER:** [41531048044](https://github.com/dizigs/archelaos-site/actions/runs/41531048044), job 125571000351: tests success, actual metadata report step failure (exit 1), summary publication success, artifact retention success. Artifact `automation-health-evidence` ID 13180729797, 3123 bytes, not expired. Contents were not downloaded: existing log-archive network restriction remains, and public HTML did not expose summary content. Do not infer the exact remote findings from exit code alone. The earlier local observation of 13 missing schedules is separately recorded evidence.
- **OBSERVABILITY FOLLOW-UP:** Emit one GitHub Actions notice containing only aggregate state counts, total workflows and attention count. This makes actual remote results readable through the existing check-annotations API without archive downloads or retries; detailed summaries/JSON remain available in Actions.
- **T17 FIX:** Six `artipacked` warnings: public-mentions, news-event-ledger, live-health, links, Lighthouse and Cloudflare status checkouts now set `persist-credentials: false`. These jobs do not push Git commits; the ledger's separate `GH_TOKEN` for existing issue handling remains unchanged. Keep authenticated photo/repair/probe checkouts intact. Preserve all SHA pins, triggers, schedules, report paths and Lighthouse full history.
- **VALIDATION / LIMITS:** 19 observer tests and diff checks pass after rebasing onto merged #62 main. Remote actionlint/zizmor annotations must verify credential-warning removal; package-lock/runtime warnings remain separate pending T17 work. No historical data, private sources, secret settings, main pushes or quality-gate suppressions.


## #63 complete checkout-credential baseline / 2026-11-02

- First #63 scan 125572031942 confirms the six original `artipacked` warnings disappeared, but reveals five more in release QA, release integrity and the three Rebuild checkouts. Expanded the same fix to **all non-pushing checkouts**: 13 checkout defaults across 11 workflow files. Also covers validate-site and weekly public snapshot to prevent the next hidden baseline layer. Existing explicit false settings stay unchanged; authenticated photo/repair/probe writers stay intact.
- Rebuild's `git fetch origin main` reads this public repository; the full Rebuild CI must verify it still works without persisted checkout credentials. No trigger, token-scope or release behavior changes. Dependency/runtime warnings remain pending and no clean overall scan is claimed before actual new-head annotations.
- Added a brief definition of T = Task («εργασία») to the central plan, so the numbered handoff is understandable without this conversation.


## #63 CodeRabbit notice review — 2026-11-02

- Actual review thread `PRRT_kwDOVW_yv86y4Y1k` points out that an API-level evidence failure would emit `total=0; attention=1` without identifying missing evidence. Verified the code path; added only a fixed `evidence=unavailable` marker, never raw error text. Two additional tests verify exact aggregate counts and unavailable-marker output without disclosure. **21 tests pass locally**; new-head CI required.
- Head `1c77d98` completed required checks, Sonar and full Rebuild/Chromium successfully; check 125572878551 has zero `artipacked` and zero `unpinned-uses` findings. Remaining warnings are package installations without lockfiles and deprecated runtime notices. This is not a clean baseline scan (scanner step exit 12 under existing nonblocking policy).
- Read-only first-parent Git history establishes that all 13 locally missing schedules were introduced after their previous planned cron occurrence. Examples: daily photo cron introduced main commit e1bfca7 at 10:23:59 UTC on 2 November, after its 05:43 slot; weekly snapshot 0d186d5 at 11:35:16 UTC on Sunday 1 November, after its 03:43 slot. First scheduled evidence is genuinely not due yet. A separate T05 follow-up will distinguish startup waiting from overdue schedules with fixed, expiring deadlines; no repeated dispatches or artificial schedule-success claims.


## T05 startup deadline correction / explicit GitHub permission recheck — 2026-11-02

- **ROOT CAUSE OF EARLY MISSING FLAGS:** Verified `git log origin/main --first-parent -1 -S 'cron:'` for all 13 missing scheduled workflows. Each cron was introduced after its previous scheduled slot. First expected occurrences range from 3 November to 9 November 2026; the central plan lists every workflow, actual introducing main commit and first expected Athens time. Absence before that first slot is not an overdue automation.
- **FIX:** Per-workflow, fixed `first_run_deadline_utc` = first expected cron slot plus the already-used cadence tolerance (12 h daily/twice weekly, 24 h weekly). Until that absolute deadline, missing evidence is `awaiting_first_schedule`, assessment `incomplete`, never a fabricated pass. After it expires, missing scheduled evidence fails normally. Manual successes and reruns cannot extend deadlines. Existing scheduled failures/staleness, disabled workflows and API errors are never hidden by startup waiting. No cron modifications or manual dispatch loops.
- **TESTS:** 24 offline tests pass, including deadline expiry, no grace for real failures/staleness and timestamp/timezone validation; diff check passes. Real new-head CI and main observation remain pending.
- **USER-REQUESTED PERMISSIONS RECHECK:** Repeated once after the user explicitly asked to inspect current permissions, not an unchanged automatic retry. `GET /user` succeeds as dizigs; repository metadata reports admin/maintain/pull/push/triage true. Exact endpoints `GET https://api.github.com/repos/dizigs/archelaos-site/branches/main/protection`, `/actions/permissions`, `/actions/permissions/workflow`, `/actions/secrets`, `/actions/variables` all still return `HTTP 403`, `Resource not accessible by integration`. No secret/variable values read or printed. This remains endpoint authorization of the integration, not account login or GitHub API network denial. No credential replacement or configuration broadening.


## #63 final evidence and protected merge — 2026-11-02 22:01 UTC

- Final head `0e88eced89e22f1fc1c9ca736ada21036c2c2250`: required syntax [41532702573](https://github.com/dizigs/archelaos-site/actions/runs/41532702573) and ESLint [41532702893](https://github.com/dizigs/archelaos-site/actions/runs/41532702893) pass. Sonar check 125577025216 Quality Gate passed. Full Rebuild [41532702693](https://github.com/dizigs/archelaos-site/actions/runs/41532702693) succeeds, including Chromium 4m47s and public-main fetch without persisted credentials. All checks completed without failure; CodeRabbit neutral after verified finding resolution, ImgBot skipped. Review thread resolved after the fix and two regression tests; no unresolved threads.
- Normal squash merge confirmed at 22:01:16 UTC to `b8252b9cf686bb946fbd79636a569de25773cd29`. No direct main push or check bypass. Draft #37 and historical source/data files untouched.
- Startup-deadline follow-up rebased onto this actual merged main before publication. Offline replay of the confirmed `2026-11-02T21:37:22Z` API snapshot, with fixed startup deadlines, yields 14 healthy observations, 13 `awaiting_first_schedule`, 1 event-driven `not_observed`, assessment **incomplete**, attention 0. This replay is not a new live API observation or proof of scheduled success.


## Confirmed post-merge annotations, not inferred log contents — 2026-11-02

- **MAIN OBSERVER VERIFIED VIA API:** Main #63 run [41533575879](https://github.com/dizigs/archelaos-site/actions/runs/41533575879), check 125579664376, now emits the actual notice: `total=28; attention=13; healthy=7; missing=13; not_observed=1; running=7`. Metadata collection succeeded (not an unavailable/403 path); 13 absent schedules explain exit 1. Seven running jobs are explicitly pending rather than counted as success. Summary and artifact are available; no archive download was attempted.
- **MAIN SONAR STILL FAILS:** Main `b8252b9` check 125580418312 reports `Quality Gate failed`, `C Security Rating on New Code (required ≥ A)`. Credential hardening and green PR gates do not prove this separate baseline is repaired. T02 remains open, without invented root-cause attribution or suppressions.
- **STARTUP PR PRE-DOC HEAD:** #64 head `5ac76b21cea69e72df36de57cfdc5f087969194a` completed all checks without failure and is CLEAN. Documentation evidence is updated here before a final head recheck; no old-head pass is substituted for the new head.
