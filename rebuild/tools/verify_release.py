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
        assert '/assets/site/js/shell.js' in src, "Missing shared footer/accessibility/back-to-top: " + entry["file"]
        assert '/assets/site/css/components.css' in src, "Missing shared controls styling: " + entry["file"]
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
    museum_records=json.loads((DIST/"assets/site/data/museum.json").read_text(encoding="utf-8"))["articles"]
    foundation=next(a for a in museum_records if a["id"]=="intro")
    colours=next(a for a in museum_records if a["id"]=="colors-1968")
    assert "27 Ιουνίου 1968" not in foundation["html"], "Foundation popup repeats colours article"
    assert "Καθορίζονται οριστικώς" in colours["html"], "Colour quote missing in published Museum"
    exhibit_script=(DIST/"assets/site/js/museum.js").read_text(encoding="utf-8")
    assert "'colors-1968'" in exhibit_script, "Second Museum exhibit incorrectly uses introduction"
    museum_page=(DIST/"history.html").read_text(encoding="utf-8")
    assert museum_page.count('class="mu-interviews"') == 1, "Expected one interviews feature in the published Museum"
    assert museum_page.count('href="/interviews.html"') == 1, "Expected one link to interviews in Museum content"
    assert "Δέκα φωνές από τις εφημερίδες" not in museum_page, "Retired press grid leaked into release"
    assert 'id="archive-voices"' not in museum_page and 'id="arch-press-voices"' not in museum_page, "Retired Voices collection leaked into release"
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
        assert "<header" not in text.lower(), "Duplicated legacy header in " + file.name
        assert "<footer" not in text.lower(), "Duplicated legacy footer in " + file.name
        assert '/assets/site/css/components.css' in text, "Shared controls CSS missing: " + file.name

    # All public routes (13 pages, 682 biographies and 404) must share one
    # footer, accessibility trigger and return-to-top implementation.
    not_found=(DIST/"404.html").read_text(encoding="utf-8")
    assert '/assets/site/js/shell.js' in not_found and '/assets/site/css/components.css' in not_found, "404 is missing site-wide tools"
    shared_script=(DIST/"assets/site/js/shell.js").read_text(encoding="utf-8")
    for signature in ('function renderFooter()', 'function renderSiteTools()', "'arch-a11y-launch'", "'arch-back-to-top'", "'arch-a11y-panel'"):
        assert signature in shared_script, "Missing shared feature: " + signature
    assert len(list((DIST/"people").glob("arch-*.html"))) == 682

    # Prevent legacy profile copies from reintroducing an incorrect presidential attribution.
    pid = "arch-61d8d097f601"
    profile = (DIST / "people" / (pid + ".html")).read_text(encoding="utf-8")
    assert "τα καθήκοντα του προέδρου άσκησε προσωρινά ο Χαράλαμπος Σαββίδης" in profile
    assert "Charalampos Savvidis temporarily carried out the president&#39;s duties" in profile
    # Release gate: the Hall, its modal feed, and the canonical master must be identical.
    master = json.loads((ROOT / "hall-of-fame-people.json").read_text(encoding="utf-8"))
    hall = json.loads((DIST / "hall-of-fame-people.json").read_text(encoding="utf-8"))
    modal = json.loads((DIST / "assets/site/data/people.json").read_text(encoding="utf-8"))
    assert hall == master == modal, "Hall of Fame release differs from canonical master"
    assert hall["count"] == len(hall["people"]), "Hall count inconsistent"
    ids = [person["id"] for person in hall["people"]]
    assert len(ids) == len(set(ids)), "Duplicate Hall person identifiers"
    names = [(p["name"].strip().casefold(), p.get("role", "").strip().casefold()) for p in hall["people"]]
    assert len(names) == len(set(names)), "Duplicate Hall names and roles"
    news = json.loads((DIST / "news.json").read_text(encoding="utf-8"))
    assert news == json.loads((ROOT / "news.json").read_text(encoding="utf-8")), "News feed out of sync"
    assert (DIST / "news.html").read_bytes() == (ROOT / "news.html").read_bytes(), "News page out of sync"
    for article in news["items"]:
        assert article.get("id") and article.get("title") and article.get("date"), "Invalid news item"
        assert all(pid in ids for pid in article.get("personIds", [])), "News links to missing Hall biography: " + article["id"]
        if article.get("image") and not article["image"].startswith(("https://", "http://")):
            assert (DIST / article["image"]).is_file(), "Missing news image: " + article["image"]
    published_records = json.loads((DIST / "hall-of-fame-people.json").read_text(encoding="utf-8"))
    rows = published_records if isinstance(published_records, list) else published_records["people"]
    record = next(row for row in rows if row["id"] == pid)
    assert "τα καθήκοντα του προέδρου άσκησε προσωρινά ο Χαράλαμπος Σαββίδης" in record["bio"]
    assert "Charalampos Savvidis temporarily carried out the president's duties" in record["bio_en"]
    assert all((DIST / "people" / url.rsplit("/", 1)[-1]).is_file() for url in loc_people)
    robots = (DIST / "robots.txt").read_text()
    assert "Sitemap: " + SITE + "/sitemap.xml" in robots
    assert (DIST / "_redirects").read_text() == (ROOT / "_redirects").read_text()
    headers = (DIST / "_headers").read_text(encoding="utf-8")
    assert "X-Frame-Options: DENY" in headers, "Clickjacking protection missing"
    assert "Cache-Control: public, max-age=0, must-revalidate" in headers, "Unversioned assets may remain stale"
    assert not (DIST / "rebuild").exists(), "Never publish preview folder"
    assert not (DIST / "research").exists(), "Nonpublished source-checked history must never enter deployment"
    from build_match_schedule import calendar as make_ical, validate as validate_matches
    fixtures_data = json.loads((ROOT/"rebuild/data/match-schedule.json").read_text(encoding="utf-8"))
    valid_fixtures = validate_matches(fixtures_data)
    assert len(valid_fixtures)==len(fixtures_data["matches"])
    assert (DIST/"calendar.ics").read_bytes()==make_ical(fixtures_data).encode("utf-8"), "Published calendar out of sync"
    for fixture in valid_fixtures:
        individual = (DIST/"calendar/events"/(fixture["id"]+".ics"))
        assert individual.is_file(), "Missing personal-calendar file for " + fixture["id"]
        assert individual.read_bytes()==make_ical({**fixtures_data,"matches":[fixture]}).encode("utf-8")

    graph = json.loads((DIST / "assets/site/data/approved-event-graph.json").read_text(encoding="utf-8"))
    assert graph["publication_scope"] == "approved_only"
    owner_research = json.loads((ROOT / "rebuild/research/historical-events.json").read_text(encoding="utf-8"))
    expected_approved = {e["id"] for e in owner_research["events"] if e.get("editorial_status")=="approved"}
    assert {e["id"] for e in graph["events"]} == expected_approved, "Research review or unapproved history leaked"
    assert set(graph["by_event"]) == expected_approved
    for event in graph["events"]:
        for person in event["people"]:
            assert event["id"] in graph["by_person"][person["id"]], "Missing reciprocal person link"

    # Regression checks: staged JS must never request preview-only URLs.
    for script_path in (DIST / "assets/site/js").rglob("*.js"):
        script_text = script_path.read_text(encoding="utf-8")
        assert "/rebuild/" not in script_text, f"Preview-only URL in deployed JS: {script_path.name}"

    # Release-wide asset cache integrity: every page, including each standalone
    # biography and 404, must load the exact published CSS/JS file version.
    from hashlib import sha256 as version_sha256
    from urllib.parse import parse_qs
    published_pages = [DIST / e["file"] for e in main]
    published_pages += list((DIST / "people").glob("arch-*.html"))
    published_pages.append(DIST / "404.html")
    checked_assets = set()
    for html_file in published_pages:
        parser = AssetRefs()
        parser.feed(html_file.read_text(encoding="utf-8"))
        for tag, ref in parser.links:
            parts = urlsplit(ref)
            if not (parts.path.startswith("/assets/site/css/") or
                    parts.path.startswith("/assets/site/js/")):
                continue
            if not parts.path.endswith((".css", ".js")):
                continue
            local_asset = DIST / parts.path.lstrip("/")
            assert local_asset.is_file(), f"Missing published asset in {html_file.name}: {ref}"
            expected_hash = version_sha256(local_asset.read_bytes()).hexdigest()[:12]
            actual_hash = parse_qs(parts.query).get("v", [])
            assert actual_hash == [expected_hash], (
                f"Stale or unversioned CSS/JS in {html_file.name}: {ref}"
            )
            checked_assets.add(parts.path)
    assert any(x.endswith("/viewports.css") for x in checked_assets), "Responsive CSS not checked"
    viewport_css = (DIST / "assets/site/css/viewports.css").read_text(encoding="utf-8")
    for breakpoint in ("mobile", "tablet", "laptop", "desktop", "accessibility"):
        stylesheet = DIST / "assets/site/css" / (breakpoint + ".css")
        version = version_sha256(stylesheet.read_bytes()).hexdigest()[:12]
        assert f'url("./{breakpoint}.css?v={version}")' in viewport_css, (
            "Published viewport CSS imports a stale " + breakpoint + " stylesheet"
        )

    # Search must expose the approved match calendar and department cards.
    catalog_js = (DIST / "assets/site/js/archive-catalog.js").read_text(encoding="utf-8")
    search_html = (DIST / "search.html").read_text(encoding="utf-8")
    for required in ("match-schedule", "department", "fixture", "owner_approved"):
        assert required in catalog_js, "Search catalog missing " + required
    for category in ("department", "fixture", "person", "interview"):
        assert f'data-sr-filter="{category}"' in search_html, "Missing search filter " + category
    assert "/rebuild/" not in catalog_js, "Preview-only search data URL in production"

    # Desktop and mobile load the SAME departments page; its responsive
    # styles and script must have content-derived versions on each release.
    department_html = (DIST / "tmimata.html").read_text(encoding="utf-8")
    from hashlib import sha256 as asset_sha256
    for asset in ("css/departments.css", "js/departments.js", "css/viewports.css"):
        digest = asset_sha256((DIST / "assets/site" / asset).read_bytes()).hexdigest()[:12]
        assert f"/assets/site/{asset}?v={digest}" in department_html, (
            "Department asset version missing or stale: " + asset
        )
    assert "mobile.css" in (DIST / "assets/site/css/viewports.css").read_text(encoding="utf-8"), (
        "Mobile stylesheet not routed by published viewport CSS"
    )

    # Deep links must open the requested department popup or fixture card.
    departments_js = (DIST / "assets/site/js/departments.js").read_text(encoding="utf-8")
    fixtures_js = (DIST / "assets/site/js/match-calendar.js").read_text(encoding="utf-8")
    assert "card.click()" in departments_js, "Search department link does not open its popup"
    assert "get('fixture')" in fixtures_js and "card(exact,0)" in fixtures_js, (
        "Search fixture deep links do not render the selected match"
    )
    assert "fixture='+value" in catalog_js and "department:'/tmimata.html#sport-'" in catalog_js, (
        "Search URLs missing direct department/fixture navigation"
    )

    # All interview records must reach the production data source unchanged.
    source_interviews = json.loads((ROOT / "interviews.json").read_text(encoding="utf-8"))
    published_interviews = json.loads(
        (DIST / "assets/site/data/interviews.json").read_text(encoding="utf-8")
    )
    source_ids = [record["id"] for record in source_interviews["items"]]
    published_ids = [record["id"] for record in published_interviews["items"]]
    assert len(source_ids) == len(set(source_ids)), "Duplicate interview IDs in root source"
    assert len(published_ids) == len(set(published_ids)), "Duplicate published interview IDs"
    assert set(source_ids) == set(published_ids), (
        f"Interview archive out of sync: missing={set(source_ids)-set(published_ids)}, "
        f"extra={set(published_ids)-set(source_ids)}"
    )
    source_by_id = {record["id"]: record for record in source_interviews["items"]}
    published_by_id = {record["id"]: record for record in published_interviews["items"]}
    for record_id, original in source_by_id.items():
        deployed = published_by_id[record_id]
        assert deployed == original, (
            f"Interview content differs between source and production: {record_id}"
        )
    for record in published_interviews["items"]:
        assert record.get("kind") in ("interview", "statement", "report"), (
            "Unknown interview record type: " + record["id"]
        )
        assert record.get("id") and record.get("name"), "Incomplete interview record"
        if record.get("qa"):
            assert all(row.get("question") and row.get("answer") for row in record["qa"]), (
                "Empty interview question/answer: " + record["id"]
            )
    from hashlib import sha256
    expected_version = sha256((DIST / "assets/site/js/interviews.js").read_bytes()).hexdigest()[:12]
    interview_html = (DIST / "interviews.html").read_text(encoding="utf-8")
    assert f"/assets/site/js/interviews.js?v={expected_version}" in interview_html, (
        "Interview script is not fingerprinted to match its deployed content"
    )
    interview_js = (DIST / "assets/site/js/interviews.js").read_text(encoding="utf-8")
    assert "/assets/site/data/interviews.json" in interview_js, (
        "Interview page does not request its deployed dataset"
    )

    print(f"RELEASE QA OK: {len(main)} core pages + {len(loc_people)} indexed profiles.")
    print("Canonicals, robots, structured data, two sitemaps, redirects and local paths verified.")


if __name__ == "__main__":
    verify()
