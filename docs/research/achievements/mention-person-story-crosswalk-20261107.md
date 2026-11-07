# Αρχέλαος — Exact mention / person / story crosswalk των 30 αποτελεσμάτων

**Έλεγχος 07/11/2026** · PR #294 · **μη δημοσιεύσιμο research-only**. Ο έλεγχος συνέκρινε τα 30 ερευνητικά `R02-...` claims με **όλες τις 494 εγγραφές** του `candidate-mentions.json` στο ακριβές HEAD του PR #257 (`a70dc05f8e3af5ed5e3a7343cb8c7e827935a4ba`). Κάθε `amh-...` που παρατίθεται βρέθηκε πραγματικά σε αυτό το JSON. Οι συνδέσεις βασίζονται στο γεγονός, στον αγώνα, στην ηλικιακή/αγωνιστική κατηγορία, στο πρόσωπο και στο συγκεκριμένο απόσπασμα· *η απλή παρουσία ονόματος δεν αρκεί*. Το `EXACT_EXCERPT_LINK` σημαίνει αντιστοίχιση παλαιότερης κειμενικής αναφοράς, **όχι νέα ανεξάρτητη επαλήθευση** ή πιστοποίηση από επίσημο score-sheet.

## Αποτελέσματα σύγκρισης

- **30** ξεχωριστά claims· **27** με τουλάχιστον ένα υπάρχον, ακριβώς σχετικό `mentionId` από το PR #257· **3** χωρίς ισοδύναμο απόσπασμα (`R02-ARCH24-05`, `R02-GYM26-11`, `R02-GYM26-12`).
- **26** διαφορετικά `amh` IDs συνδέθηκαν σε αυτά τα 30 claims (μία αναφορά επιτρέπεται να περιγράφει περισσότερα από ένα επιτεύγματα). Ανά προέλευση: `news` 10 · `person` 15 · `story` 1.
- **12** news-level αναφορές προϋπάρχουν στις τέσσερις ειδήσεις. 2 (amh-df7b5ca72e5ac219, amh-7664a93af5310ae3) ήταν περιληπτικές ή γενικού τίτλου και **δεν** συνδέθηκαν αυθαίρετα με ένα συγκεκριμένο μετάλλιο.
- 30 results ≠ 30 νέες ειδήσεις ≠ 26 νέοι τίτλοι ≠ αυτόματα 30 πιστοποιημένα achievements.
- Όλα τα συνδεδεμένα canonical `personIds` παραμένουν **αμετάβλητα**. Μη συμπλήρωση αμφίβολου `personId` με εικασία.

## Πλήρης ελεγχόμενη αντιστοίχιση

