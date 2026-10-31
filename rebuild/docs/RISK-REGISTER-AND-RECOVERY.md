# Προληπτικός έλεγχος και σχέδιο αντιμετώπισης κινδύνων

Η λίστα είναι εργαλείο εργασίας, όχι πιστοποίηση ότι όλα έχουν ήδη διορθωθεί. Πριν από κάθε διάθεση στο κοινό απαιτούνται ολοκληρωμένοι έλεγχοι, ανθρώπινη ανασκόπηση και ρητή έγκριση του ιδιοκτήτη. Καμία διαδικασία δεν κάνει αυτόματο merge στο main.

## Κατάλογος κινδύνων (P0 κρίσιμο, P1 σημαντικό, P2 βελτίωση)

| Κίνδυνος | Επίπεδο | Πρόληψη / εντοπισμός | Αντιμετώπιση |
| --- | --- | --- | --- |
| Λευκή σελίδα από JavaScript | P0 | Browser smoke, pageerror, δοκιμή όλων των routes | Επιστροφή στην τελευταία καλή έκδοση |
| Χαλασμένα click / overlay που καταπίνει πατήματα | P0 | Playwright αλληλεπιδράσεις, έλεγχος focus και z-index | Αναίρεση της αλλαγής σε μενού / dialog |
| Κλειδωμένο scroll μετά το κλείσιμο popup | P0 | Δοκιμή class / body scroll lock και Escape | Διόρθωση ενοποιημένου dialog controller |
| Κομμένα popup και κρυμμένο Χ | P1 | 320–1600px screenshots και geometry checks | Προσαρμογή θέσης / μεγέθους / overflow |
| Λανθασμένη εμφάνιση σε Chrome / Edge | P1 | Πραγματικά browser checks, όχι μόνο emulation | Browser-specific αναπαραγωγή και patch |
| Ασυμβατότητα σε μικρά κινητά και zoom | P1 | 320px, 390px, 200%/400% zoom, reduced motion | CSS patch χωρίς καταστροφή desktop |
| Αργό φόρτωμα ή χαμηλό INP | P1 | Core Web Vitals (field data) και JS profiling | Μείωση εργασίας στην κύρια διεργασία |
| Μετατοπίσεις περιεχομένου (CLS) | P1 | Μετρήσεις, δηλωμένες διαστάσεις εικόνων | Σταθερά layout placeholders |
| Βαρύ LCP / αργές εικόνες | P1 | Έλεγχος μεγάλων εικόνων, responsive srcset | Συμπίεση με νόμιμα διαθέσιμα πρωτότυπα |
| Cache με παλιό CSS / JS μετά από deploy | P0 | Έλεγχος _headers και revalidation σε unversioned assets | Αλλαγή Cache-Control / δοκιμή σκληρής ανανέωσης |
| Ελλιπές / αποτυχημένο Cloudflare deploy | P0 | Κλείδωμα main, CI, έλεγχος preview πριν από release | Rollback Cloudflare στην τελευταία καλή έκδοση |
| Προβληματικό DNS / SSL / HTTPS | P0 | Παρακολούθηση DNS, πιστοποιητικού και HTTPS | Διόρθωση Cloudflare DNS / TLS, όχι τυφλές αλλαγές |
| Ακύρωση domain / λήξη domain | P0 | Έλεγχος ανανέωσης domain από ιδιοκτήτη | Ανανέωση / επικοινωνία με registrar |
| Διαρροή ιδιωτικών εγγράφων | P0 | Μη συμπερίληψη Drive, .env, .git και backups στο dist | Άμεση αφαίρεση, revocation όπου χρειάζεται |
| Έκθεση μυστικών GitHub / API | P0 | GitHub secrets μόνο server-side, ποτέ frontend | Ανάκληση / περιστροφή κλειδιών |
| Clickjacking | P1 | X-Frame-Options DENY, μελλοντικά CSP frame-ancestors | Έλεγχος Cloudflare headers |
| XSS από εισαγόμενο κείμενο | P0 | Απόδοση με textContent/escape και προέγκριση ingestion | Αφαίρεση επικίνδυνου περιεχομένου |
| Εξωτερικό script ή supply-chain attack | P0 | Inventory τρίτων, pin dependencies/actions, SRI όπου εφαρμόζεται | Απομάκρυνση εξάρτησης και rollback |
| Κακή CSP που σπάει το site | P0 | Audit inline scripts, δοκιμή Report-Only πριν από enforce | Επιστροφή πολιτικής μέχρι να λυθούν παραβιάσεις |
| Σπασμένοι εσωτερικοί σύνδεσμοι / 404 | P1 | Preflight όλων των HTML και URL browser audit | Redirect ή διόρθωση συγκεκριμένου URL |
| Ανενεργά δυναμικά anchors | P1 | Browser deep-link checks σε καταχωρίσεις | Σταθερά IDs και client route handlers |
| Σύνδεσμοι προς άγνωστους τρίτους | P1 | Audit external links, target=_blank / noopener | Διόρθωση links και περιοδικός έλεγχος |
| Χαμένες / αδειοδοτικά αβέβαιες φωτογραφίες | P1 | Image inventory, αρχειακή προέλευση | Placeholder και νόμιμη αντικατάσταση |
| Εξωτερική φωτογραφία που παύει να λειτουργεί | P1 | Inventory hotlinks και fallback στο UI | Μεταφορά μόνο εγκεκριμένων εικόνων σε τοπική φιλοξενία |
| Αλλοίωση βιογραφικού / λανθασμένη απόδοση | P0 | Κλειδωμένα IDs, διορθώσεις με τεκμήριο, diff main/rebuild | Ανάκτηση παλιού κειμένου, διόρθωση όλων των αντιγράφων |
| Απώλεια μέρους των 682 βιογραφικών | P0 | Count+ID check, ατομικές ιστορικές σελίδες στο release | Rollback ή επαναφορά από ιστορική βάση |
| Απώλεια 70 στιγμών / ιστοριών | P0 | Count και μοναδικά IDs, backward-compatible schema | Restore από Git backup / reviewed archive |
| Κάποια μεταφρασμένη βιογραφία είναι συντομότερη | P1 | Ειδική αναφορά short English, ανθρώπινος έλεγχος | Απόκρυψη μη ολοκληρωμένων γλωσσών |
| Αναρρίχηση μη επαληθευμένου Drive υλικού | P0 | Dry-run intake, review, αποθήκευση μόνο εγκεκριμένων δημόσιων πεδίων | Αφαίρεση και trace της εισαγωγής |
| Διπλά sitemap, canonicals, robots noindex | P0 | verify_release για όλες τις δημοσιεύσιμες ενότητες | Διόρθωση metadata και νέο sitemap |
| Λάθη στο Google indexing / Search Console | P1 | Παρακολούθηση indexing, crawl errors, redirects | Επανυποβολή sitemap αφού επιλυθεί η αιτία |
| Μη προσβάσιμο πληκτρολόγιο / focus | P1 | axe-core, Tab/Escape, focus return, WCAG 2.2 | Διόρθωση controls και διαλόγων |
| Κείμενα / χρώματα χωρίς αντίθεση | P1 | WCAG contrast checks, χειροκίνητος έλεγχος | Διόρθωση palette χωρίς αλλαγή branding |
| Αστοχία φόρμας/επικοινωνίας | P1 | Mailto/form smoke, μην υπόσχεσαι ανέβασμα που δεν υπάρχει | Εναλλακτικό mailto, σαφή μηνύματα |
| Ανεπιθύμητη συλλογή δεδομένων επισκεπτών | P0 | Data minimization, privacy audit, κανένα κρυφό tracker | Απενεργοποίηση και επανέλεγχος |
| Απώλεια αγαπημένων σε άλλο browser | P2 | Σαφής ενημέρωση ότι είναι μόνο τοπικά | Επιλογή export μόνο μετά από έλεγχο |
| Επίθεση traffic ή abuse | P1 | Cloudflare zone protections και alerts | Περιορισμοί κατά περίσταση, αποφυγή αποκλεισμού νόμιμων |
| GitHub Actions αποτυχία / false green | P0 | Separate integrity, browser και release gates | Μπλοκάρισμα δημοσίευσης, επανεκτέλεση |
| Ατυχήματα Git και ανεπιθύμητο merge | P0 | Ξεχωριστό rebuild branch, read-only checks, explicit deploy approval | Revert main και Cloudflare rollback |
| Ανεπαρκές backup / μη ανακτήσιμο site | P0 | Git history, tagged release, προηγούμενο Cloudflare deployment | Τεκμηριωμένο restore rehearsal |
| Νέα αλλαγή που σπάει παλιό URL | P1 | Regression scan 682 profiles + redirects | Αναδρομική συμβατότητα / redirect |
| Συλλογικά προβλήματα σε δεκάδες σελίδες | P1 | Common components + regression tests | Μία στοχευμένη διόρθωση στο κοινό component |

