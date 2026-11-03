#!/usr/bin/env python3
"""Read-only checks for the generated dist/ directory."""
from html.parser import HTMLParser
from html import escape
from shutil import which
import subprocess
from pathlib import Path
from urllib.parse import urlsplit
from xml.etree import ElementTree as ET
import json
import re
from datetime import date

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
    current_total = len(json.loads((ROOT / "hall-of-fame-people.json").read_text(encoding="utf-8"))["people"])
    assert len(loc_people) == len(set(loc_people)) == current_total
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

    # All public routes (core pages, canonical biographies and 404) must share one
    # footer, accessibility trigger and return-to-top implementation.
    not_found=(DIST/"404.html").read_text(encoding="utf-8")
    assert '/assets/site/js/shell.js' in not_found and '/assets/site/css/components.css' in not_found, "404 is missing site-wide tools"
    shared_script=(DIST/"assets/site/js/shell.js").read_text(encoding="utf-8")
    for signature in ('function renderFooter()', 'function renderSiteTools()', "'arch-a11y-launch'", "'arch-back-to-top'", "'arch-a11y-panel'"):
        assert signature in shared_script, "Missing shared feature: " + signature
    assert len(list((DIST/"people").glob("arch-*.html"))) == current_total

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
    for js_path in ("biographies.js", "archive-catalog.js", "home.js"):
        code = (DIST / "assets/site/js" / js_path).read_text(encoding="utf-8")
        assert "/hall-of-fame-people.json" in code, "Legacy Hall feed in " + js_path
    assert hall["count"] == len(hall["people"]), "Hall count inconsistent"
    ids = [person["id"] for person in hall["people"]]
    assert len(ids) == len(set(ids)), "Duplicate Hall person identifiers"
    names = [(p["name"].strip().casefold(), p.get("role", "").strip().casefold()) for p in hall["people"]]
    assert len(names) == len(set(names)), "Duplicate Hall names and roles"
    # A single traceable graph must connect every publicly named person/event
    # to its canonical record in both directions. No private intake data leaks.
    relationships = json.loads((DIST / "assets/site/data/archive-relationships.json").read_text(encoding="utf-8"))
    from build_archive_relationships import generate as expected_relationships
    assert relationships == expected_relationships(), "Public archive links differ from canonical source graph"
    assert relationships["counts"]["nodes"] >= 1000, "Incomplete archive link index"
    for edge in relationships["edges"]:
        a, b = edge["a"], edge["b"]
        assert a in relationships["nodes"] and b in relationships["nodes"], "Dangling linked record"
        assert {"key":b,"relation":edge["relation"]} in relationships["by_node"][a], "Missing reverse link A"
        assert {"key":a,"relation":edge["relation"]} in relationships["by_node"][b], "Missing reverse link B"
    assert (DIST / "assets/archive-links.js").is_file(), "Missing archive link popup renderer"
    assert (DIST / "assets/archive-links.css").is_file(), "Missing archive link styles"
    news = json.loads((DIST / "news.json").read_text(encoding="utf-8"))
    assert news == json.loads((ROOT / "news.json").read_text(encoding="utf-8")), "News feed out of sync"
    # The release pipeline deliberately fingerprints shared CSS/JS references in
    # every HTML file. Compare NEWS source and output after normalizing *only*
    # those expected version queries; the source must otherwise remain unchanged.
    src_news = (ROOT / "news.html").read_text(encoding="utf-8")
    built_news = (DIST / "news.html").read_text(encoding="utf-8")
    assert '/assets/site/js/shell.js' in built_news, "News uses the wrong navigation system"
    assert '/assets/navigation.js' not in built_news, "Legacy News navigation must not appear"
    assert 'fonts.googleapis.com/css2?family=Inter' in built_news, "News navigation font not loaded"
    shared_ref = re.compile(
        r'(/assets/site/(?:css|js)/[A-Za-z0-9._/-]+[.](?:css|js))(?:[?]v=[a-f0-9]{12})?'
    )
    strip_version = lambda html: shared_ref.sub(lambda match: match.group(1), html)
    assert strip_version(built_news) == strip_version(src_news), "News page differs beyond expected CSS/JS cache versions"

    # Prevent broken article deep links and duplicate cards without imposing
    # editorial approval or a fixed number of published articles.
    news_ids = [a.get("id") for a in news["items"]]
    assert len(news_ids) == len(set(news_ids)), "Duplicate News IDs (article URLs must be unique)"
    for article in news["items"]:
        raw_date = article.get("date", "")
        try:
            valid_date = date.fromisoformat(raw_date)
            assert valid_date.isoformat() == raw_date
        except (TypeError, ValueError, AssertionError):
            raise AssertionError("Invalid News date (YYYY-MM-DD): " + str(article.get("id")))
        assert isinstance(article.get("body"), list) and article["body"], "News article has no body: " + str(article.get("id"))
        assert article.get("source"), "News article missing source attribution: " + str(article.get("id"))
        assert re.fullmatch(r"[a-zA-Z0-9._:-]{1,170}", article.get("id", "")), "Unsafe News article deep-link ID"
    seen_news_titles = set()
    for article in news["items"]:
        fingerprint = (re.sub(r"\\s+", " ", article["title"]).casefold().strip(), article["date"])
        if fingerprint in seen_news_titles:
            print("[QA WARNING] Potential repeated News title/date: " + article["id"])
        seen_news_titles.add(fingerprint)
    for article in news["items"]:
        assert article.get("id") and article.get("title") and article.get("date"), "Invalid news item"
        assert all(pid in ids for pid in article.get("personIds", [])), "News links to missing Hall biography: " + article["id"]
        if article.get("image") and not article["image"].startswith(("https://", "http://")):
            assert (DIST / article["image"]).is_file(), "Missing news image: " + article["image"]
    # Permanent editorial rule: a news story must never recycle a department
    # slideshow, an unrelated match photo or the club crest as event evidence.
    slideshow_images = {
        "images/enorgani-slideshow-edafos.jpg",
        "images/wrestling-action.webp",
        "images/archery-indoor-archelaos.webp",
        "images/archery-outdoor-youth.webp",
        "images/handball-archelaos-panserraikos-2025.jpg",
        "assets/archelaos-crest.png",
    }
    for article in news["items"]:
        photo = article.get("image", "") or ""
        assert photo not in slideshow_images, "Recycled slideshow photo in News: " + article["id"]
        if photo.startswith(("https://", "http://")):
            parts = urlsplit(photo)
            assert parts.scheme == "https" and parts.hostname and not parts.username and not parts.password, "Invalid remote news photo URL: " + article["id"]
            assert photo == article.get("imageSourceUrl"), "Original remote news photo lacks source trace"
    # New external photography is an optional enhancement. Unknown domains
    # are allowed; any unavailable image is handled as a visual fallback.
    # Build still rejects unsafe URLs and missing local image files above.
    assert (DIST / "assets/hof-inplace.js").is_file(), "Shared Hall of Fame popup script missing"
    for entry in main:
        public_page = (DIST / entry["file"]).read_text(encoding="utf-8")
        assert '/assets/hof-inplace.js' in public_page, "In-place HOF biographies not loaded: " + entry["file"]
    assert 'favorite:{type:\'page\',id:\'department-\'' in (DIST/"assets/site/js/departments.js").read_text(encoding="utf-8"), "Department detail popups lost favorites"
    assert "'page'" in (DIST/"assets/site/js/favorites.js").read_text(encoding="utf-8"), "Saved department favorites unsupported"
    # Catch malformed JavaScript before a browser receives it. Some builders
    # contain Python but no Node; in that case issue a diagnostic rather than
    # blocking a valid static site for a missing optional tool.
    node = which("node")
    if node:
        critical_scripts = (
            "assets/hof-inplace.js", "assets/news.js", "assets/home-news.js",
            "assets/site/js/biographies.js", "assets/site/js/components.js",
            "assets/site/js/archive-catalog.js", "assets/site/js/archive.js",
            "assets/site/js/departments.js", "assets/site/js/favorites.js",
            "assets/site/js/favorites-page.js", "assets/site/js/search.js",
        )
        for script_name in critical_scripts:
            candidate = DIST / script_name
            assert candidate.is_file(), "Missing JavaScript dependency: " + script_name
            check = subprocess.run([node, "--check", str(candidate)],
                                   capture_output=True, text=True, timeout=20)
            assert check.returncode == 0, "JavaScript syntax error in " + script_name + ": " + check.stderr[-1300:]
    else:
        print("[QA WARNING] Node.js not installed; JavaScript syntax preflight skipped")
    facility = next(a for a in museum_records if a["id"] == "egkatastaseis")
    for fact in ("30 Ιουνίου 1957", "Εξειδικευμένοι Χώροι Προπόνησης",
                 "Γεωργάκη Ολυμπίου 1"):
        assert fact in facility["html"], "Museum facilities history out of sync: " + fact
    assert ".facility-museum .fm-section" in (DIST/"assets/site/css/components.css").read_text(encoding="utf-8"), "Museum facilities styles not published"
    # News card, article and home-news links have no decorative arrows.
    for asset in (DIST / "news.html", DIST / "assets/news.js", DIST / "assets/home-news.js"):
        content = asset.read_text(encoding="utf-8")
        assert not any(arrow in content for arrow in ("↗", "➜", "→")), "News arrows unexpectedly restored: " + asset.name
    # News UX regression checks: all cards are links and no redundant buttons.
    news_js=(DIST / "assets/news.js").read_text(encoding="utf-8")
    home_js=(DIST / "assets/home-news.js").read_text(encoding="utf-8")
    news_css=(DIST / "assets/news.css").read_text(encoding="utf-8")
    assert "articleLink(x,'an-card-hit')" in news_js, "News cards lost their whole-card links"
    assert "articleLink(x,'an-feature-hit')" in news_js, "Featured news card lost its whole-card link"
    assert ".an-card-hit,.an-feature-hit" in news_css, "Whole-card news link styling missing"
    assert all(text not in news_js for text in ("Διάβασε περισσότερα", "Δες την είδηση")), "Redundant news card buttons restored"
    assert 'class="ahn-more"' in home_js and 'id="ahn-grid"' in home_js, "Homepage All News CTA missing"
    assert home_js.index('id="ahn-grid"') < home_js.index('class="ahn-more"'), "Homepage All News CTA not placed after the cards"
    assert "Διαβάστε την είδηση" not in home_js, "Redundant homepage card caption restored"
    # Eighteen regular cards per page PLUS one distinct featured card on page 1.
    # Filtering still applies before slicing and the featured story is not duplicated.
    assert "PAGE_SIZE=18" in news_js, "News pagination size changed"
    assert "x.id!==lead?.id" in news_js, "Highlighted article duplicated in the news grid"
    assert "const pageCount=Math.max(1,Math.ceil(items.length/PAGE_SIZE));" in news_js, "Featured news must be separate from eighteen regular cards"
    assert "const offset=(state.page-1)*PAGE_SIZE;" in news_js, "News pagination offset missing"
    assert "items.slice(offset,offset+PAGE_SIZE)" in news_js, "Expected eighteen regular news cards per page"
    assert "renderPagination(pageCount)" in news_js, "News page-number links not rendered"
    assert "window.addEventListener('popstate'" in news_js, "News page history navigation missing"
    assert 'id="an-pagination"' in (DIST/"news.html").read_text(encoding="utf-8"), "News pagination nav missing"
    assert ".an-pagination[hidden]" in news_css and ".an-page-link" in news_css, "News pagination styles missing"
    # News media contract: never publish a photo URL that points to a missing
    # or invalid asset; and protect the modal against the former detached-image bug.
    media_js = (DIST / "assets/news.js").read_text(encoding="utf-8")
    assert "const fig=media(x,'an-cover')" in media_js, "News modal must mount its live image element"
    assert "const fig=document.createElement('figure')" not in media_js, "Detached news cover figure regression"
    assert "img.src=original?path:'/'+path" in media_js, "News images must support absolute original URLs and local archives"
    assert "an-cover" in media_js and "an-feature-media" in media_js
    assert "art.src=handball?" in media_js, "News fallback must distinguish handball from other sports"
    assert (DIST/"archelaos-welcome.png").is_file(), "Missing general club editorial fallback"
    assert (DIST/"images/archelaos-news-handball.svg").is_file(), "Missing handball editorial fallback"
    for article in news["items"]:
        path = article.get("image", "")
        if not path or path == "assets/archelaos-crest.png" or path.startswith("https://"):
            # Allowed HTTPS article sources were checked against a fixed host allowlist above.
            continue
        local = DIST / path
        assert local.is_file(), "Missing published article photo: " + article["id"]
        start = local.read_bytes()[:16]
        valid = (start.startswith(bytes.fromhex("ffd8ff")) or
                 start.startswith(bytes.fromhex("89504e470d0a1a0a")) or
                 start.startswith(b"RIFF") and start[8:12] == b"WEBP")
        if not valid and local.suffix.lower() == ".svg":
            # Original, locally bundled editorial vector art is an image too.
            # Validate XML structure and a drawable SVG root rather than magic bytes.
            try:
                svg_root = ET.parse(local).getroot()
                valid = (svg_root.tag == "{http://www.w3.org/2000/svg}svg"
                         and bool(svg_root.get("viewBox")))
            except ET.ParseError:
                valid = False
        assert valid, "Unreadable article image format: " + article["id"]
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

    # The training calendar is a live subscription generated from the same
    # canonical public JSON used by the department popups (not a one-off ICS).
    from build_training_schedule import calendar as training_ical, validate as validate_training
    training_data = json.loads((ROOT / "rebuild/data/training-schedule.json").read_text(encoding="utf-8"))
    training_groups = validate_training(training_data)
    assert training_groups, "Missing canonical training schedule"
    assert (DIST/"assets/site/data/training-schedule.json").is_file(), "Training data not published"
    assert json.loads((DIST/"assets/site/data/training-schedule.json").read_text(encoding="utf-8")) == training_data
    feed_dir = DIST / "calendar/training"
    assert (feed_dir/"all.ics").read_bytes() == training_ical(training_data).encode("utf-8"), "All-sports training subscription out of sync"
    for key, department in training_groups.items():
        if department["sessions"]:
            assert (feed_dir/(key+".ics")).read_bytes() == training_ical(training_data,key).encode("utf-8"), "Department training subscription out of sync: "+key
    assert "webcal://archelaos.club/calendar/training/" in (DIST/"assets/site/js/departments.js").read_text(encoding="utf-8")
    assert "Content-Type: text/calendar" in headers, "Subscribed ICS content type not set"

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

    # Homepage slideshow buttons must lead to real department anchors.
    home_js = (DIST / "assets/site/js/home.js").read_text(encoding="utf-8")
    assert "titleLink.href='/tmimata.html#sport-'+sportKeys[index]" in home_js, "Slideshow uses a noncanonical department URL"
    sport_keys_match = re.search(r"const sportKeys=\[([^\]]+)\]", home_js)
    assert sport_keys_match, "Homepage slideshow sports configuration missing"
    departments_html = (DIST / "tmimata.html").read_text(encoding="utf-8")
    for sport_key in re.findall(r"'([^']+)'", sport_keys_match.group(1)):
        assert 'id="sport-' + sport_key + '"' in departments_html, "Missing slideshow target for " + sport_key
    # Search must expose the approved match calendar and department cards.
    catalog_js = (DIST / "assets/site/js/archive-catalog.js").read_text(encoding="utf-8")
    search_html = (DIST / "search.html").read_text(encoding="utf-8")
    for required in ("match-schedule", "department", "fixture", "owner_approved", "news.json", "news:'/news.html?article='"):
        assert required in catalog_js, "Search catalog missing " + required
    for category in ("department", "fixture", "news", "person", "interview"):
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

    # Interactive overlays, historical department names and contribution credit.
    # Second native modal must remain on the News page and return focus to the
    # open article rather than navigating the reader to Hall of Fame.
    deployed_news_html = (DIST / "news.html").read_text(encoding="utf-8")
    assert "/assets/site/js/biographies.js" in deployed_news_html, "News biography loader missing"
    assert "/assets/site/js/components.js" in deployed_news_html, "News native dialog component missing"
    assert "window.ArchelaosBio.open(a.dataset.personId)" in news_js, (
        "Hall of Fame links in News no longer open in place"
    )
    assert "aria-haspopup','dialog" in news_js, "News biography links lost dialog semantics"

    department_html = (DIST / "tmimata.html").read_text(encoding="utf-8")
    assert '<span class="dp-title">Στίβος</span>' in department_html
    assert '<span class="dp-title">Κολύμβηση</span>' in department_html
    assert 'data-dp-open="fin-swimming"' in department_html, (
        "Technical swimming no longer appears among historical departments"
    )
    department_data = json.loads((DIST / "assets/site/data/museum.json").read_text(encoding="utf-8"))
    assert any(a["id"] == "fin-swimming" for a in department_data["articles"]), (
        "Technical swimming historical source disappeared"
    )
    components_css = (DIST / "assets/site/css/components.css").read_text(encoding="utf-8")
    archive_js = (DIST / "assets/site/js/archive.js").read_text(encoding="utf-8")
    assert ".arch-presidents-table" in components_css, "Historical presidencies table not styled"
    assert "if(presidentsTable)node.classList.add('arch-presidents-table')" in archive_js, (
        "HTML sanitizer strips the historical table layout marker"
    )

    contact_html = (DIST / "contact.html").read_text(encoding="utf-8")
    contact_js = (DIST / "assets/site/js/contact.js").read_text(encoding="utf-8")
    contribution_js = (DIST / "assets/site/js/contribute-guide.js").read_text(encoding="utf-8")
    backend_js = (ROOT / "functions/api/contact.js").read_text(encoding="utf-8")
    assert 'id="ct-credit-consent"' in contact_html
    assert "creditChoice.hidden=!isContribution" in contact_js
    assert "payload.set('publicCreditName'" in contact_js
    assert "payload.set('publicNameConsent'" in contribution_js
    assert 'form.get("publicNameConsent") === "true"' in backend_js, (
        "Backend no longer records public-name consent"
    )

    print(f"RELEASE QA OK: {len(main)} core pages + {len(loc_people)} indexed profiles.")
    print("Canonicals, robots, structured data, two sitemaps, redirects and local paths verified.")


if __name__ == "__main__":
    verify()