| claimKey | newsId (υπάρχον) | Αγώνισμα | Πρόσωπο/ομάδα | Θέση | Ακριβώς συναφή existing mentionIds | Source kinds | Status |
|---|---|---|---|---:|---|---|---|
| `R02-ARCH24-01` | `archery-cup-2024` | Ολυμπιακό U21 ανδρών — ατομικό | Ευάγγελος Χαρίσης | 1 | `amh-877a7acc01da4a5e` | news | EXACT_EXCERPT_LINK |
| `R02-ARCH24-02` | `archery-cup-2024` | Μικτό U21 | Παυλίνα Χαριτίδου, Ευάγγελος Χαρίσης | 1 | `amh-097fbd5f37391b57` | person | EXACT_EXCERPT_LINK |
| `R02-ARCH24-03` | `archery-cup-2024` | Ομαδικό γυναικών U21 | Παυλίνα Χαριτίδου, Θεοφανία Καραλή, Κασσιανή Κοκτσίδου | 1 | `amh-fe45b27383b5bc5b`, `amh-097fbd5f37391b57`, `amh-788d32b38b3df040`, `amh-3249ecc035f6b0cb` | news/person | EXACT_EXCERPT_LINK |
| `R02-ARCH24-04` | `archery-cup-2024` | Μικτό U18 | Αικατερίνη Γιαννακού, Κωνσταντίνος Χαρίσης | 2 | `amh-e50fe0499d31b106`, `amh-cc095cb875c82aa3` | person | EXACT_EXCERPT_LINK |
| `R02-ARCH24-05` | `archery-cup-2024` | Ομαδικό Barebow | Θεόδωρος Πασαχίδης, Δημήτριος Γαλάνης, Δημήτριος Αλεξούλης | 3 | — | — | SOURCE_ONLY_NO_EXACT_MENTION |
| `R02-ARCH24Y-01` | `archery-amyntaio-youth-national-dec-2024` | Παγκορασίδων Β΄ ολυμπιακό | Νεφέλη Ζαππίδου | 1 | `amh-536dde54d9f1ec48` | news | EXACT_EXCERPT_LINK |
| `R02-ARCH24Y-02` | `archery-amyntaio-youth-national-dec-2024` | Παμπαίδων Β΄ ολυμπιακό | Ζήσης Γαλάνης | 1 | `amh-536dde54d9f1ec48` | news | EXACT_EXCERPT_LINK |
| `R02-ARCH24Y-03` | `archery-amyntaio-youth-national-dec-2024` | Παίδων ολυμπιακό | Γεώργιος Ζαππίδης | 2 | `amh-7b3f7f83397a94d5` | news | EXACT_EXCERPT_LINK |
| `R02-ARCH24Y-04` | `archery-amyntaio-youth-national-dec-2024` | Παγκορασίδων Α΄ ολυμπιακό | Ελισάβετ Στεργιοπούλου | 3 | `amh-7b3f7f83397a94d5` | news | EXACT_EXCERPT_LINK |
| `R02-ARCH25-01` | `archery-national-oaka-team-title-2025` | Ατομικό ανδρών ολυμπιακό — τελικοί ολυμπιακοί γύροι | Ευάγγελος Χαρίσης | 1 | `amh-f9921f95329139b0`, `amh-ac16972bd5faa269`, `amh-021de60ff02cf1ae` | news/person | EXACT_EXCERPT_LINK |
| `R02-ARCH25-02` | `archery-national-oaka-team-title-2025` | Ομαδικό ανδρών ολυμπιακό | Ευάγγελος Χαρίσης, Χαράλαμπος Ιακωβίδης, Ευάγγελος Μαρινόπουλος | 1 | `amh-5579bb03f46ba7a7`, `amh-ac16972bd5faa269`, `amh-6db57c19ceeba5f9`, `amh-75e987b260c3e3c9`, `amh-c02a29eacb2132d8` | news/person | EXACT_EXCERPT_LINK |
| `R02-GYM26-01` | `gymnastics-u18-regional-team-gold-2026` | Σύνθετο ομαδικό — 112,59 | Θεοδώρα Αμεξιζίδου, Καλλιόπη Γεωργαντά, Αθανασία Κατσαντώνη, Νικολέτα Τσαρουχά | 1 | `amh-a26f7ba24bab0ac6`, `amh-9279304b0d60cfea`, `amh-97190d24313ef0b3`, `amh-5b2802ef8583664c`, `amh-24c6ad37a3c5f32f`, `amh-aa7b089ad814be0d` | news/person | EXACT_EXCERPT_LINK |
| `R02-GYM26-02` | `gymnastics-u18-regional-team-gold-2026` | Έδαφος | Θεοδώρα Αμεξιζίδου | 1 | `amh-55c4e71d23001c84`, `amh-aa7b089ad814be0d` | news/person | EXACT_EXCERPT_LINK |
| `R02-GYM26-03` | `gymnastics-u18-regional-team-gold-2026` | Σύνθετο ατομικό | Θεοδώρα Αμεξιζίδου | 3 | `amh-55c4e71d23001c84`, `amh-aa7b089ad814be0d` | news/person | EXACT_EXCERPT_LINK |
| `R02-GYM26-04` | `gymnastics-u18-regional-team-gold-2026` | Άλμα | Νικολέτα Τσαρουχά | 1 | `amh-55c4e71d23001c84`, `amh-24c6ad37a3c5f32f` | news/person | EXACT_EXCERPT_LINK |
| `R02-GYM26-05` | `gymnastics-u18-regional-team-gold-2026` | Δοκός | Καλλιόπη Γεωργαντά | 2 | `amh-55c4e71d23001c84`, `amh-5b2802ef8583664c` | news/person | EXACT_EXCERPT_LINK |
| `R02-GYM26-06` | `gymnastics-u18-regional-team-gold-2026` | Έδαφος | Καλλιόπη Γεωργαντά | 3 | `amh-55c4e71d23001c84`, `amh-5b2802ef8583664c` | news/person | EXACT_EXCERPT_LINK |
| `R02-GYM26-07` | `gymnastics-u18-regional-team-gold-2026` | Σύνθετο ατομικό | Μαρία Κεσενλή | 1 | `amh-2fb863ad04ce3af4`, `amh-5cb8bdec37c1f2ee` | person/story | EXACT_EXCERPT_LINK |
| `R02-GYM26-08` | `gymnastics-u18-regional-team-gold-2026` | Άλμα | Μαρία Κεσενλή | 1 | `amh-2fb863ad04ce3af4`, `amh-5cb8bdec37c1f2ee` | person/story | EXACT_EXCERPT_LINK |
| `R02-GYM26-09` | `gymnastics-u18-regional-team-gold-2026` | Έδαφος | Μαρία Κεσενλή | 1 | `amh-2fb863ad04ce3af4`, `amh-5cb8bdec37c1f2ee` | person/story | EXACT_EXCERPT_LINK |
| `R02-GYM26-10` | `gymnastics-u18-regional-team-gold-2026` | Δοκός | Μαρία Κεσενλή | 2 | `amh-2fb863ad04ce3af4`, `amh-5cb8bdec37c1f2ee` | person/story | EXACT_EXCERPT_LINK |
| `R02-GYM26-11` | `gymnastics-u18-regional-team-gold-2026` | Δίζυγο | Φανή Τσάλου | 3 | — | — | SOURCE_ONLY_NO_EXACT_MENTION |
| `R02-GYM26-12` | `gymnastics-u18-regional-team-gold-2026` | Δοκός | Φανή Τσάλου | 3 | — | — | SOURCE_ONLY_NO_EXACT_MENTION |
| `R02-GYM26-13` | `gymnastics-u18-regional-team-gold-2026` | Άλμα | Κωνσταντίνος Σαββουλίδης | 1 | `amh-58ff62c0aeeb9ab6` | person | EXACT_EXCERPT_LINK |
| `R02-GYM26-14` | `gymnastics-u18-regional-team-gold-2026` | Σύνθετο ατομικό | Κωνσταντίνος Σαββουλίδης | 2 | `amh-58ff62c0aeeb9ab6` | person | EXACT_EXCERPT_LINK |
| `R02-GYM26-15` | `gymnastics-u18-regional-team-gold-2026` | Έδαφος | Κωνσταντίνος Σαββουλίδης | 2 | `amh-58ff62c0aeeb9ab6` | person | EXACT_EXCERPT_LINK |
| `R02-GYM26-16` | `gymnastics-u18-regional-team-gold-2026` | Δίζυγο | Κωνσταντίνος Σαββουλίδης | 2 | `amh-58ff62c0aeeb9ab6` | person | EXACT_EXCERPT_LINK |
| `R02-GYM26-17` | `gymnastics-u18-regional-team-gold-2026` | Μονόζυγο | Κωνσταντίνος Σαββουλίδης | 2 | `amh-58ff62c0aeeb9ab6` | person | EXACT_EXCERPT_LINK |
| `R02-GYM26-18` | `gymnastics-u18-regional-team-gold-2026` | Ίππος με λαβές | Κωνσταντίνος Σαββουλίδης | 3 | `amh-58ff62c0aeeb9ab6` | person | EXACT_EXCERPT_LINK |
| `R02-GYM26-19` | `gymnastics-u18-regional-team-gold-2026` | Κρίκοι | Κωνσταντίνος Σαββουλίδης | 3 | `amh-58ff62c0aeeb9ab6` | person | EXACT_EXCERPT_LINK |

