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
- Pause/resume animation. Αυτόματη μείωση κίνησης μέσω \`prefers-reduced-motion\`.
- Κάθε Worker ανοίγει τοπικό inspector με συνθετικές λεπτομέρειες. Δεν μετατρέπεται σε operator action.
- Εναλλαγή τριών DEMO σεναρίων (ομαλή ροή / αυξημένος φόρτος / fail-closed).
- GitHub / εργασίες: λειτουργικά φίλτρα, αναζήτηση, λεπτομέρειες, χωρίς πραγματικά SHA.
- Χρονολόγιο με λειτουργικά φίλτρα και inspector.
- AI budget slider, ενδείξεις 80% / υπέρβασης 20 €, χωρίς billing API.
- Global search από το κουμπί αναζήτησης ή \`/\`, πλήκτρο Escape, keyboard-operable SVG nodes, focus states, κινητό navigation.
- Τοπική εξαγωγή αρχείου JSON με label **DEMO**.

**Σημαντικό:** Το “SIMULATED LIVE” είναι οπτικό animation με στατικά δοκιμαστικά fixtures. Κανένας αριθμός, χρόνος, κατάσταση, πράσινη ένδειξη ή παλμός δεν επιβεβαιώνει πραγματική λειτουργία.

## Μελλοντική ασφαλής διασύνδεση (εκτός scope)

1. Ένα μόνο, αυθεντικοποιημένο **read-only API** από τον canonical Brain με least privilege και source-specific verification.
2. Immutable events / signed readback / idempotency / replay protection / explicit UNKNOWN states.
3. Επιβεβαιωμένα git commit SHA, CI run provenance, GitHub review threads, Cloudflare deployment SHA / logs.
4. Server-side auth (π.χ. Zero Trust), session management, GDPR, data retention, audit trails — ποτέ secrets στον browser.
5. Budget readback από authoritative cost ledger · όριο 20 €/μήνα.
6. Live ροή με SSE/WebSocket **μόνο μετά από** έλεγχο ασφάλειας, auth και αποτυχία κλειστού τύπου· ο browser δεν εκτελεί εντολές.
7. WCAG 2.2 AA, real-device tests, CSP, threat model και explicit release approval πριν από οποιαδήποτε παραγωγή.

## Scope & release

Όλα τα αρχεία περιορίζονται στο \`prototypes/private-control-center/**\`. **Δεν** τροποποιούνται \`brain/**\`, \`automation/**\`, \`.github/**\`, δημόσιες σελίδες ή άλλα ενεργά PR. Η υλοποίηση προορίζεται για **Draft PR χωρίς merge**. Ο Release Captain ελέγχει τις ενσωματώσεις παραγωγής.
