# SEO και δημοσίευση · Αρχέλαος

## Σημερινό site
- Canonical: `https://archelaos.club/`.
- Υπάρχουν ήδη 682 δημόσιες σελίδες `/people/<id>.html` με ξεχωριστά SEO metadata.
- Το υπάρχον `sitemap.xml` έχει 690 URLs (8 κύριες σελίδες και 682 πρόσωπα).
- Η αρχική πηγή `main` παραμένει **αμετάβλητη** κατά την ανακατασκευή.

## Νέα διάταξη παραγωγής
```text
dist/                   # δημιουργείται αυτομάτως, δεν μπαίνει στο Git
├── index.html
├── history.html, hall-of-fame.html, ...  # 10 κεντρικές σελίδες
├── people/             # 682 αμετακίνητα SEO profiles
├── assets/
│   ├── site/
│   │   ├── css/        # νέα κοινά και ανά σελίδα CSS
│   │   ├── js/         # νέα κοινά και ανά σελίδα JS
│   │   └── data/       # δεδομένα αρχείου από το backup
│   └── ...             # παλιά assets που χρησιμοποιούνται σε profile pages
├── images/
├── sitemap.xml         # sitemap index
├── sitemaps/
│   ├── pages.xml       # 10 κύριες σελίδες
│   └── people.xml      # 682 ατομικά profiles
├── robots.txt
├── _redirects
├── _headers
├── site.webmanifest
└── 404.html
```

## Δημιουργία
`python rebuild/tools/build_release.py`

## Έλεγχος
`python rebuild/tools/verify_release.py`

Τα metadata δημιουργούνται από `rebuild/seo/metadata.json`. Οι κύριες σελίδες αποκτούν περιγραφή, canonical, Open Graph, Twitter cards και Schema.org JSON-LD. Στο σπίτι χρησιμοποιείται `SportsOrganization`, ενώ οι εσωτερικές σελίδες έχουν `WebPage`/breadcrumbs. Δεν προστίθενται αυθαίρετες βαθμολογίες, αξιολογήσεις ή ημερομηνίες τροποποίησης.

## Cloudflare Pages — ΜΟΝΟ με τελική έγκριση
- Build command: `python rebuild/tools/build_release.py && python rebuild/tools/verify_release.py`
- Output directory: `dist`
- Branch: **δεν αλλάζουμε τον production κλάδο χωρίς έγκριση**.
- Δεν δημοσιεύουμε το `rebuild/`: παραμένει `noindex` στις δοκιμαστικές σελίδες.
- Ελέγχουμε πραγματικές διαδρομές, παλιές ανακατευθύνσεις, metadata, φόρμα επικοινωνίας, μεταφράσεις και mobile/desktop με δοκιμαστική διεύθυνση.

## Search Console
Μετά την τελική δημοσίευση θα αρκεί να υποβληθεί ή να επανυποβληθεί `https://archelaos.club/sitemap.xml`. Η αλλαγή σε sitemap index είναι συμβατή με τη μορφή sitemap. Ελέγχουμε πρώτα ότι το ήδη επαληθευμένο Search Console property παραμένει ενεργό.

## SEO αναφορές
- Google Search Central: XML sitemaps και sitemap index · https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- Google Search Central: Sitemap Index · https://developers.google.com/search/docs/crawling-indexing/sitemaps/large-sitemaps/
- Cloudflare Pages: _redirects · https://developers.cloudflare.com/pages/configuration/redirects/
- Schema.org: SportsOrganization · https://schema.org/SportsOrganization

**Δεν θεωρούμε καμία σελίδα οπτικά πανομοιότυπη με το backup πριν την πραγματική σύγκριση screenshots.**
