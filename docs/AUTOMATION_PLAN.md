# Κεντρικό πλάνο αυτοματισμού και παράδοσης

Μοναδικό σημείο προτεραιοτήτων για `dizigs/archelaos-site`. Ενημέρωση: 2 Νοεμβρίου 2026 (Europe/Athens).
Το `WORK_LOG.md` κρατά τα αποδεικτικά κάθε εκτέλεσης· εδώ κρατάμε τις εργασίες και τη σειρά τους.
**Ο πλήρης αυτοματισμός δεν έχει ακόμη επιβεβαιωθεί από άκρο σε άκρο.**

## Πώς συνεχίζουμε χωρίς διπλή δουλειά

1. Διαβάζουμε αυτό το αρχείο, το τέλος του `WORK_LOG.md` και τα πραγματικά ανοικτά PRs, σε αριθμητική σειρά.
2. Καταγράφουμε πάνω στην εργασία τον κλάδο/PR που την αναλαμβάνει. Ένα ενεργό PR ανά τεχνικό θέμα.
3. Τεχνική υλοποίηση: workflows, tests, build, deployment και monitoring. Παράλληλη έρευνα ChatGPT: ιστορικά τεκμήρια, γεγονότα, βιογραφικά. Δεν αλλάζουμε τα ίδια αρχεία δεδομένων παράλληλα.
4. Κάθε μεταβολή στο main γίνεται με κανονικό PR και τους ενεργούς required checks. Draft #37 δεν συγχωνεύεται όσο είναι Draft ή λείπουν προϋποθέσεις. Αποτυχημένη αναζήτηση PR σταματά τις εγγραφές.
5. Κλείνουμε εργασία μόνο με συγκεκριμένο commit/run/deployment και πραγματικό αποτέλεσμα. `unknown`, skipped, rate-limited και προσωρινά επιτυχές preview δεν σημαίνουν ολοκλήρωση.
6. Δεν επαναλαμβάνουμε αποτυχημένες κλήσεις χωρίς αλλαγή συνθηκών. Χρησιμοποιούμε προσβάσιμα check outputs, annotations και jobs/steps. Δεν αντιγράφουμε credentials, ιδιωτικές πηγές ή signed URLs στο δημόσιο repo.

## Επιβεβαιωμένη βάση

