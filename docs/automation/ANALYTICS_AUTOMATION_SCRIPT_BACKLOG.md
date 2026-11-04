# ΑΡΧΕΛΑΟΣ — Μητρώο scripts για αυτοματοποιημένη ανάλυση SEO / Analytics

**Ημερομηνία απογραφής:** 04/11/2026  
**Repository:** `dizigs/archelaos-site`  
**Συντονισμός:** [Issue #108](https://github.com/dizigs/archelaos-site/issues/108), [Issue #71](https://github.com/dizigs/archelaos-site/issues/71)  
**Τεχνικός owner κεντρικού εγκεφάλου:** υπάρχον [PR #111](https://github.com/dizigs/archelaos-site/pull/111) (Codex).  
**Σκοπός:** να συλλέγουμε αναφορές χωρίς χειροκίνητα screenshots, να τις αξιολογούμε, να ανοίγουμε ασφαλείς εργασίες/PR και να μετράμε το αποτέλεσμα. **Το παρόν είναι λίστα υλοποίησης, όχι δήλωση ότι οι νέοι αυτοματισμοί λειτουργούν.**

## 1. Πραγματική σημερινή κατάσταση — μην ξαναγράψεις τα ίδια

| Υποδομή | Υπάρχον αρχείο / στοιχείο | Αποτίμηση |
| --- | --- | --- |
| Microsoft Clarity aggregates | `.github/scripts/clarity_export.py`, `.github/workflows/clarity-daily-export.yml` | Υπάρχει κώδικας με ημερήσιο GitHub Action (07:13 UTC), ιδιωτικό artifact και 14 ημέρες retention. **Όχι νέα συλλογή / δεύτερο cron**· κάθε νέο consumer πρώτα ελέγχει πραγματικά επιτυχή runs και διαθέσιμα δεδομένα. |
| Google Analytics 4 + Search Console | `.github/scripts/google_aggregate.py`, `.github/workflows/google-analytics-aggregate.yml` | Υπάρχει ημερήσιο Action (07:39 UTC) με Google OIDC και ιδιωτικό artifact. Μην υποθέτεις επιτυχία τελευταίου run χωρίς logs. |
| PageSpeed Insights | `functions/api/pagespeed-check.js` | Υπάρχει on-demand περιορισμένο API για επιλεγμένες σελίδες και cache 6 ωρών. Επαναχρησιμοποίησε αντί για νέο ανοιχτό crawler. |
| Lighthouse / sitespeed / axe | Υφιστάμενα GitHub Actions / CI | Τα σχετικά security workflows αποτελούν αντικείμενο άλλων PRs (π.χ. #146/#154). Καμία αλλαγή αρχείων από αυτή τη λίστα. |
| Google Apps Script / Worker | `automation/apps-script/`, υπάρχων `archelaos-automation-bridge`, SQLite Durable Object | Το βασικό guarded πακέτο PR #124 συγχωνεύτηκε. Κρυπτογραφημένο Google read/backup έχει καταγραφεί στα ιδιωτικά τεκμήρια. **Η δυνατότητα παραγωγικών εγγραφών, ο trusted executor και ο έλεγχος triggers/exclusive-writer δεν έχουν ολοκληρωθεί.** Μην ενεργοποιήσεις νέον trigger. |
| Bing Webmaster Tools | `BING_WEBMASTER_API_KEY` στον υπάρχοντα Cloudflare Worker ως `secret_text` | Cloudflare API readback επαλήθευσε **μόνο το όνομα και τον τύπο** (όχι την τιμή). Ασφαλής live authenticated Bing REST ανάγνωση **δεν έχει επαληθευτεί**. |
| Bing Site Scan | Υποβολή από τον διαχειριστή, screenshot σε κατάσταση `Queued` | Δεν αποδείχθηκε ολοκλήρωση ούτε προσβάσιμο επίσημο API για το **πλήρες** Site Scan report. Τα διαθέσιμα REST δεδομένα SEO δεν ταυτίζονται με το Site Scan CSV. |
| Bing mail | Ειδοποιήσεις προς `admin@archelaos.club` κατά τη ρύθμιση | Το συνδεδεμένο Gmail plugin αφορά προσωπικό Gmail· η πρόσβαση στα μηνύματα που απλώς απευθύνονται στο Admin **δεν αποδεικνύει** πρόσβαση σε ολόκληρο το Admin mailbox ή άδεια αυτόματης ανάγνωσής του από Apps Script. Χρειάζεται επιβεβαίωση mailbox/scopes. |

> **Κανόνας:** από το «βρέθηκε email» ή «υπάρχει API key» δεν συμπεραίνουμε ότι ολοκληρώθηκε αυτόματη συλλογή, εξουσιοδοτημένο Gmail trigger ή Bing authenticated read.

## 2. Ακριβή scripts / modules που ΧΡΕΙΑΖΟΜΑΣΤΕ

Τα παρακάτω είναι **προτεινόμενα λογικά modules**. Τα ονόματα αρχείων είναι στόχοι υλοποίησης, όχι τρέχοντα αρχεία. Πρώτα συγκρίνουμε με το code του PR #111 και με τα υπάρχοντα Apps Scripts· αν η λειτουργία ήδη υπάρχει, την επεκτείνουμε αντί να φτιάξουμε δεύτερο module.

| ID | Προτερ. | Προτεινόμενο module | Πλατφόρμα / λειτουργία | Κατάσταση |
| --- | --- | --- | --- | --- |
| **S01** | P0 | `BingMailIntake.gs` | **Google Apps Script:** ασφαλής αναγνώριση σχετικών mail από εξουσιοδοτημένο Admin inbox, Gmail message ID/thread ID, ημερομηνία και αληθινά attachments. Λειτουργεί μόνο μέσω **υπάρχοντος** ελεγμένου trigger/dispatcher ή event adapter· δεν δημιουργεί μόνο του νέο cron. | TODO / MAILBOX AUTH BLOCKED |
| **S02** | P0 | `BingAttachmentParser.gs` ή ιδιωτικό Worker parser | Εφόσον υπάρχει αληθινό CSV/XLSX/PDF attachment, ανάγνωση σε ιδιωτικό περιβάλλον, αυστηρός έλεγχος τύπου/μεγέθους/encoding/columns, quarantine άγνωστων αρχείων και έξοδος τυποποιημένων **ευρημάτων**. PDF χωρίς κατάλληλο parser → ελεγχόμενο fallback. Αν το email περιέχει μόνο link ή ειδοποίηση, **μην ισχυριστείς ότι έχουμε το report**. | TODO |
| **S03** | P0 | `BingWebmasterReadAdapter.mjs` | Υπάρχων Cloudflare Worker/brain: fixed-allowlist site `https://archelaos.club/`, **μόνο** τεκμηριωμένες Bing Webmaster REST/JSON read operations (search traffic, keywords, backlinks, crawl όπου παρέχονται). Χρησιμοποιεί server-side υπάρχον `BING_WEBMASTER_API_KEY`, ποτέ browser ή Apps Script source. | SECRET READY / LIVE READ TODO |
| **S04** | P0 | `AnalyticsReportReceipt.mjs` | SQLite Durable Object/υπάρχων brain ledger: source + immutable report ID/hash + observed date + parser schema version → ατομικό dedupe, status `received/parsed/reviewed/queued/blocked`, retries με όρια. Η Cloudflare Queue είναι pilot, όχι ήδη production adapter. | TODO / REUSE #111 |
| **S05** | P1 | `ClarityAggregateAdapter.mjs` | Εισαγωγή των **υπαρχόντων ιδιωτικών** Clarity Action aggregates σε ενιαίο schema. Μόνο στατιστικά ανά συσκευή, dead/rage clicks, scroll/engagement όπου όντως υπάρχουν· **όχι** προσωπικά recordings/session IDs. | TODO / REUSE EXPORT |
| **S06** | P1 | `GoogleSearchGA4Adapter.mjs` | Ανάγνωση του υπάρχοντος ιδιωτικού GSC/GA4 artifact ή εγκεκριμένης read-only Google πηγής. Canonical page/period, impressions/clicks/CTR/search position, sessions/conversions εφόσον όντως διατίθενται. | TODO / REUSE EXPORT |
| **S07** | P1 | `PageSpeedAndCiAdapter.mjs` | Εισαγωγή των ήδη διαθέσιμων PageSpeed, Lighthouse, axe, sitespeed findings και πραγματικών GitHub check conclusions. Αναφορά ακριβούς URL, commit SHA, μέτρησης mobile/desktop και ημερομηνίας. | TODO / EXISTING CHECKS |
| **S08** | P1 | `SeoFindingsCorrelator.mjs` | Ενιαίο **evidence-first** μοντέλο: `source, pageId, findingCode, severity, observedAt, sampleSize, evidenceLinks, confidence`. Συνδυάζει Bing + GSC + Clarity + PageSpeed χωρίς να αποδίδει αιτιότητα από μικρό δείγμα. Απορρίπτει ανεπιβεβαίωτα ευρήματα και αντιφατικές μετρήσεις. | TODO |
| **S09** | P1 | `SeoActionPlanner.mjs` | Μετατρέπει επαρκώς τεκμηριωμένα findings σε μοναδικές εργασίες GitHub (#71/#108), σταθερό fingerprint/owner/scope, priority, προβλεπόμενο όφελος, κινδύνους, απαιτούμενα tests και **AI budget**. Το ChatGPT αξιολογεί όταν υπάρχει πραγματική εξουσιοδοτημένη κλήση· όχι υπόσχεση πάντα ενεργού ChatGPT. | TODO / BUDGET GUARD |
| **S10** | P1 | `SeoDraftPrHandoff.mjs` | Εφόσον έχει αποδειχθεί ασφαλής executor: ανάθεση σε Codex → draft PR με συγκεκριμένα αρχεία → CI/Sonar/accessibility/dependency checks → protected merge μόνο όταν επιτρέπεται. **Ποτέ** εμπιστοσύνη σε εντολές μέσα σε email, CSV ή SEO report, ούτε direct push στο `main`. | BLOCKED / EXECUTOR NOT VERIFIED |
| **S11** | P2 | `SeoImpactRecheck.mjs` | Μετά από πραγματικό production deployment ID + SHA, συγκρίνει σταθερά χρονικά παράθυρα και επαρκή δείγματα (Bing/GSC/Clarity/PSI) με πριν, καταγράφει επίδραση, παρενέργειες ή `insufficient_data`. | TODO |

### Πρόσθετα λειτουργικά όρια

- **Admin mail:** πριν το S01, επιβεβαίωση ποιο inbox είναι πραγματικά εξουσιοδοτημένο και αν υπάρχει νόμιμη πρόσβαση από το **υπάρχον** Apps Script project. Όχι ανάληψη πρόσβασης με βάση alias/forwarding που απλώς εμφανίζεται στο προσωπικό Gmail. Δεν επεμβαίνουμε στην ενεργή `syncMuseumContributions`.
- **Site Scan fallback:** εξετάζουμε το email. Αν υπάρχει attachment, γίνεται private parsing. Αν υπάρχει μόνο σύνδεσμος, απαιτείται επίσημη διαθέσιμη εξαγωγή ή εξουσιοδοτημένη browser διαδικασία· **δεν** επινοούμε Site Scan API ή αυτόματο dashboard login.
- **Bing API:** η τιμή του κλειδιού παραμένει μόνο Cloudflare Secret. Καμία raw request URL με key σε logs/Issue/PR, κανένα dynamic target URL, κανένα endpoint proxy για τρίτους, καμία μη ζητημένη υποβολή URL.
- **Email / CSV ως μη έμπιστα δεδομένα:** αποφυγή prompt injection, HTML/scripts, spreadsheet formula injection, zip bombs, SSRF, απεριόριστου fetch, εισαγωγής προσωπικών δεδομένων σε public GitHub. Δεδομένα/επισυναπτόμενα παραμένουν ιδιωτικά· δημόσια issues μόνο με αποστειρωμένες περιλήψεις.
- **Χρέωση:** καμία νέα συνδρομή/paid API· κεντρικό όριο **20€ AI ανά ημερολογιακό μήνα** με guards, kill switch και alerts σύμφωνα με #108. Οποιαδήποτε πραγματική νέα χρεώσιμη ενέργεια απαιτεί έλεγχο και έγκριση.
- **Προγράμματα:** χωρίς νέο GitHub Actions schedule, Apps Script trigger, Cloudflare cron ή αυτοτελή Worker όταν μπορούν να εξυπηρετήσουν τα ήδη υπάρχοντα.
- **Μία εργασία/ένα μοναδικό πρόβλημα:** dedupe πριν από GitHub issue ή PR. Preview/result του ίδιου γεγονότος ενημερώνουν την ίδια εγγραφή.
- **Προστασίες:** GDPR/consent, ισχύοντα quality gates, readback, rollback, πράξεις με πραγματικά logs. Η παρουσία script/secret δεν ισοδυναμεί με παραγωγική λειτουργία.

## 3. Σειρά υλοποίησης και κριτήρια DONE

1. **P0 — Mailbox & Bing API discovery:** βεβαιώνουμε εξουσιοδοτημένη πηγή Admin email και την πραγματική μορφή ειδοποίησης/attachment· επιβεβαιώνουμε *μία* επιτυχημένη **read-only** Bing REST κλήση με sanitised αποτέλεσμα (όχι το secret). Αν λείπει οτιδήποτε, γράφουμε `BLOCKED` με λόγο.
2. **P0 — Synthetic intake:** ένα ελεγχόμενο email/report fixture → ένα μόνο receipt, σωστό parse ή ασφαλές `no_attachment` → κατάσταση στον υπάρχοντα SQLite brain ledger. Δοκιμές replay, concurrency, malformed CSV, phishing senders και prompt injection. **Όχι πραγματική αλλαγή site.**
3. **P1 — Correlation:** αποδεδειγμένα πρόσφατα ιδιωτικά Clarity/GSC/GA4 artifacts + Bing API + PageSpeed/CI → λίστα ευρημάτων με ακριβή πηγή, timestamp, confidence και χωρίς PII.
4. **P1 — GitHub handoff:** μία μοναδική τεκμηριωμένη πρόταση → scoped ασφαλές task/PR με πραγματικό executor και υποχρεωτικά checks. Ο υπάρχων owner του PR #111 χειρίζεται αυτό το στάδιο χωρίς δεύτερο ανταγωνιστικό PR κώδικα.
5. **P2 — Επανέλεγχος:** πραγματικό deployment με SHA και provider logs, και μετά `before/after` με κατάλληλο διάστημα παρατήρησης. Σε χαμηλή κίνηση αναφορά `insufficient_data`, όχι αυθαίρετη «βελτίωση».

## 4. Καταγραφή προόδου

| ID | Ξεκίνησε | Ολοκληρώθηκε | Εκκρεμεί/μπλοκάρεται | Επόμενη ενέργεια |
| --- | --- | --- | --- | --- |
| INV-20261104 | Απογραφή repo και Cloudflare/GitHub στοιχείων | Παρόν backlog, τεκμηριωμένα υπάρχοντα exports, διαπιστωμένο Bing secret name/type | API read, mail attachment verification, brain adapter, actual ChatGPT executor | Owner #111: διασταύρωση modules με κώδικα και διάσπαση σε ασφαλή μικρά στάδια |
| P0-MAIL | Εξέταση Bing email notification δυνατότητας | Υπάρχουν δηλωμένες ειδοποιήσεις Bing προς Admin | Δεν έχει τεκμηριωθεί πλήρες Site Scan attachment ή εξουσιοδοτημένο Admin inbox reader | Read-only mailbox check από κατάλληλη εξουσιοδοτημένη σύνδεση |
| P0-BING | Cloudflare secret installed & type verified | `BING_WEBMASTER_API_KEY` secret_text confirmed | Δεν έχει αποδειχθεί authenticated Bing API read | Στο υπάρχον Worker: μικρός ασφαλής read-only adapter, CI και sanitized provider readback |
| P0-PIPELINE | Έρευνα υπάρχοντος PR #111 | Offline durable core διαθέσιμο σε draft PR | Live cross-service connection όχι αποδεδειγμένη | Κλειδωμένο staged end-to-end fixture και πραγματικά provider logs |

**Τρόπος συντονισμού:** κάθε επιμέρους ολοκλήρωση ή blocker αναφέρεται στο Issue #71. Πριν από οποιαδήποτε τροποποίηση ελέγχονται ξανά head SHA, συγκρούσεις ανοιχτών PRs, τα πραγματικά CI checks και το ιδιωτικό ζωντανό Μητρώο Προσβάσεων. Αυτό το δημόσιο έγγραφο δεν περιέχει κλειδιά, προσωπικές πληροφορίες ή ιδιωτικές αναφορές.
