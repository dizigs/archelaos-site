# Γ.Α.Σ. Αρχέλαος — τεκμηριωμένα πρόσωπα, ID crosswalk και έλεγχος πηγών (07/11/2026)

**Scope:** Αποκλειστικά υπάρχοντα canonical records του `main`, με προτεινόμενες αλλαγές μέσω Draft PR. Δεν δημιουργείται δεύτερη είδηση για ήδη καταχωρισμένο γεγονός, νέο person ID ή ανέλεγκτο photo ID. Το `hall-of-fame-people.json` είναι η πηγή βιογραφιών και το `archelaos-person-index.json` η πηγή aliases. Τα `news.json` και `archelaos-history-events.json` διατηρούν τα δικά τους IDs.

## Κριτήριο δύο πηγών

Αποδεκτό τεκμηριωμένο στοιχείο = δύο διακριτές αξιόπιστες πηγές, με ξεκάθαρη ταυτότητα, ίδιο συγκεκριμένο γεγονός/επίδοση και σύνδεση με τον Αρχέλαο. Προτιμάται η επίσημη ομοσπονδία + ανεξάρτητο δημοσίευμα. Αποφεύγεται η ψευδής ανεξαρτησία όταν δύο ιστοσελίδες αναδημοσιεύουν την ίδια ανακοίνωση. Το AI δεν είναι δεύτερη πηγή. Πιθανή σύγκρουση ημερομηνίας/μέτρησης καταγράφεται και δεν δημοσιεύεται ως βεβαιότητα.

## Άννα Χατζηπουργάνη — `arch-68fef0f68151`

- **Διασταύρωση:** ΣΕΓΑΣ + Sport-FM, τριπλή εξέλιξη ρεκόρ Κ18 (59,48 → 59,17 → 59,01) το 2020.
- **Υπάρχοντα news IDs:** `track-zachariadeia-two-medals-may-2024`, `track-hatzipourgani-u18-record-patra-aug-2020`, `track-hatzipourgani-u18-record-ioannina-aug-2020`, `track-u18-larisa-two-golds-jul-2020`, `track-hatzipourgani-interclub-400h-jul-2020`.
- **Αρχειακό profile:** `people/arch-68fef0f68151.html` (δημιουργείται/επαληθεύεται από release build· όχι υπόσχεση production deployment).
- **Πηγές:**
  - ΣΕΓΑΣ · Πανελλήνιο ρεκόρ Κ18, 01/06/2019: https://www.segas.gr/6818-spoudaia-epidosi-kai-neo-panellinio-rekor-k18-apo-tin-anna-xatzipourgani/
  - ΣΕΓΑΣ · Ρεκόρ 59,17 στα Ιωάννινα, 02/08/2020: https://www.segas.gr/8022-protathlima-k20-2i-imera-pogevma/
  - ΣΕΓΑΣ · Ρεκόρ 59,01 στην Πάτρα, 09/08/2020: https://www.segas.gr/8046-panellinio-protathlima-a-g-peftei-i-avlaia-stin-patra/
  - Sport-FM · Ανεξάρτητη κάλυψη 59,17, 02/08/2020: https://www.sport-fm.gr/article/panellinio-rekor-i-xatzipourgani/4119060
  - Ο Ντελάλης · Ζαχαριάδεια 2024, 20/05/2024: https://odelalis.gr/gas-archelaos-1-chryso-kai-1-argyro-metallio-sta-zachariadeia-2024/
- **Media references των συνδεδεμένων ειδήσεων:** 7 μοναδικές αναφορές. Τα `mediaRefId` είναι τεχνικοί δείκτες URL/path και ΔΕΝ είναι `photoId` ούτε έλεγχος δικαιωμάτων.

## Κατερίνα Ρέχα — `arch-8479d12a4a14`

- **Διασταύρωση:**  ΣΕΓΑΣ + KateriniSport / Ο Διάλογος, ασημένιο 60 μ. εμπ. και χάλκινο 100 μ. εμπ. το 2025.
- **Υπάρχοντα news IDs:** `reha-bronze-outdoor-hurdles-volos-2025`, `track-recha-indoor-national-silver-2025`.
- **Αρχειακό profile:** `people/arch-8479d12a4a14.html` (δημιουργείται/επαληθεύεται από release build· όχι υπόσχεση production deployment).
- **Πηγές:**
  - ΣΕΓΑΣ · Πανελλήνιο Κλειστού 2025, 23/02/2025: https://www.segas.gr/panellinio-kleistoy-25-evdomos-panelli/
  - Ο Διάλογος · Ασημένιο στα 60 μ. εμπόδια, 12/03/2025: https://odialogos.gr/%CF%80%CE%B9%CE%B5%CF%81%CE%AF%CE%B1/%CE%B1%CE%B8%CE%BB%CE%B7%CF%84%CE%B9%CE%BA%CE%B1/2%CE%B7-%CF%80%CE%B1%CE%BD%CE%B5%CE%BB%CE%BB%CE%B7%CE%BD%CE%B9%CE%BF%CE%BD%CE%AF%CE%BA%CE%B7%CF%82-%CE%B7-%CE%BA%CE%B1%CF%84%CE%B5%CF%81%CE%AF%CE%BD%CE%B1-%CF%81%CE%AD%CF%87%CE%B1/
  - ΣΕΓΑΣ · Πανελλήνιο Ανοιχτού στον Βόλο, 02/08/2025: https://www.segas.gr/stoiximan-panellinio-protathlima-2025-o-doyvalidi/
  - KateriniSport · Χάλκινο στα 100 μ. εμπόδια, 05/08/2025: https://katerinisport.gr/%CE%B1%CF%81%CF%87%CE%AD%CE%BB%CE%B1%CE%BF%CF%82-%CE%BA%CE%B1%CF%84%CE%B5%CF%81%CE%AF%CE%BD%CE%B7%CF%82-%CF%83%CF%85%CE%B3%CF%87%CE%B1%CF%81%CE%B7%CF%84%CE%AE%CF%81%CE%B9%CE%B1-%CF%83%CE%B5-%CF%81/
