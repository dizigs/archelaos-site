#!/usr/bin/env python3
"""Generate canonical pages for every published event in the club chronology.

Uses only the public, reviewed event data. No private archive images are copied.
"""
from __future__ import annotations
from html import escape
from pathlib import Path
import json
import re

SITE = "https://www.archelaos.club"
SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{1,110}$")

def render(root: Path, output: Path) -> list[str]:
    events = json.loads((root / "archelaos-history-events.json").read_text(encoding="utf-8"))["events"]
    people = {p["id"]: p for p in json.loads((root / "hall-of-fame-people.json").read_text(encoding="utf-8"))["people"]}
    if len({e["id"] for e in events}) != len(events):
        raise ValueError("Duplicate event IDs")
    ordered = sorted(events, key=lambda e: (str(e.get("date") or ""), e["id"]))
    folder = output / "events"
    folder.mkdir(parents=True, exist_ok=True)
    links = []
    result = []
    for index, event in enumerate(ordered):
        eid = event["id"]
        if not SLUG.fullmatch(eid):
            raise ValueError("Unsafe event ID: " + repr(eid))
        name = escape(event["title"])
        desc = escape(event["description"])
        category = escape(event.get("category") or "Ιστορία")
        date = escape(str(event.get("display_date") or event.get("date") or ""))
        url = f"{SITE}/events/{eid}.html"
        related = []
        for pid in event.get("people") or []:
            if pid not in people:
                raise ValueError("Unknown person reference " + pid + " in " + eid)
            related.append(f'<a href="/people/{escape(pid, quote=True)}.html">{escape(people[pid]["name"])}</a>')
        members = ('<section class="event-relations"><h2>Σχετικά πρόσωπα</h2><div class="event-people">'
                   + "".join(related) + "</div></section>") if related else ""
        # Source may be an internal archive reference and not a public URL.
        source = str(event.get("source") or "").strip()
        if source:
            evidence = ('<section class="event-sources"><h2>Τεκμηρίωση</h2><p>'
                        + escape(source) + "</p></section>")
        else:
            evidence = ""
        if event.get("verification") not in ("primary-club-minute", "published-club-history", "existing-biographies"):
            evidence += '<p class="event-context">Αρχειακή αναφορά — η τεκμηρίωση ελέγχεται.</p>'
        prev_link = (f'<a href="/events/{escape(ordered[index-1]["id"])}.html">Προηγούμενο γεγονός</a>'
                     if index else "")
        next_link = (f'<a href="/events/{escape(ordered[index+1]["id"])}.html">Επόμενο γεγονός</a>'
                     if index + 1 < len(ordered) else "")
        schema = json.dumps({
            "@context": "https://schema.org", "@type": "Article",
            "headline": event["title"],
            "description": event["description"],
            "inLanguage": "el",
            "mainEntityOfPage": url,
            "publisher": {"@type": "Organization", "name": "Γ.Α.Σ. Ο Αρχέλαος Κατερίνης"},
        }, ensure_ascii=False).replace("<", "\\u003c")
        html = f'''<!doctype html>
<html lang="el"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{name} | Ιστορικό Χρονολόγιο Αρχέλαος</title>
<meta name="description" content="{escape(event["description"][:155], quote=True)}">
<link rel="canonical" href="{escape(url, quote=True)}">
<meta property="og:type" content="article">
<meta property="og:title" content="{escape(event["title"], quote=True)}">
<meta property="og:description" content="{escape(event["description"][:155], quote=True)}">
<meta property="og:url" content="{escape(url, quote=True)}">
<meta property="og:image" content="{SITE}/social-preview.jpg">
<link rel="stylesheet" href="/assets/site/css/tokens.css">
<link rel="stylesheet" href="/assets/site/css/components.css">
<link rel="stylesheet" href="/assets/site/css/viewports.css">
<link rel="stylesheet" href="/assets/site/css/event-pages.css">
<script defer src="/assets/site/js/shell.js"></script>
<script defer src="/assets/site/js/favorites.js"></script>
<script defer src="/assets/site/js/motion.js"></script>
<script type="application/ld+json">{schema}</script>
</head><body class="event-page">
<main id="main-content" class="event-main">
<nav aria-label="Διαδρομή" class="event-crumb"><a href="/history.html">Ψηφιακό Μουσείο</a><span aria-hidden="true"> / </span><a href="/events/index.html">Πλήρες Χρονολόγιο</a></nav>
<article class="event-article"><p class="event-category">{category}</p>
<time class="event-date">{date}</time><h1>{name}</h1>
<div class="event-description">{desc}</div>
{members}{evidence}
<nav aria-label="Πλοήγηση στα γεγονότα" class="event-prevnext">{prev_link}{next_link}</nav></article>
</main></body></html>
'''
        (folder / f"{eid}.html").write_text(html, encoding="utf-8")
        links.append(f'<li><a href="/events/{escape(eid, quote=True)}.html"><time>{date}</time><span>{name}</span></a></li>')
        result.append(f"/events/{eid}.html")
    listing = '''<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">''' + (
        f'<title>Πλήρες Χρονολόγιο | Γ.Α.Σ. Αρχέλαος</title><link rel="canonical" href="{SITE}/events/index.html">') + '''
<link rel="stylesheet" href="/assets/site/css/tokens.css"><link rel="stylesheet" href="/assets/site/css/components.css">
<link rel="stylesheet" href="/assets/site/css/viewports.css"><link rel="stylesheet" href="/assets/site/css/event-pages.css">
<script defer src="/assets/site/js/shell.js"></script></head><body class="event-page">
<main id="main-content" class="event-main"><nav class="event-crumb" aria-label="Διαδρομή"><a href="/history.html">Ψηφιακό Μουσείο</a></nav>
<section class="event-article"><p class="event-category">Από το 1956 έως σήμερα</p><h1>Πλήρες Ιστορικό Χρονολόγιο</h1>
<p>Ιστορικά γεγονότα από το τεκμηριωμένο αρχείο του Γ.Α.Σ. «Ο Αρχέλαος» Κατερίνης.</p><ol class="event-index">''' + "".join(links) + '''</ol></section></main></body></html>'''
    (folder / "index.html").write_text(listing, encoding="utf-8")
    return ["/events/index.html", *result]

if __name__ == "__main__":
    root = Path(__file__).resolve().parents[2]
    output = root / "dist"
    print("Event pages:", len(render(root, output)))
