#!/usr/bin/env python3
"""Prepare a safe, SEO-complete static release from the isolated rebuild.

No changes to repository root files, branch main or Cloudflare deployments.
Run from repository checkout:
    python rebuild/tools/build_release.py
Then optionally:
    python rebuild/tools/verify_release.py

The generated dist/ is intentionally untracked. Publish ONLY after owner approval.
"""
from __future__ import annotations

from html import escape
from pathlib import Path
from shutil import copy2, copytree, rmtree
from urllib.parse import urlparse
from xml.etree import ElementTree as ET
import json
import re

ROOT = Path(__file__).resolve().parents[2]
STAGE = ROOT / "rebuild"
OUTPUT = ROOT / "dist"
SITE = "https://archelaos.club"
IMAGE = f"{SITE}/social-preview.jpg"

METADATA = json.loads((STAGE / "seo" / "metadata.json").read_text(encoding="utf-8"))
assert METADATA["site_url"] == SITE, "Do not silently change canonical domain."

STATIC_ROOT = (
    "archelaos-logo-gold.png", "archelaos-logo-green.png",
    "archelaos-welcome.png", "social-preview.jpg",
    "favicon.ico", "favicon-180.png", "favicon-192.png", "favicon-512.png",
    "archelaos-history-events.json", "archelaos-person-index.json",
    "archelaos-person-links.js", "hall-of-fame-people.json",
)
COMMON_FOLDERS = ("assets", "images", "people")


def js_data(data: object) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def meta_tag(name: str, value: str, *, prop: bool = False) -> str:
    kind = "property" if prop else "name"
    return f'<meta {kind}="{escape(name, quote=True)}" content="{escape(value, quote=True)}">'


def structured_data(entry: dict, url: str) -> str:
    org = f"{SITE}/#organization"
    website = f"{SITE}/#website"
    crumb = [
        {"@type": "ListItem", "position": 1, "name": "Αρχική", "item": SITE + "/"}
    ]
    if entry["path"] != "/":
        crumb.append({
            "@type": "ListItem", "position": 2,
            "name": entry["title"].split("|", 1)[0].strip(), "item": url
        })
    graph = [{
        "@type": "WebPage", "@id": url + "#webpage", "url": url,
        "name": entry["title"], "description": entry["description"],
        "inLanguage": "el", "isPartOf": {"@id": website},
        "about": {"@id": org}
    }]
    if len(crumb) > 1:
        graph.append({"@type": "BreadcrumbList", "itemListElement": crumb})
    if entry["path"] == "/":
        graph.extend([
            {
                "@type": "WebSite", "@id": website,
                "name": METADATA["site_name"], "url": SITE + "/",
                "inLanguage": "el", "publisher": {"@id": org}
            },
            {
                "@type": "SportsOrganization", "@id": org,
                "name": METADATA["site_name"],
                "url": SITE + "/",
                "logo": SITE + "/archelaos-logo-gold.png",
                "image": IMAGE,
                "foundingDate": "1956-04-29",
                "email": "info@archelaos.club",
                "telephone": "+30-23510-28611",
                "address": {
                    "@type": "PostalAddress", "addressLocality": "Κατερίνη",
                    "addressRegion": "Πιερία", "addressCountry": "GR"
                },
                "sport": [
                    "Χειροσφαίριση", "Στίβος", "Τοξοβολία", "Σκοποβολή",
                    "Ενόργανη γυμναστική", "Πάλη", "Πετοσφαίριση", "Κολύμβηση"
                ],
                "sameAs": [
                    "https://www.facebook.com/oarxelaos",
                    "https://www.youtube.com/@GASArchelaosKaterinis"
                ]
            }
        ])
    return '<script type="application/ld+json">' + js_data({
        "@context": "https://schema.org", "@graph": graph
    }) + "</script>"