## Τι έχει αυτοματοποιηθεί

- Κάθε push στο rebuild/clean-foundation τρέχει checks δομής, ιστορικού, μεταφράσεων, browser interactions, responsive, WCAG και release build.
- Το νέο εργαλείο rebuild/tools/preflight.py σαρώνει **όλα τα HTML του dist**, όχι μόνο τις 13 κύριες σελίδες: τοπικά assets/links, ανύπαρκτα αρχεία, διπλά IDs, legacy links, ύποπτα external scripts, μη ασφαλείς αναφορές, redirect cycles, security headers και cache.
- Η πλήρης αναφορά καταγράφει errors και warnings. Τα κρίσιμα σφάλματα μπλοκάρουν το release CI. Προβλήματα σε παλιά βιογραφικά που χρειάζονται ιστορική επιμέλεια σημειώνονται ως warnings, όχι αυτόματες αντικαταστάσεις.
- Καμία από αυτές τις δοκιμές δεν είναι δημοσίευση στο Cloudflare.

## Playbook περιστατικού

1. Καταγραφή του ακριβούς URL, συσκευής, browser, χρόνου και συμπτώματος. Αποθήκευση screenshot και console/network errors όπου επιτρέπεται.
2. Διάκριση: πρόβλημα μόνο ενός browser/cache, καθολικό production, συγκεκριμένης καταχώρισης ή εξωτερικού παρόχου.
3. Για σοβαρή παραγωγική βλάβη: σταματάμε νέα δημοσίευση και εξετάζουμε επαναφορά στην τελευταία **επιβεβαιωμένα καλή** έκδοση Cloudflare, χωρίς να διαγράψουμε τη Git ιστορία.
4. Επισκευή αποκλειστικά στο rebuild branch, με συγκεκριμένο regression test για το σφάλμα. Έπειτα πλήρη CI, χειροκίνητη επαλήθευση και νέο preview.
5. Ενημέρωση του ημερολογίου κινδύνων με αιτία, τι ελέγχει πλέον το CI και πώς αποφεύγεται επανάληψη.

## Τι χρειάζεται ακόμη ανθρώπινο ή εξωτερικό έλεγχο

- DNS/SSL/domain, Cloudflare λογαριασμός, διαθέσιμα deployments και πραγματική επαναφορά.
- Μετρήσεις Core Web Vitals από πραγματικούς επισκέπτες και επιβεβαίωση σε φυσικές συσκευές Chrome/Edge/iOS/Safari.
- Πραγματική διαθεσιμότητα εξωτερικών εικόνων/links και άδειες χρήσης.
- Χειροκίνητη αξιολόγηση με screen reader και 200–400% zoom.
- Ενδεχόμενη CSP: πρώτα inventory inline scripts και Report-Only, **όχι επιβολή στα τυφλά**.
- Ασφαλές pinning των GitHub Actions/dependencies και έλεγχος δικαιωμάτων λογαριασμού από τον ιδιοκτήτη.

Πηγές αναφοράς: OWASP HTTP Headers Cheat Sheet, W3C WCAG 2.2, Google Core Web Vitals, Cloudflare Pages Headers και MDN HTTP caching.