## «70 στιγμές», Stories και ιστορικά Events — διάκριση πηγής από επίτευγμα

- **Στιγμή #69** (`rebuild/data/moments.json`, numeric `id=69`, public history event `moment-69-2024`): γενική αναφορά στην εποχή 2024–26 («Πανελλήνιοι τίτλοι τοξοβολίας και παγκόσμιο ασημένιο Σουλή»). Οι γενικές `mentionIds` `amh-f16665a7f5b16f3e` (moment) και `amh-0723e8d4a23d471d` (museum/archery) είναι **CONTEXT_ONLY**: δεν τα προσθέτουμε αυτομάτως σε καθεμία από τις 11 ατομικές/ομαδικές τοξευτικές διακρίσεις.
- **Ιστορία (Stories)** `story-source-9bb406e798a1`, locator `stories[6]` από το ledger (0-based), τίτλος «Οι πρωταθλητές, η αποθήκη του σταθμού και οι 112,59 βαθμοί». **Δεν έχει canonical `storyId` στην πηγή**· κρατάμε το διαθέσιμο, σταθερό `sourceRecordKey` αντί να επινοήσουμε νέο. `amh-5cb8bdec37c1f2ee` είναι πηγή συγκεντρωτικής αναφοράς των **3 χρυσών + 1 ασημένιου της Μαρίας Κεσενλή**, δηλαδή τέσσερα διαφορετικά ατομικά placements. Το `amh-bc1267994044abf9` είναι **μόνο τίτλος ιστορίας**, και `amh-9ae060e4f3b94afe` αναφέρεται στη δεκαετία 1981–91 — αμφότερα CONTEXT_ONLY, όχι νέα μετάλλια.
- Το `archelaos-history-events.json` περιέχει προγενέστερα ιστορικά γεγονότα, π.χ. `archery-junior-team-silver-1994`. **Μη συγχέετε το 1994 με το Κύπελλο Τοξοβολίας 2024**, ούτε συνδέετε παλαιότερο γεγονός μόνο λόγω ομοιότητας αθλήματος.