def create_page(entry: dict) -> None:
    raw = (STAGE / entry["file"]).read_text(encoding="utf-8")
    canonical = SITE + entry["path"]
    # Remove preview-only directives on COPY, never in original staged files.
    raw, count = re.subn(
        r'<meta\b(?=[^>]*\bname=["\x27]robots["\x27])[^>]*>',
        "", raw, flags=re.IGNORECASE
    )
    if count != 1:
        raise ValueError(f"{entry['file']}: expected one preview robots tag, found {count}")
    raw = raw.replace("/rebuild/css/", "/assets/site/css/")
    raw = raw.replace("/rebuild/js/", "/assets/site/js/")
    raw = raw.replace("/rebuild/data/", "/assets/site/data/")
    if re.search(r'<link\b[^>]*rel=["\x27]canonical', raw, re.I):
        raise ValueError(f"Staged file has unexpected canonical: {entry['file']}")
    head = "\n".join([
        '<meta name="robots" content="' + ('index,follow,max-image-preview:large' if entry.get("indexable", True) else 'noindex,follow') + '">',
        '<link rel="icon" href="/favicon.ico" sizes="any">',
        '<link rel="apple-touch-icon" sizes="180x180" href="/favicon-180.png">',
        '<link rel="manifest" href="/site.webmanifest">',

        '<link rel="canonical" href="' + escape(canonical, quote=True) + '">',
        meta_tag("og:type", "website", prop=True),
        meta_tag("og:site_name", METADATA["site_name"], prop=True),
        meta_tag("og:locale", "el_GR", prop=True),
        meta_tag("og:url", canonical, prop=True),
        meta_tag("og:title", entry["title"], prop=True),
        meta_tag("og:description", entry["description"], prop=True),
        meta_tag("og:image", IMAGE, prop=True),
        meta_tag("og:image:alt", "Γ.Α.Σ. Αρχέλαος Κατερίνης", prop=True),
        meta_tag("twitter:card", "summary_large_image"),
        meta_tag("twitter:title", entry["title"]),
        meta_tag("twitter:description", entry["description"]),
        meta_tag("twitter:image", IMAGE),
        structured_data(entry, canonical)
    ])
    raw, n = re.subn(r"<head>", "<head>\n" + head + "\n", raw, count=1, flags=re.I)
    if n != 1:
        raise ValueError(f"{entry['file']}: could not find HTML head")
    raw = re.sub(r"<title>.*?</title>", "<title>" + escape(entry["title"]) + "</title>", raw, count=1, flags=re.S|re.I)
    raw = re.sub(
        r'<meta\b(?=[^>]*\bname=["\x27]description["\x27])[^>]*>',
        meta_tag("description", entry["description"]), raw, count=1, flags=re.I
    )
    (OUTPUT / entry["file"]).write_text(raw, encoding="utf-8")


def sitemap_xml(paths: list[str]) -> str:
    # No invented lastmod, changefreq, or priority values.
    ns = "http://www.sitemaps.org/schemas/sitemap/0.9"
    ET.register_namespace("", ns)
    root = ET.Element(f"{{{ns}}}urlset")
    for path in paths:
        entry = ET.SubElement(root, f"{{{ns}}}url")
        ET.SubElement(entry, f"{{{ns}}}loc").text = SITE + path
    ET.indent(root, space="  ")
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding="unicode") + "\n"


def sitemap_index(names: list[str]) -> str:
    ns = "http://www.sitemaps.org/schemas/sitemap/0.9"
    ET.register_namespace("", ns)
    root = ET.Element(f"{{{ns}}}sitemapindex")
    for name in names:
        entry = ET.SubElement(root, f"{{{ns}}}sitemap")
        ET.SubElement(entry, f"{{{ns}}}loc").text = f"{SITE}/sitemaps/{name}"
    ET.indent(root, space="  ")
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding="unicode") + "\n"