- **Media references των συνδεδεμένων ειδήσεων:** 2 μοναδικές αναφορές. Τα `mediaRefId` είναι τεχνικοί δείκτες URL/path και ΔΕΝ είναι `photoId` ούτε έλεγχος δικαιωμάτων.

## Αλεξάνδρα Παπαγιάννη — `arch-2082f3abced0`

- **Διασταύρωση:**  ΣΕΓΑΣ + Ο Ντελάλης, 3η θέση στα 80 μ. εμπόδια Κ16 (12,07, +4,9 άνεμος) το 2024.
- **Υπάρχοντα news IDs:** `track-u16-national-eleftheroupoli-jul-2024`, `track-u16-kilkis-team-apr-2024`.
- **Αρχειακό profile:** `people/arch-2082f3abced0.html` (δημιουργείται/επαληθεύεται από release build· όχι υπόσχεση production deployment).
- **Πηγές:**
  - ΣΕΓΑΣ · Πανελλήνιο Κ16, 14/07/2024: https://www.segas.gr/panellinio-k16-o-aeras-pire-ta-rekor-sto/
  - Ο Ντελάλης · Χάλκινο Παπαγιάννη, 15/07/2024: https://odelalis.gr/epitychimeni-i-parousia-tou-gas-archelaos-katerinis-sto-panellinio-protathlima-stivou-k16/
  - Ο Διάλογος · Διασυλλογικοί Κ16, 26/04/2024: https://odialogos.gr/%CF%80%CE%B9%CE%B5%CF%81%CE%AF%CE%B1/%CE%B1%CE%B8%CE%BB%CE%B7%CF%84%CE%B9%CE%BA%CE%B1/%CF%80%CE%BF%CE%BB%CF%8D-%CE%BA%CE%B1%CE%BB%CE%AE-%CE%B5%CE%BC%CF%86%CE%AC%CE%BD%CE%B9%CF%83%CE%B7-%CF%84%CE%BF%CF%85-%CF%84%CE%BC%CE%AE%CE%BC%CE%B1%CF%84%CE%BF%CF%82-%CF%83%CF%84%CE%AF%CE%B2%CE%BF/
- **Media references των συνδεδεμένων ειδήσεων:** 2 μοναδικές αναφορές. Τα `mediaRefId` είναι τεχνικοί δείκτες URL/path και ΔΕΝ είναι `photoId` ούτε έλεγχος δικαιωμάτων.

## Μητρώο IDs και φωτογραφιών

Το `docs/research/content-id-registry.json` δημιουργήθηκε από τα τέσσερα canonical public datasets. Περιέχει **773 person IDs**, **125 news IDs**, **103 history IDs** και **143 media reference IDs**. Περιλαμβάνονται και σύνδεσμοι φωτογραφιών που υπάρχουν στο `news.json` αλλά **δεν** έχουν εξασφαλισμένα δικαιώματα ή πραγματικό περιεχόμενο αρχείου. Ο generator `tools/build_content_id_registry.py` επιβάλει μοναδικότητα person/news/event IDs και εγκυρότητα των `personIds` ειδήσεων. Για γνήσιο photo ID απαιτείται αργότερα επαλήθευση SHA-256 εικόνας και σύνδεση με το ιδιωτικό R2/D1 Photo Archive (#240). Η τιμή `archivePhotoId: null` δεν πρέπει να αντικαθίσταται με εικασία.

Δεν γίνεται αντιγραφή φωτογραφίας ή αυτοματοποιημένη δημοσίευση. Το πλήθος των media references είναι δείκτες URL/path — δεν ισούται υποχρεωτικά με πλήθος διαφορετικών φωτογραφιών.

## Επαληθεύσεις και όρια

- Ο αριθμός canonical εγγραφών διατηρείται: πρόσωπα 773, ειδήσεις 125, ιστορικά γεγονότα 103.
- Τα IDs των συνδεδεμένων ειδήσεων διατηρήθηκαν, τα διπλά events δεν αναπαράγονται ως νέα news records.
- Αλεξάνδρα Παπαγιάννη: το 12,07 είναι επίδοση με +4,9 μ./δ., όχι νόμιμο ρεκόρ. Ισχύει ειδική προσοχή για δεδομένα αναπτυξιακών ηλικιών.
- Gemini API: **δεν χρησιμοποιείται ως τεκμήριο**. Ο έλεγχος AI μπορεί να αναδείξει αντιφάσεις μόνο σε δημόσια/ελεγμένα δεδομένα και πρέπει να επιτρέπεται από τον κεντρικό Brain budget/privacy gate. Το ξεχωριστό public-safe packet αποκλείει ανήλικους.
- Δεν έχει γίνει merge, production deploy ή έλεγχος πραγματικών Cloudflare logs από αυτή την αλλαγή.