| Περιοχή | Τι γνωρίζουμε | Τεκμήριο / όριο |
| --- | --- | --- |
| Περιβάλλον | Υφιστάμενο δημοσιευμένο Environment, running/connected, enforced restricted policy | Δεν δημιουργήθηκε νέο Environment |
| GitHub | Authenticated API ως `dizigs`, ανάγνωση PR/rules/checks λειτουργεί | Τα admin permissions του repo δεν εγγυώνται κάθε permission του integration |
| Προστασία main | PR, επίλυση threads, strict syntax + ESLint checks | Ruleset 26357426· χωρίς direct push/bypass |
| Καταγραφή πρόσβασης | #58 merged, main `ca79bd09313f729d3d2849f36a479a7c05ee1067` | Required checks του head `de151f8` pass |
| Ασφαλή repair PRs | #59: αποτυχία API σταματά πριν από push· offline tests και Release integrity pass | Τελική κατάσταση στο WORK_LOG και GitHub· όχι εξαγωγή συμπεράσματος από παλιό head |
| Scheduled live health | Επιτυχής εκτέλεση | [41505597416](https://github.com/dizigs/archelaos-site/actions/runs/41505597416) |
| Scheduled browser guard | Επιτυχής εκτέλεση | [41507797560](https://github.com/dizigs/archelaos-site/actions/runs/41507797560) |
| Scheduled safe repair | Επιτυχής εκτέλεση | [41507929953](https://github.com/dizigs/archelaos-site/actions/runs/41507929953)· δεν αποδεικνύει ότι απαιτήθηκε/έγινε repair |
| Scheduled Cloudflare status | Επιτυχής εκτέλεση | [41508222050](https://github.com/dizigs/archelaos-site/actions/runs/41508222050) |
| Google Search Console / GA4 | OIDC auth, aggregate export και artifact steps success | [41422510038](https://github.com/dizigs/archelaos-site/actions/runs/41422510038)· δεν διαβάστηκαν τα ιδιωτικά reports |
| Clarity | Export και artifact steps success | [41422634776](https://github.com/dizigs/archelaos-site/actions/runs/41422634776)· δεν σημαίνει ότι εξετάστηκαν τα metrics |
| GitHub Actions δημιουργία PR | Υπάρχει επιτυχές disposable permission smoke run | [41444112248](https://github.com/dizigs/archelaos-site/actions/runs/41444112248)· δεν εκτελέστηκε νέο probe |
| Ιδιωτικό αρχείο | Υπάρχει offline intake/queue· σύνδεση πραγματικού collector εκκρεμεί | #55 και PRIVATE-INTAKE-PIPELINE.md· όχι δημόσιο Drive/Gmail ingestion |

Οι παραπάνω επιτυχίες αφορούν συγκεκριμένες εκτελέσεις. Δεν πιστοποιούν συνεχή υγεία ή ότι όλα τα εβδομαδιαία schedules έχουν ήδη τρέξει.

## Σειρά εργασιών

| ID / προτεραιότητα | Εργασία και τρέχουσα κατάσταση | Επόμενο βήμα | Πότε θεωρείται ολοκληρωμένη |
| --- | --- | --- | --- |
| T01 / P0 / DONE | #59: ασφαλής διακοπή repair μετά από API failure — merged | Διατήρηση regression guard | Head `bbaef83`: required checks, Release integrity, πλήρες Rebuild/Chromium pass· merge `165beb9` |
| T02 / P0 | Main Sonar gate αποτυγχάνει, παρότι PR gates περνούν | Λήψη συγκεκριμένων Sonar issue IDs/rules/files μέσω εξουσιοδοτημένης σύνδεσης· στοχευμένο PR | Main gate ≥ A μετά τη διόρθωση, χωρίς suppression/χαλάρωση |
| T03 / P0 | Zizmor έχει πραγματικά failure annotations πίσω από πράσινο baseline job | SHA-pin και τις 66 floating αναφορές σε 24 workflows· κλάδος `fix/pin-annotated-actions` | Remote actionlint pass και απουσία unpinned-uses annotations στον τελικό επανέλεγχο· υπόλοιπα warnings καταγράφονται ξεχωριστά |
| T04 / P0 | Περιορισμένη ορατότητα admin settings και αναλυτικών logs | Κανονική ρύθμιση δικτύου/permission από εξουσιοδοτημένο διαχειριστή, εφόσον απαιτηθεί | Προσβάσιμα endpoints που χρειάζονται, χωρίς έκθεση token· έως τότε metadata/annotations και σαφές unknown |
| T05 / P1 | Ενιαία παρακολούθηση αυτοματισμών / απουσία schedule run | Read-only αναφορά ανά workflow: latest run, latest scheduled run, failure, freshness, disabled/unknown· σταδιακή προσθήκη βάσει πραγματικών cron | Αναγνωρίζει και workflow που δεν εκτελέστηκε, όχι μόνο failed runs· δεν δημιουργεί δεύτερα ίδια schedules |
| T06 / P1 | Deployment και αποκατάσταση | Έλεγχος Cloudflare Git integration main → build_release.py → dist, production SHA, δημόσια URLs και διαθέσιμο προηγούμενο deployment | Δοκιμασμένη αλυσίδα PR → protected merge → πραγματικό production deployment → live QA· τεκμηριωμένο rollback |
| T07 / P1 | #43: παλαιότερο Cloudflare deploy/assets internal error | Παρακολούθηση deployment IDs/stage/logs και σύγκριση με επιτυχές deployment | Δεν δηλώνεται μόνιμη λύση χωρίς provider/root-cause evidence· έως μία ασφαλής preview επανάληψη ανά περιστατικό |
| T08 / P1 | #55: πραγματικός ιδιωτικός Drive/Gmail collector δεν έχει επιβεβαιωθεί | Ιδιωτικός persistent runner, εξουσιοδοτημένες πηγές, revision cursors, dedup, retries με όρια· παράδοση στη .archive-intake | Πραγματικό νέο τεκμήριο παράγει ιδιωτική receipt και δημόσια ασφαλές draft χωρίς διαρροές, επανάληψη idempotent |
| T09 / P1 | PDF extraction και ουρά τεκμηρίωσης | Ιδιωτικό ασφαλές extraction/OCR με όρια μεγέθους/χρόνου, πραγματική σελίδα/πηγή· συνεργασία με ιστορική έρευνα | Ακριβής provenance, quarantine σε σφάλμα/αμφιβολία, κανένα raw PDF/Drive ID σε public log |
| T10 / P1 | #37 Draft research pipeline | ChatGPT ολοκληρώνει προϋποθέσεις πηγών· τεχνικός επανέλεγχος τελικού head και εξαρτήσεων | Δεν είναι Draft, έχουν ολοκληρωθεί οι συγκεκριμένες προϋποθέσεις και όλα τα checks· όχι merge λόγω ηλικίας PR |
| T11 / P1 | #57: 760 root / 682 rebuild πρόσωπα, 78 απουσίες / 58 αποκλίσεις στο προηγούμενο audit | Read-only νέο parity report· κατανομή ανά ID με υπεύθυνο και πηγές από ιστορική έρευνα | Καμία απώλεια εκτενούς βιογραφίας· τεκμηριωμένη canonical πολιτική, tests και στοχευμένα PRs, όχι wholesale overwrite |
| T12 / P2 | Αυτόματη δημοσίευση σαφώς τεκμηριωμένων δημόσιων facts | Σύνδεση collector → επαληθευμένο public-safe πακέτο → αντιστοίχιση canonical ID → branch/PR → checks | End-to-end fixture και πραγματικό επιτρεπόμενο τεκμήριο· αμφιβολίες/προσωπικά δεδομένα μένουν στην ιδιωτική ουρά· κανένα direct main write |
| T13 / P2 | Υποβολές κοινού / Resend / D1 / Turnstile | Απογραφή πραγματικά ενεργού production endpoint και bindings· ολοκλήρωση frontend/moderation/retention | Δοκιμή πραγματικής υποβολής, anti-spam, εξουσιοδοτημένο moderation και διαγραφή· όχι ενεργοποίηση ημιτελούς prototype |
| T14 / P2 | Snapshots, link/media QA και αποκατάσταση | Επιβεβαίωση εβδομαδιαίων artifacts/retention και δοκιμή restore· έλεγχος cron εκτελέσεων | Ανακτήσιμο δημόσιο snapshot με hashes· ξεχωριστή ιδιωτική πολιτική backup για πηγές |
| T15 / P2 | Analytics/SEO αναφορές σε σταθερή λειτουργία | Έλεγχος επόμενων scheduled Google/Clarity exports, freshness, schemas και retention χωρίς δημοσίευση προσωπικών metrics | Πρόσφατες πραγματικές αναφορές, ασφαλής αποτυχία σε expired credentials και σαφές alert |
| T16 / P3 | Προαιρετικό AI/nonprofit εργαλεία | Μόνο εφόσον λυθούν πρόσβαση, bindings, διαθέσιμο quota και πραγματικό συνολικό όριο κόστους | Δοκιμασμένο fallback/kill switch· καμία ενεργοποίηση πληρωμών ως παρενέργεια της συντήρησης |

## Ακριβή εμπόδια πρόσβασης

- **GitHub authorization:** `GET https://api.github.com/repos/dizigs/archelaos-site/branches/main/protection`, `/actions/permissions`, `/actions/secrets`, `/actions/variables`: `HTTP 403`, `Resource not accessible by integration`. Τα δύο τελευταία ελέγχθηκαν μία φορά στη συνεδρία. Δεν γνωρίζουμε το inventory secret/variable bindings· **δεν** συμπεραίνουμε ότι λείπουν. Τα επιτυχή Google/Clarity runs είναι θετική ένδειξη για τις συγκεκριμένες συνδέσεις.
- **Proxy/network:** το redirect για logs στο `https://results-receiver.actions.githubusercontent.com/rest/runs/2a73c74c-4453-8088-a929-07c76d040d08/logs?filename=logs_112526792381.zip&signature=[REDACTED]` αποκλείστηκε. Ανεξάρτητο probe του host: `CONNECT tunnel failed, response 403`, `server: envoy`. Ο host απουσιάζει από το enforced allowlist. Δεν είναι απόδειξη ανεπαρκούς GitHub Actions token.
- **Main Sonar:** check `125558363569` στο `ca79bd0`: `Quality Gate failed`, `C Security Rating on New Code (required ≥ A)`. Μηδέν annotations· το API summary δεν δίνει issue-level αιτία. Το κλειστό #47 δεν αποδεικνύει ότι το σημερινό main είναι καθαρό. Το `sonarcloud.io` δεν περιλαμβάνεται στο τρέχον allowlist· δεν έγινε δοκιμή παράκαμψης.
- **Απαιτούμενες συνδέσεις προς έλεγχο, όχι διαπιστωμένες ελλείψεις:** `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_PAGES_PROJECT`, `CLARITY_API_TOKEN`, Google OIDC provider/service-account permissions. Το `LHCI_GITHUB_APP_TOKEN` αφορά reporting. Δεν ζητάμε αποστολή secret values στη συνομιλία ή στο repository.

## Παράδοση στην ιστορική έρευνα του ChatGPT

Το ChatGPT μπορεί να αναλάβει T09–T12 ως προς πηγές, σαφή facts και αντιστοιχίσεις προσώπων/γεγονότων. Σημειώνει εδώ το PR και τα IDs εγγραφών που επεξεργάζεται πριν αλλάξει αρχεία. Η τεχνική εργασία δεν αντικαθιστά τις βιογραφίες ή τα μητρώα για να διορθώσει build errors. Αντίστροφα, η έρευνα δεν αλλάζει workflows ή relaxes validators για να περάσει ένα PR.

Σαφή, αναγνώσιμα αρχειακά facts ακολουθούν την ήδη καταγεγραμμένη οδηγία τεκμηρίωσης στο WORK_LOG, με προέλευση/σελίδα και public-safe περιεχόμενο. Αντιφάσεις, αβέβαιες ταυτότητες και ευαίσθητα δεδομένα παραμένουν χωριστές εκκρεμότητες. Οι αριθμοί προσώπων στα παλιότερα README/docs είναι ιστορικές περιγραφές· πριν από μεταβολή ξαναμετράμε τα πραγματικά δεδομένα.

## Πρωτόκολλο ενημέρωσης

Για κάθε T-ID προσθέτουμε στο WORK_LOG: αρχικό head, ακριβές σφάλμα, αλλαγή/commit, πραγματικό test/run αποτέλεσμα και επόμενο βήμα. Εδώ ενημερώνουμε μόνο κατάσταση και σύνδεσμο PR. Δεν επαναδημιουργούμε task lists σε άλλα αρχεία. Κατάσταση `DONE` απαιτεί το κριτήριο της αντίστοιχης γραμμής.