def make_release() -> None:
    # Never operate on a user-specified arbitrary target path.
    if OUTPUT == ROOT or OUTPUT == STAGE:
        raise RuntimeError("Refusing to erase source folders")
    if OUTPUT.exists():
        rmtree(OUTPUT)
    OUTPUT.mkdir()
    for filename in STATIC_ROOT:
        if not (ROOT / filename).is_file():
            raise FileNotFoundError(ROOT / filename)
        copy2(ROOT / filename, OUTPUT / filename)
    for folder in COMMON_FOLDERS:
        copytree(ROOT / folder, OUTPUT / folder)
    for name in ("css", "js", "data"):
        copytree(STAGE / name, OUTPUT / "assets" / "site" / name)
    # The published JavaScript refers to the new organized data folder.
    for script in (OUTPUT / "assets" / "site" / "js").glob("*.js"):
        src = script.read_text(encoding="utf-8")
        src = src.replace("/rebuild/data/", "/assets/site/data/")
        script.write_text(src, encoding="utf-8")

    pages = METADATA["pages"]
    for entry in pages:
        create_page(entry)
    profile_files = sorted((OUTPUT / "people").glob("*.html"))
    if len(profile_files) != 682:
        raise RuntimeError(f"Expected 682 standalone profiles; found {len(profile_files)}")
    people_data = json.loads((OUTPUT / "assets" / "site" / "data" / "people.json").read_text(encoding="utf-8"))
    expected = {person["id"] + ".html" for person in people_data["people"]}
    actual = {path.name for path in profile_files}
    if expected != actual:
        raise RuntimeError(f"Profile file mismatch: missing={len(expected-actual)} extra={len(actual-expected)}")

    (OUTPUT / "sitemaps").mkdir()
    (OUTPUT / "sitemaps" / "pages.xml").write_text(
        sitemap_xml([entry["path"] for entry in pages if entry.get("indexable", True)]), encoding="utf-8"
    )
    (OUTPUT / "sitemaps" / "people.xml").write_text(
        sitemap_xml(["/people/" + file.name for file in profile_files]), encoding="utf-8"
    )
    (OUTPUT / "sitemap.xml").write_text(
        sitemap_index(["pages.xml", "people.xml"]), encoding="utf-8"
    )
    (OUTPUT / "robots.txt").write_text(
        "User-agent: *\nAllow: /\nSitemap: https://archelaos.club/sitemap.xml\n",
        encoding="utf-8"
    )
    copy2(ROOT / "_redirects", OUTPUT / "_redirects")
    (OUTPUT / "_headers").write_text(
        "/*\n  X-Content-Type-Options: nosniff\n"
        "  Referrer-Policy: strict-origin-when-cross-origin\n"
        "  Permissions-Policy: camera=(), microphone=(), geolocation=()\n"
        "\n/assets/site/*\n  Cache-Control: public, max-age=86400\n"
        "\n/images/*\n  Cache-Control: public, max-age=604800\n",
        encoding="utf-8"
    )
    (OUTPUT / "site.webmanifest").write_text(js_data({
        "name": METADATA["site_name"], "short_name": "Αρχέλαος",
        "start_url": "/", "scope": "/", "display": "browser",
        "background_color": "#f8f6ef", "theme_color": "#073d2a",
        "icons": [
            {"src": "/favicon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "/favicon-512.png", "sizes": "512x512", "type": "image/png"}
        ]
    })+"\n", encoding="utf-8")
    (OUTPUT / "404.html").write_text(
        '<!doctype html><html lang="el"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<meta name="robots" content="noindex">'
        '<title>404 · Η σελίδα δεν βρέθηκε | Αρχέλαος</title></head>'
        '<body style="margin:0;background:#f8f6ef;color:#073d2a;font:20px/1.6 system-ui">'
        '<main style="max-width:680px;padding:12vh 24px;margin:auto">'
        '<p style="color:#9b7d3c">Γ.Α.Σ. «Ο ΑΡΧΕΛΑΟΣ»</p><h1 style="font:72px Georgia,serif">404</h1>'
        '<p>Η σελίδα που αναζητάτε δεν βρέθηκε.</p>'
        '<p><a href="/" style="color:#073d2a">Επιστροφή στην αρχική ↗</a></p>'
        '</main></body></html>', encoding="utf-8"
    )
    print(f"BUILD OK: {len(pages)} principal pages, {len(profile_files)} profiles, "
          "two sitemaps, a sitemap index, robots.txt and preserved redirects.")
    print("Output: dist/ — not deployed. Production root was not modified.")


if __name__ == "__main__":
    make_release()
