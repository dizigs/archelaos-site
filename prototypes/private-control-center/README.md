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
- Pause/resume animation στον υπολογιστή. **Στο κινητό δεν εμφανίζεται το κινούμενο topology**: αντικαθίσταται από τέσσερα κομψά info boxes (Brain, Workers, queue, ασφάλεια) και μικρή ροή δοκιμαστικών συμβάντων. Τα συμβάντα αλλάζουν τοπικά ανά 9 δευτερόλεπτα ή με πάτημα στο κουμπί επόμενου δείγματος. Καμία πραγματική live telemetry.
- Αυτόματη μείωση κίνησης μέσω \`prefers-reduced-motion\` και πλήρης παύση της SVG animation στο κινητό ή σε κρυφή καρτέλα.
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

## Scope & release

Όλα τα αρχεία περιορίζονται στο \`prototypes/private-control-center/**\`. **Δεν** τροποποιούνται \`brain/**\`, \`automation/**\`, \`.github/**\`, δημόσιες σελίδες ή άλλα ενεργά PR. Η υλοποίηση προορίζεται για **Draft PR χωρίς merge**. Ο Release Captain ελέγχει τις ενσωματώσεις παραγωγής.
