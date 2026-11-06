# Μελλοντική Τροπαιοθήκη — Φάση 1: καταγραφή, όχι δημοσίευση

Συνδεδεμένη εργασία: https://github.com/dizigs/archelaos-site/issues/256

**ΣΤΟΧΟΣ:** Ξεχωριστό, σταθερό `mentionId` για κάθε ανιχνευμένη κειμενική αναφορά μετάλλιου ή τίτλου, και **ένα μόνο** `achievementId` για κάθε πραγματική διάκριση, όταν επαληθευτεί χειροκίνητα.

## Κατάσταση 06/11/2026
- Source snapshot: 6 JSON files από το τότε `main` (τα source **blob SHAs** καταγράφονται σε κάθε record).
- Σαρώθηκαν **1034 records** σε 7 συλλογές.
- Εντοπίστηκαν **508 αναφορές/υποψήφιες αξιώσεις**, όχι 508 μετάλλια.
- **221** ενδείξεις μεταλλίου, **123** ενδείξεις τίτλου και **164** θέσεις που απαιτούν επιβεβαίωση αν είναι μετάλλια.
- Όλες είναι `pending_human_verification`. Το `verified-achievements.json` παραμένει **κενό σκόπιμα**, μέχρι να επαληθευτούν και να συγχωνευθούν οι επαναλαμβανόμενες αναφορές.

## Αρχεία
- `candidate-mentions.json`: πλήρες source-scoped mention inventory (primary record IDs, offsets, excerpts, source URLs και hints).
- `review-queue.md`: αναγνώσιμος κατάλογος υποψηφίων.
- `verified-achievements.json`: κενός, αυστηρά μη δημοσιευμένος κατάλογος. Δεν περιλαμβάνει υποθέσεις.
- `README.md`: σχήμα / κανόνες μεταγενέστερης επιμέλειας.

## Σημαντικοί έλεγχοι πριν από approval
1. **Μόνο αθλητικό μετάλλιο ή τίτλος**, όχι απλή συμμετοχή, έπαινος, επετειακό μετάλλιο, ρεκόρ, αθλητική άνοδος ή πρόκριση από μόνη της.
2. Έλεγχος ότι **ο δικαιούχος ήταν πράγματι στον Αρχέλαο κατά τον συγκεκριμένο αγώνα**. Στους προπονητές/διοικητικούς περιγραφές επιτυχιών αθλητών **δεν αποδίδονται αυτομάτως** στον συντάκτη της βιογραφίας.
3. Ελέγχουμε την πρωτογενή πηγή και ακριβή κατηγορία αγώνα, διακριτό επίπεδο, ημερομηνία, διοργάνωση, βαθμό θέσης και ομάδα. Οι 2η/3η θέσεις χωρίς ρητή τεκμηρίωση μεταλλίου **δεν ανακηρύσσονται μετάλλια**.
4. Πολλαπλές αναφορές σε news, HOF, ιστορία και γεγονότα για **το ίδιο αποτέλεσμα** συγχωνεύονται σε **ένα** `achievementId` με πολλά `mentionIds`.
5. Ομαδικό πρωτάθλημα καταγράφεται ως **ένα ομαδικό achievement** με συνδεδεμένους `personIds` (όπου τεκμηριώνονται), όχι ως πολλά δήθεν ανεξάρτητα ατομικά μετάλλια.
6. Μακρόχρονα σερί τίτλων απαιτούν **ξεχωριστή ημερολογιακή επαλήθευση ανά έτος/κατηγορία** πριν διασπαστούν σε ανεξάρτητα achievements.
7. Το δημοσιευμένο `hall-of-fame-people.json` δεν τροποποιείται. Οι αδημοσίευτες εγγραφές `historical-events.json` είναι **source_checked**, όχι αυτόματα `editorial_approved`.

## Πρότυπο μελλοντικού verified achievement
```json
{
  "achievementId": "ach-<stable-canonical-id>",
  "awardType": "gold|silver|bronze|championship_title|cup_title|other_approved_title",
  "competition": "exact source-confirmed name",
  "sport": "source-confirmed sport",
  "discipline": "source-confirmed discipline or event",
  "category": "age/weight/category",
  "dateOrSeason": "confirmed date or season",
  "recipientType": "individual|team",
  "personIds": [],
  "eventIds": [],
  "photoIds": [],
  "mentionIds": [],
  "primarySourceUrls": [],
  "editorialStatus": "approved",
  "reviewedAt": "<UTC time>",
  "reviewedBy": "<authorized editor>"
}
```

Ο κανόνας είναι: **source mentions → ιδιωτικό review / dedupe → verified achievement ledger → (μελλοντικά) Τροπαιοθήκη**. Νέα φωτογραφία, μαρτυρία ή είδηση δημιουργεί υποψήφιες συσχετίσεις, όχι αυτόματη απονομή τίτλου. Η δημόσια Τροπαιοθήκη είναι ξεχωριστή μεταγενέστερη εκκρεμότητα.

### Κάλυψη / provenance
- `hall-of-fame-people.json`, `people`: 773 records, 193 records με υποψήφιες αναφορές, 247 mentions, blob `5104be75a437ed0fb50da4ebd8fd4d99ec0a8412`
- `rebuild/research/historical-events.json`, `events`: 19 records, 8 records με υποψήφιες αναφορές, 10 mentions, blob `4a3c2eecb365cfb51856ef9a33b70f975eebfa27`
- `rebuild/data/moments.json`, `moments`: 70 records, 17 records με υποψήφιες αναφορές, 27 mentions, blob `42923d0f0f2f424f50784388c4b9188947888324`
- `rebuild/data/stories.json`, `stories`: 21 records, 7 records με υποψήφιες αναφορές, 17 mentions, blob `2f6ed6e0134461761c89ef001ac4b32995e9d296`, 21 entries χωρίς canonical ID (η θέση τους κρατήθηκε ως locator, χωρίς να εφευρεθεί επίσημο ID)
- `news.json`, `items`: 125 records, 75 records με υποψήφιες αναφορές, 159 mentions, blob `735c70daae8dff63150f4cfa0cc1bee5c0f92ce1`
- `rebuild/data/museum.json`, `articles`: 16 records, 9 records με υποψήφιες αναφορές, 47 mentions, blob `f12a6226ac6e4fa0eb0d7aa60f227136d88f31f0`
- `rebuild/data/museum.json`, `press`: 10 records, 1 records με υποψήφιες αναφορές, 1 mentions, blob `f12a6226ac6e4fa0eb0d7aa60f227136d88f31f0`

### Όρια αυτοματισμού / accuracy
Πρόκειται για **rule-based κειμενική εξαγωγή**, όχι ιστορική αποδοχή. Μπορεί να υπάρχουν false positives από αναφορές σε άλλες ομάδες, ομαδικές επιτυχίες τρίτων, χρονολογίες ή συνώνυμες διατυπώσεις που δεν ανιχνεύτηκαν. Ο αριθμός αυτός **δεν** αντιστοιχεί ούτε σε medals ούτε σε τίτλους έως ανθρώπινη διόρθωση. Για ασφαλή πλήρη κάλυψη χρειάζεται και επόμενος κύκλος με έλεγχο όλων των ρεκόρ και πρωτογενών πηγών.