## Source mismatch / identity exceptions

1. **`R02-ARCH24-05` Barebow ομαδικό:** δεν υπάρχει ισοδύναμο ακριβές απόσπασμα στα 494 candidate mentions. Το γεγονός παραμένει στο ανεξάρτητο source-checked report, αλλά οι `personIds` για Δημήτριο Γαλάνη και Δημήτριο Αλεξούλη μένουν σε HOLD μέχρι γεγονός-προς-γεγονός διασταύρωση.
2. **`R02-GYM26-11` και `R02-GYM26-12` (Φανή Τσάλου):** τα δύο χάλκινα του 2026 προκύπτουν από τη δημοσιευμένη ανακοίνωση (Δίζυγο/Δοκός). Η μοναδική εξαγμένη person-level `mentionId=amh-63630a6bb2f65271` αναφέρεται στο **2024**, άρα σκόπιμα **ΔΕΝ** συνδέθηκε με το 2026.
3. **`amh-fac8787d2ee5a0a8` / Ζήσης Γαλάνης:** παλιότερο απόσπασμα αναφέρει «ασημένιο 2024» χωρίς συγκεκριμένη διοργάνωση, ενώ παραπέμπει σε άρθρο **Μαρτίου 2026**. Η ονομαστική ανακοίνωση για το **Αμύνταιο 08/12/2024** αναφέρει *χρυσό* (Πανελλήνιο μικρών κατηγοριών, Παμπαίδες Β΄). Η καταγραφή είναι `CITATION_YEAR_MISMATCH`, **όχι** απόδειξη ότι δύο διαφορετικές διοργανώσεις ήταν η ίδια ή ότι ένα μετάλλιο ήταν λάθος. Χρειάζεται έλεγχος ξεχωριστού αρχικού γεγονότος πριν από διόρθωση βιογραφικού. Πηγή: https://pieriasocial.gr/?p=95403
4. **Προσοχή στην κοινή πηγή:** τα πολλά mention IDs από το ίδιο site/reposted press release **δεν είναι ανεξάρτητες επιβεβαιώσεις**. Για κάθε πράγματι νέα επιτυχία θα χρησιμοποιηθεί η κατάλληλη επιβεβαιώσιμη αρχική πηγή.
5. **Ακριβείς φάσεις:** τα GYM26 placements αφορούν **Α΄ φάση Β΄ Περιφέρειας**, όχι τελική φάση Πανελληνίου· η ανακοίνωση αναφέρει ότι το Πανελλήνιο θα ακολουθήσει στις 08–10/05/2026. Πηγή: https://pieria24.gr/entyposiaki-paroysia-toy-archelaoy-katerinis-stin-a%CE%84-fasi-enorganis-gymnastikis/

## Απόφαση εργασίας

- **Μόνο έρευνα και crosswalk** σε PR #294· **καμία** δημόσια ενημέρωση, νέο `achievementId` ή χρέωση AI.
- Τα τρία claims χωρίς ακριβές υποκείμενο mention χρειάζονται `SOURCE_ONLY` status, όχι τεχνητό νέο `mentionId` μέσα στο 494 snapshot.
- Πριν από επόμενο PR merge χρειάζεται ενημέρωση/συμφωνία του #257 με τα πραγματικά verified achievements, σταθερά IDs, dedup ανά πραγματική διάκριση και έλεγχος ακριβούς κλάδου CI.
