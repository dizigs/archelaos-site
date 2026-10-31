#!/usr/bin/env python3
"""Read-only checks for the generated dist/ directory."""
from html.parser import HTMLParser
from html import escape
from pathlib import Path
from urllib.parse import urlsplit
from xml.etree import ElementTree as ET
import json
import re

ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / "dist"
META = json.loads((ROOT / "rebuild" / "seo" / "metadata.json").read_text(encoding="utf-8"))
NS = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
SITE = META["site_url"]


class AssetRefs(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag not in ("a", "img", "script", "link"):
            return
        mapping = dict(attrs)
        item = mapping.get("href") if tag in ("a", "link") else mapping.get("src")
        if item:
            self.links.append((tag, item))


def verify() -> None:
    assert DIST.is_dir(), "Run build_release.py first"
    main = META["pages"]
    canonical_set = set()
    for entry in main:
        file = DIST / entry["file"]
        src = file.read_text(encoding="utf-8")
        canonical = SITE + entry["path"]
        should_index = entry.get("indexable", True)
        expected_robots = 'index,follow,max-image-preview:large' if should_index else 'noindex,follow'
        assert '<meta name="robots" content="' + expected_robots + '">' in src, entry["file"]
        assert src.count('<link rel="canonical" href="' + canonical + '">') == 1, entry["file"]
        assert src.count('property="og:url" content="' + canonical + '"') == 1, entry["file"]
        assert src.count('property="og:image"') == 1, entry["file"]
        assert 'application/ld+json' in src, entry["file"]
        assert "/rebuild/" not in src, f"Staged asset reference leaked in {entry['file']}"
        assert src.count('name="description"') == 1, entry["file"]
        assert src.count('<meta name="robots"') == 1, entry["file"]
        if should_index:
            canonical_set.add(canonical)
        head = src.split("</head>", 1)[0]
        script = re.search(r'<script type="application/ld\+json">([^<]+)</script>', head)
        assert script, entry["file"] + " has no structured data"
        parsed = json.loads(script.group(1))
        assert parsed["@graph"][0]["url"] == canonical, entry["file"]
        links = AssetRefs()
        links.feed(src)
        for tag, link in links.links:
            if link.startswith(("https:", "http:", "mailto:", "tel:", "#", "data:")):
                continue
            url = urlsplit(link)
            if not url.path:
                continue
            if url.path.startswith("/"):
                target = DIST / url.path.lstrip("/")
            else:
                target = file.parent / url.path
            if target.is_file():
                continue
            if url.path == "/":  # Root URL maps to dist/index.html
                continue
            if tag == "a" and url.path.endswith("/"):
                target = target / "index.html"
                if target.is_file():
                    continue
            # Dist cloudflare redirects only the two historically removed routes.
            if url.path in ("/history-events.html", "/history-events"):
                continue
            raise AssertionError(f"Broken internal link in {entry['file']}: {link}")
    assert len(canonical_set) == sum(e.get("indexable", True) for e in main), "Duplicate indexable canonicals"
    sitemap = ET.parse(DIST / "sitemap.xml")
    submaps = [node.text for node in sitemap.findall(".//s:loc", NS)]
    expected = [SITE+"/sitemaps/pages.xml", SITE+"/sitemaps/people.xml"]
    assert submaps == expected, submaps
    pages = ET.parse(DIST / "sitemaps" / "pages.xml")
    profiles = ET.parse(DIST / "sitemaps" / "people.xml")
    loc_pages = [e.text for e in pages.findall(".//s:loc", NS)]
    loc_people = [e.text for e in profiles.findall(".//s:loc", NS)]
    assert set(loc_pages) == canonical_set and len(loc_pages) == len(canonical_set)
    assert len(loc_people) == len(set(loc_people)) == 682
    addenda = json.loads((ROOT/"rebuild"/"data"/"people-addenda.json").read_text(encoding="utf-8"))["entries"]
    for pid, additions in addenda.items():
        output = (DIST / "people" / (pid + ".html")).read_text(encoding="utf-8")
        for addition in additions:
            assert escape(addition["el"]) in output, "Missing Greek biography enrichment: " + pid
            assert escape(addition["en"]) in output, "Missing English biography enrichment: " + pid
    for file in (DIST / "people").glob("arch-*.html"):
        text = file.read_text(encoding="utf-8")
        assert '/assets/site/js/shell.js' in text and '/assets/site/js/profile-favorite.js' in text, file.name
        assert '/assets/navigation.js' not in text and '/history-events.html' not in text, file.name

    # Prevent legacy profile copies from reintroducing an incorrect presidential attribution.
    pid = "arch-61d8d097f601"
    profile = (DIST / "people" / (pid + ".html")).read_text(encoding="utf-8")
    assert "τα καθήκοντα του προέδρου άσκησε προσωρινά ο Χαράλαμπος Σαββίδης" in profile
    assert "Charalampos Savvidis temporarily carried out the president&#39;s duties" in profile
    published_records = json.loads((DIST / "hall-of-fame-people.json").read_text(encoding="utf-8"))
    rows = published_records if isinstance(published_records, list) else published_records["people"]
    record = next(row for row in rows if row["id"] == pid)
    assert "τα καθήκοντα του προέδρου άσκησε προσωρινά ο Χαράλαμπος Σαββίδης" in record["bio"]
    assert "Charalampos Savvidis temporarily carried out the president's duties" in record["bio_en"]
    assert all((DIST / "people" / url.rsplit("/", 1)[-1]).is_file() for url in loc_people)
    robots = (DIST / "robots.txt").read_text()
    assert "Sitemap: " + SITE + "/sitemap.xml" in robots
    assert (DIST / "_redirects").read_text() == (ROOT / "_redirects").read_text()
    assert not (DIST / "rebuild").exists(), "Never publish preview folder"
    print(f"RELEASE QA OK: {len(main)} core pages + {len(loc_people)} indexed profiles.")
    print("Canonicals, robots, structured data, two sitemaps, redirects and local paths verified.")


if __name__ == "__main__":
    verify()
