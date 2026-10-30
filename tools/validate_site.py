#!/usr/bin/env python3
"""Static, offline checks for the Archelaos website. Python standard library only."""
from __future__ import annotations

import json
from html import escape
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PAGES = (
    "index.html", "history.html", "hall-of-fame.html",
    "70-stigmes.html", "stories.html", "retro-matches.html",
    "board.html", "sponsors.html", "contact.html",
)
JSON_FILES = (
    "hall-of-fame-people.json", "archelaos-person-index.json",
)
errors: list[str] = []


def error(message: str) -> None:
    errors.append(message)
    print("ERROR:", message)


class LocalAssets(HTMLParser):
    def __init__(self, source: str) -> None:
        super().__init__(convert_charrefs=True)
        self.source = source

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag not in ("img", "script", "link", "source", "video", "audio"):
            return
        for attribute in ("src", "href", "poster"):
            if attribute not in attributes or not attributes[attribute]:
                continue
            url = attributes[attribute] or ""
            parts = urlsplit(url)
            if parts.scheme or parts.netloc or url.startswith(("//", "#", "/")):
                continue
            target = unquote(parts.path)
            if not target or "{" in target or "}" in target:
                continue
            # Only check actual bundled assets, not navigational/anchor hrefs.
            if tag == "link" and target.lower().endswith((".html", ".htm")):
                continue
            asset = (ROOT / self.source).parent / target
            if not asset.is_file():
                error(f"{self.source}: missing local asset {target!r}")


