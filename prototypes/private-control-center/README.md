# ΑΡΧΕΛΑΟΣ — Private Control Center (STATIC DEMO)

**Κατάσταση:** ανεξάρτητο HTML/CSS/JS προσχέδιο. Όλα τα δεδομένα είναι επινοημένα. Ούτε API ούτε Worker ούτε GitHub/Cloudflare/Google production σύνδεση. Όχι deployment και όχι merge.

## Προβολή

Ανοίξτε το \`index.html\` σε σύγχρονο browser (Chromium / Firefox / Safari). Όλα τα αρχεία βρίσκονται αποκλειστικά εδώ:

- \`prototypes/private-control-center/index.html\`
- \`prototypes/private-control-center/styles.css\`
- \`prototypes/private-control-center/app.js\`
- \`prototypes/private-control-center/README.md\`

Το προσχέδιο λειτουργεί και με \`file://\` χωρίς web server ή εξωτερικές εξαρτήσεις. Δεν χρησιμοποιεί cookies, localStorage ή συλλογή προσωπικών δεδομένων. Δεν κάνει \`fetch()\`, δεν χρησιμοποιεί CDN ούτε δημιουργεί outbound requests.

## Δυνατότητες

- Responsive ελληνικό dashboard, dark-green / gold / beige theme.
- Overview: συνθετική υγεία site, Pages/Workers, Brain status, queue, locks, GitHub / CI, Self-Heal, AI budget 20 €/μήνα.
- Κινούμενο SVG topology, 8 Workers και ένας Brain, φωτεινά πακέτα που κινούνται πάνω στις γραμμές.
- Pause/resume animation όπου το topology χωράει (>1000px). Στα συμπαγή πλάτη (≤1000px) το διάγραμμα κρύβεται και αντικαθίσταται από πέντε κάρτες (Brain, Workers, queue, ασφάλεια, deployments) και demo event feed. Οι εγγραφές αλλάζουν τοπικά ανά 9 δευτερόλεπτα, με κουμπί παύσης/συνέχειας και ξεχωριστό κουμπί χειροκίνητου επόμενου δείγματος. Καμία πραγματική live telemetry.
- Δυναμική εφαρμογή \`prefers-reduced-motion\`: παύση/επαναξιολόγηση των SVG κινήσεων ακόμη και αν η ρύθμιση αλλάξει ενώ η σελίδα είναι ανοιχτή. Παύση SVG όταν το topology δεν προβάλλεται, σε ανενεργή καρτέλα ή σε compact view. Στο reduced motion απενεργοποιείται και η αυτόματη αλλαγή demo events.
- Κάθε Worker ανοίγει τοπικό inspector με συνθετικές λεπτομέρειες. Δεν μετατρέπεται σε operator action.
- Εναλλαγή τριών DEMO σεναρίων (ομαλή ροή / αυξημένος φόρτος / fail-closed).
- GitHub / εργασίες: λειτουργικά φίλτρα, αναζήτηση, λεπτομέρειες, χωρίς πραγματικά SHA.
- **Deployments:** ξεχωριστή ενότητα με demo ιστορικό Cloudflare Pages, Workers και GitHub Actions, κατάσταση, ώρα έναρξης, επιβεβαιωμένη (μόνο στο fixture) ώρα λήξης, χρόνο εκτέλεσης, εκτίμηση ETA για τρέχουσες αναπτύξεις, στατιστικά 7ημέρου, συχνότητα ανά ημέρα, φίλτρα πηγής/κατάστασης, αναζήτηση και inspector. Όλα τα timestamps/SHAs/metrics είναι φανταστικά, σε ώρα Ελλάδας. Στην αρχική υπάρχει snapshot card και στο κινητό compact info box.
- Το ETA υπολογίζεται από μέση διάρκεια επιτυχιών της αντίστοιχης πηγής και **δεν** σημαίνει ότι ολοκληρώθηκε ανάπτυξη. Επόμενο προγραμματισμένο release παραμένει «Άγνωστο» χωρίς επαληθευμένο schedule. Το UI χρησιμοποιεί σταθερό demo clock (06/11/2026 11:30 Ελλάδας) με τοπική προσομοίωση παρόδου χρόνου, όχι πραγματική ώρα παραγωγής.
- Χρονολόγιο με λειτουργικά φίλτρα και inspector.
- AI budget slider, ενδείξεις 80% / υπέρβασης 20 €, χωρίς billing API.
- Global search από το κουμπί αναζήτησης ή \`/\`, πλήκτρο Escape, keyboard-operable SVG nodes, focus states, κινητό navigation.
- Τοπική εξαγωγή αρχείου JSON με label **DEMO**.

**Σημαντικό:** Το “SIMULATED LIVE” είναι οπτική και χρονικά εναλλασσόμενη προσομοίωση από τοπικά fixtures. Στο κινητό, το info box είναι **DEMO, όχι live δεδομένα**, μέχρι να υλοποιηθεί ασφαλής read-only σύνδεση. Κανένας αριθμός, χρόνος, κατάσταση, πράσινη ένδειξη ή παλμός δεν επιβεβαιώνει πραγματική λειτουργία.

## Μελλοντική ασφαλής διασύνδεση (εκτός scope)

1. Ένα μόνο, αυθεντικοποιημένο **read-only API** από τον canonical Brain με least privilege και source-specific verification.
2. Immutable events / signed readback / idempotency / replay protection / explicit UNKNOWN states.
3. Επιβεβαιωμένα git commit SHA, CI run provenance, GitHub review threads, Cloudflare deployment SHA / logs, πραγματικό started_at/finished_at/status από τις πηγές και υπολογισμός ιστορικής συχνότητας ανά υπηρεσία. Διακρίνουμε GitHub CI run από πραγματικό production deployment.
4. Server-side auth (π.χ. Zero Trust), session management, GDPR, data retention, audit trails — ποτέ secrets στον browser.
5. Budget readback από authoritative cost ledger · όριο 20 €/μήνα.
6. Live ροή με SSE/WebSocket **μόνο μετά από** έλεγχο ασφάλειας, auth και αποτυχία κλειστού τύπου· ο browser δεν εκτελεί εντολές.
7. WCAG 2.2 AA, real-device tests, CSP, threat model και explicit release approval πριν από οποιαδήποτε παραγωγή.


## Browser acceptance / 06-11-2026

- Το mobile drawer navigation κρατά εκτός Tab order τους συνδέσμους όταν είναι κλειστό, απομονώνει το περιεχόμενο όταν ανοίγει, περιορίζει το Tab στο μενού και αποκαθιστά την εστίαση στο κουμπί κλεισίματος/στο κύριο περιεχόμενο μετά από επιλογή ενότητας.
- Τα modal inspector διατηρούν εστίαση και δεν αφήνουν το υπόβαθρο να λαμβάνει keyboard input.
- Η καθολική σήμανση **DEMO · OFFLINE** παραμένει ορατή σε desktop και mobile. Δεν αποτελούν παραγωγικά δεδομένα ούτε τα κόστη ούτε οι κατάστασεις.
- Το browser QA πρέπει να ελέγχει πραγματικά viewports, πληκτρολόγιο, pause feed, αλλαγές reduced-motion κατά τη λειτουργία και μηδενικά outbound network requests. Τα αυτοματοποιημένα site Lighthouse checks από άλλες σελίδες δεν υποκαθιστούν WCAG 2.2 AA audit του παρόντος prototype.
- Ο κώδικας παραμένει αποκλειστικά μέσα στο παρόν scope, σε draft PR, χωρίς deployment και χωρίς σύνδεση Brain/GitHub/Cloudflare.

## Scope & release

Όλα τα αρχεία περιορίζονται στο \`prototypes/private-control-center/**\`. **Δεν** τροποποιούνται \`brain/**\`, \`automation/**\`, \`.github/**\`, δημόσιες σελίδες ή άλλα ενεργά PR. Η υλοποίηση προορίζεται για **Draft PR χωρίς merge**. Ο Release Captain ελέγχει τις ενσωματώσεις παραγωγής.