def check_json(path: str):
    try:
        return json.loads((ROOT / path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        error(f"{path}: cannot parse JSON: {exc}")
        return None


def check_people(path: str, data: object) -> None:
    if not isinstance(data, dict) or not isinstance(data.get("people"), list):
        error(f"{path}: expected object containing a people array")
        return
    people = data["people"]
    if data.get("count") != len(people):
        error(f"{path}: count metadata differs from number of people")
    ids = []
    for pos, person in enumerate(people):
        if not isinstance(person, dict) or not all(person.get(k) for k in ("id", "name")):
            error(f"{path}: record {pos} needs an id and a name")
            continue
        ids.append(person["id"])
    if len(set(ids)) != len(ids):
        error(f"{path}: duplicate person IDs")



def check_biography_index(index: list, hall: dict) -> None:
    """Enforce source/index consistency; report ambiguous names without merging people."""
    people = {p["id"]: p for p in hall["people"] if isinstance(p, dict) and p.get("id")}
    variants: dict[str, set[str]] = {}
    for row in index:
        if not isinstance(row, dict) or not isinstance(row.get("id"), str):
            continue
        identifier = row["id"]
        canonical = people.get(identifier)
        if canonical is None:
            continue
        if row.get("name") != canonical.get("name"):
            error(f"Biography index: name differs for ID {identifier}")
        aliases = row.get("names", [])
        if not isinstance(aliases, list) or not all(isinstance(a, str) for a in aliases):
            error(f"Biography index: malformed aliases for ID {identifier}")
            aliases = []
        for name in [row.get("name", ""), row.get("name_en", ""), *aliases]:
            key = " ".join(str(name).casefold().split())
            if len(key.split()) >= 2:
                variants.setdefault(key, set()).add(identifier)
    ambiguous = [(name, ids) for name, ids in variants.items() if len(ids) > 1]
    for name, ids in sorted(ambiguous):
        print(f"NOTICE: ambiguous biography name {name!r}; auto-linking skips {len(ids)} matching IDs")
    print(f"Biography index verified: {len(people)} records, {len(ambiguous)} ambiguous name spellings")

def check_sitemap() -> None:
    try:
        xml = ET.parse(ROOT / "sitemap.xml")
        urls = [
            (elem.text or "").strip()
            for elem in xml.findall(".//{http://www.sitemaps.org/schemas/sitemap/0.9}loc")
        ]
    except (OSError, ET.ParseError) as exc:
        error(f"sitemap.xml: {exc}")
        return
    listed = {urlsplit(url).path.lstrip("/") or "index.html" for url in urls}
    for page in PAGES:
        if page not in listed:
            error(f"sitemap.xml: {page} is missing")
    for url in urls:
        parts = urlsplit(url)
        if parts.scheme != "https" or parts.netloc != "archelaos.club":
            error(f"sitemap.xml: unexpected domain or protocol: {url}")
        elif not (ROOT / (parts.path.lstrip("/") or "index.html")).is_file():
            error(f"sitemap.xml: target missing: {url}")


def main() -> int:
    for page in PAGES:
        file = ROOT / page
        if not file.is_file():
            error(f"missing page: {page}")
            continue
        text = file.read_text(encoding="utf-8")
        parser = LocalAssets(page)
        parser.feed(text)
        parser.close()
        if not re.search(r"<title\b[^>]*>\s*[^<]+", text, re.IGNORECASE):
            error(f"{page}: missing page title")
        if not re.search(r'<meta\b[^>]*\bname=["\']description["\']', text, re.IGNORECASE):
            error(f"{page}: missing SEO description")
    for filename in JSON_FILES:
        data = check_json(filename)
        if data is not None and filename.endswith("people.json"):
            check_people(filename, data)
    hall = check_json("hall-of-fame-people.json")
    if isinstance(hall, dict) and isinstance(hall.get("people"), list) and not hall["people"]:
        error("Hall of Fame: biography list must not be empty")
    index = check_json("archelaos-person-index.json")
    if index is not None:
        if not isinstance(index, list):
            error("archelaos-person-index.json: expected a list")
        elif isinstance(hall, dict) and isinstance(hall.get("people"), list):
            canonical_ids = {person["id"] for person in hall["people"] if isinstance(person, dict) and person.get("id")}
            index_ids = [person.get("id") for person in index if isinstance(person, dict)]
            if len(index) != len(index_ids) or len(index_ids) != len(set(index_ids)):
                error("archelaos-person-index.json: malformed rows or duplicate IDs")
            if set(index_ids) != canonical_ids:
                error("archelaos-person-index.json: IDs differ from canonical Hall of Fame records")
            check_biography_index(index, hall)
    # Public source references must be explicit, safe links; private archive stays off-site.
    if isinstance(hall, dict) and isinstance(hall.get("people"), list):
        for person in hall["people"]:
            if not isinstance(person, dict):
                continue
            refs = person.get("refs", [])
            if not isinstance(refs, list):
                error(f"Invalid refs list for {person.get('id')}")
                continue
            seen_refs = set()
            for ref in refs:
                if not isinstance(ref, dict) or not isinstance(ref.get("label"), str) or not isinstance(ref.get("url"), str):
                    error(f"Invalid source reference for {person.get('id')}")
                    continue
                parts = urlsplit(ref["url"])
                if parts.scheme != "https" or not parts.netloc or parts.username or parts.password:
                    error(f"Unsafe source URL for {person.get('id')}")
                if parts.hostname in ("drive.google.com", "docs.google.com"):
                    error(f"Private Drive link in public biography for {person.get('id')}")
                if ref["url"] in seen_refs:
                    error(f"Duplicate source URL for {person.get('id')}")
                seen_refs.add(ref["url"])
    links_source = (ROOT / "archelaos-person-links.js").read_text(encoding="utf-8")
    if "DATA_URL='hall-of-fame-people.json'" not in links_source:
        error("Biography link script must load the canonical Hall of Fame JSON")
    if isinstance(hall, dict) and isinstance(hall.get("people"), list):
        for person in hall["people"]:
            if not isinstance(person, dict) or not isinstance(person.get("id"), str):
                continue
            profile = ROOT / "people" / (person["id"] + ".html")
            if not profile.is_file():
                error(f"Missing published profile for {person['id']}")
            elif '<link rel="canonical"' not in profile.read_text(encoding="utf-8"):
                error(f"Missing canonical URL in profile for {person['id']}")
    # V3 foundation: detect stale static profiles when JSON biographies change.
    if isinstance(hall, dict) and isinstance(hall.get("people"), list):
        for person in hall["people"]:
            if not isinstance(person, dict) or not isinstance(person.get("id"), str):
                continue
            profile = ROOT / "people" / (person["id"] + ".html")
            if not profile.is_file():
                continue
            html = profile.read_text(encoding="utf-8")
            if "<h1>" + escape(str(person.get("name", "")), quote=True).replace("&#x27;", "&#39;") + "</h1>" not in html:
                error(f"Outdated profile name: {person['id']}")
            bio = escape(str(person.get("bio") or ""), quote=True).replace("&#x27;", "&#39;")
            if bio and '<div class="bio">' + bio + '</div>' not in html:
                error(f"Outdated profile biography: {person['id']}")
    if isinstance(hall, dict) and isinstance(hall.get("people"), list):
        sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
        for person in hall["people"]:
            if isinstance(person, dict) and isinstance(person.get("id"), str):
                if "/people/" + person["id"] + ".html</loc>" not in sitemap:
                    error(f"Missing biography sitemap URL: {person['id']}")
    check_sitemap()
    if errors:
        print(f"\nSite validation FAILED: {len(errors)} issue(s).")
        return 1
    print("Site validation passed: HTML assets, JSON, biographies and sitemap.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
