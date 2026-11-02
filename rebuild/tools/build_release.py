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

from html import escape, escape as html_escape, unescape as html_unescape
from hashlib import sha256
from pathlib import Path
from shutil import copy2, copytree, rmtree
from urllib.parse import urlparse
from xml.etree import ElementTree as ET
import json
import re

ROOT = Path(__file__).resolve().parents[2]
STAGE = ROOT / "rebuild"
OUTPUT = ROOT / "dist"
SITE = "https://www.archelaos.club"
IMAGE = f"{SITE}/social-preview.jpg"

METADATA = json.loads((STAGE / "seo" / "metadata.json").read_text(encoding="utf-8"))
assert METADATA["site_url"] == SITE, "Do not silently change canonical domain."

STATIC_ROOT = (
    "archelaos-logo-gold.png", "archelaos-logo-green.png",
    "archelaos-welcome.png", "social-preview.jpg",
    "favicon.ico", "favicon-180.png", "favicon-192.png", "favicon-512.png",
    "archelaos-history-events.json", "archelaos-person-index.json",
    "archelaos-person-links.js", "hall-of-fame-people.json",
    "interviews.json",  # Public interview archive; required by interviews.html
)
COMMON_FOLDERS = ("assets", "images")


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
                "email": "contact@archelaos.club",
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
    raw = raw.replace("/rebuild/images/", "/assets/site/images/")
    # Mobile and desktop share this page. Fingerprint department assets so
    # phones cannot keep stale CSS/JS after a successful Cloudflare deploy.
    if entry["file"] == "tmimata.html":
        for asset in ("css/departments.css", "js/departments.js", "css/viewports.css"):
            digest = sha256((OUTPUT / "assets/site" / asset).read_bytes()).hexdigest()[:12]
            asset_url = "/assets/site/" + asset
            raw = re.sub(
                r'(' + re.escape(asset_url) + r')(?:[?][^"\x27]*)?',
                lambda match, digest=digest: match.group(1) + "?v=" + digest,
                raw,
            )
    # Content-address the interview script on every release to defeat stale browser JS.
    if entry["file"] == "interviews.html":
        script_path = OUTPUT / "assets/site/js/interviews.js"
        fingerprint = sha256(script_path.read_bytes()).hexdigest()[:12]
        raw = re.sub(
            r'(/assets/site/js/interviews\.js)(?:\?[^"\x27]*)?',
            lambda match: match.group(1) + "?v=" + fingerprint,
            raw,
        )
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
    # One biography popup contract on every generated museum/search/department page.
    # The central HOF JSON remains the only source of biographical text.
    biography_script = '<script defer src="/assets/hof-inplace.js"></script>'
    if biography_script not in raw:
        if raw.count("</body>") != 1:
            raise ValueError(f"{entry['file']}: missing unique body close for HOF popup")
        raw = raw.replace("</body>", biography_script + "\n</body>", 1)
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
    # Publish the live news page and its JSON feed alongside the core museum pages.
    for filename in ("news.html", "news.json"):
        copy2(ROOT / filename, OUTPUT / filename)
    # Use the reviewed, full-format 682-profile source; the live root has a
    # different legacy HTML layout and must not be overwritten to build dist.
    copytree(STAGE / "source-profiles", OUTPUT / "people")
    # Keep the 682 rich archival pages and publish every additional canonical
    # Hall of Fame profile from the root master, including new youth athletes.
    current_master = json.loads((ROOT / "hall-of-fame-people.json").read_text(encoding="utf-8"))
    current_master_ids = {person["id"] for person in current_master["people"]}
    for person_id in sorted(current_master_ids):
        target = OUTPUT / "people" / (person_id + ".html")
        if target.exists():
            continue
        source = ROOT / "people" / (person_id + ".html")
        if not source.is_file():
            raise FileNotFoundError("Missing canonical Hall profile: " + person_id)
        copy2(source, target)
    for name in ("css", "js", "data"):
        copytree(STAGE / name, OUTPUT / "assets" / "site" / name)
    # Rewrite preview-only asset URLs in the generated JavaScript copies.
    # Staged preview files remain untouched; production QA rejects any missed URL.
    for script_path in (OUTPUT / "assets" / "site" / "js").rglob("*.js"):
        script = script_path.read_text(encoding="utf-8")
        for folder in ("data", "js", "css", "images"):
            script = script.replace(f"/rebuild/{folder}/", f"/assets/site/{folder}/")
        # The preview path prefix may also occur in pathname checks, not just asset URLs.
        # In dist these checks are unnecessary because the release is never served under /rebuild/.
        script = script.replace("/rebuild/", "/assets/site/")
        script_path.write_text(script, encoding="utf-8")
    copytree(STAGE / "images", OUTPUT / "assets" / "site" / "images")
    # The old public JSON endpoint must reflect exactly the same edited people
    # as the new Hall of Fame; otherwise stale corrections remain discoverable.
    copy2(STAGE / "data" / "people.json", OUTPUT / "hall-of-fame-people.json")
    # Only independently approved, conflict-free relations may enter public data.
    # Never copy research source, review queue or owner-only information to dist.
    from build_event_graph import compile_graph
    event_research = json.loads((STAGE / "research" / "historical-events.json").read_text(encoding="utf-8"))
    owner_graph = compile_graph(event_research,
        json.loads((STAGE / "data" / "people.json").read_text(encoding="utf-8"))["people"])
    editorially_approved = sum(e.get("editorial_status") == "approved"
                              for e in event_research["events"])
    if len(owner_graph["events"]) != editorially_approved:
        raise ValueError("An approved event is still blocked by identity or historical review")
    (OUTPUT / "assets" / "site" / "data" / "approved-event-graph.json").write_text(
        js_data(owner_graph) + "\n", encoding="utf-8")
    # Keep all 682 historic profile URLs/Person metadata, but replace the old
    # per-profile navbar/footer with the shared site-wide shell in the generated release.
    # Source backup profiles remain completely untouched.
    profiles = sorted((OUTPUT / "people").glob("arch-*.html"))
    # Never overwrite the richer legacy biography with the sometimes shorter
    # central index summary. Append ONLY newly verified paragraphs to each language.
    verified_addenda = json.loads((STAGE / "data" / "people-addenda.json").read_text(encoding="utf-8"))["entries"]
    all_ids = {p.stem for p in profiles}
    if set(verified_addenda) - all_ids:
        raise ValueError("Biographical additions reference missing canonical profile IDs")

    def include_addenda(source: str, additions: list[dict], language: str, profile_id: str) -> str:
        if not additions:
            return source
        # A single scoped legacy biography section, no replacement of historical facts.
        regex = (r'(<section\b[^>]*data-profile-language="' + language
                 + r'"[^>]*>.*?<div class="bio">)(.*?)(</div>)')
        def expand(match):
            paragraphs = [html_escape(row[language]) for row in additions]
            bibliography = " · ".join(dict.fromkeys(
                html_escape(row["source_label"]) for row in additions
            ))
            # pre-line renders double newlines as actual paragraph breaks.
            return (match.group(1) + match.group(2)
                    + "\n\n" + "\n\n".join(paragraphs)
                    + match.group(3)
                    + '<p class="profile-addenda-source">'
                    + ("Πηγές" if language == "el" else "Sources")
                    + ": " + bibliography + "</p>")
        updated, count = re.subn(regex, expand, source, count=1, flags=re.S)
        if count != 1:
            raise ValueError("Cannot locate " + language + " biography in " + profile_id)
        return updated


    # An edited canonical biography must also appear in its standalone profile.
    # Only update the old bio when it is the EXACT original index text; leave a
    # richer independent profile untouched rather than risking deletion.
    former_people = {p["id"]: p for p in json.loads(
        (ROOT / "hall-of-fame-people.json").read_text(encoding="utf-8"))["people"]}
    revised_people = {p["id"]: p for p in json.loads(
        (STAGE / "data" / "people.json").read_text(encoding="utf-8"))["people"]}

    def sync_edited_bio(source: str, person_id: str, lang: str) -> str:
        key = "bio" if lang == "el" else "bio_en"
        if person_id not in former_people or person_id not in revised_people:
            return source
        before = former_people[person_id].get(key, "")
        after = revised_people[person_id].get(key, "")
        if before == after:
            return source
        regex = (r'(<section\b[^>]*data-profile-language="' + lang +
                 r'"[^>]*>.*?<div class="bio">)(.*?)(</div>)')
        match = re.search(regex, source, flags=re.S)
        if not match:
            raise ValueError("Missing biography section: " + person_id + "/" + lang)
        normal = lambda value: re.sub(r"\s+", " ", value).strip()
        if normal(html_unescape(match.group(2))) != normal(before):
            # Preserve the long-form archival page if it contains richer prose.
            # Canonical Hall of Fame popup still shows the revised biography.
            return source
        return (source[:match.start(2)] + html_escape(after, quote=False)
                + source[match.end(2):])

    # Public news is linked to the same canonical person IDs used by the Hall modal.
    news_items = json.loads((ROOT / "news.json").read_text(encoding="utf-8"))["items"]
    canonical_people = {p["id"]: p for p in current_master["people"]}
    swimming_2026_id = "swimming-national-17-athletes-106-points-aug-2026"
    swimming_2026 = next((item for item in news_items if item["id"] == swimming_2026_id), None)

    for profile in profiles:
        html_text = profile.read_text(encoding="utf-8")
        # The public apex redirects to www. Generated profile metadata must
        # use the same canonical host as the 14 core pages and sitemap.
        # Original archival HTML in source-profiles remains untouched.
        html_text = html_text.replace("https://archelaos.club/", SITE + "/")
        # Standalone profiles have a legacy header and footer in their HTML.
        # Keep the entire biographical article, but avoid two headers/footers
        # when the shared shell injects the site-wide components at runtime.
        html_text, old_header = re.subn(
            r'(<body\b[^>]*>)\s*<header\b[^>]*>.*?</header>', r'\1',
            html_text, count=1, flags=re.I|re.S)
        html_text, old_footer = re.subn(
            r'</main>\s*<footer\b[^>]*>.*?</footer>', '</main>',
            html_text, count=1, flags=re.I|re.S)
        if old_header != old_footer:
            raise ValueError('Unpaired legacy profile header/footer: ' + profile.name)
        for lang in ("el", "en"):
            html_text = sync_edited_bio(html_text, profile.stem, lang)
        # Avoid leaving obsolete editorial correction text in Person JSON-LD
        # and social metadata after the visible Greek biography is cleaned.
        before = former_people.get(profile.stem, {}).get("bio", "")
        after = revised_people.get(profile.stem, {}).get("bio", "")
        if profile.stem in revised_people and before != after:
            def adjust_person_schema(match):
                try:
                    schema = json.loads(match.group(2))
                except (TypeError, ValueError):
                    return match.group(0)
                if schema.get("@type") != "Person":
                    return match.group(0)
                if re.sub(r"\s+", " ", schema.get("description", "")).strip() == re.sub(r"\s+", " ", before).strip():
                    schema["description"] = after
                return match.group(1) + js_data(schema) + match.group(3)

            html_text = re.sub(
                r'(<script type="application/ld\+json">)(.*?)(</script>)',
                adjust_person_schema, html_text, count=1, flags=re.S)
            brief = html_escape(re.sub(r"\s+", " ", after).strip()[:160], quote=True)
            for attr in ('name="description"', 'property="og:description"'):
                html_text = re.sub(
                    r'(<meta ' + attr + r' content=")[^"]*(">)',
                    lambda match: match.group(1) + brief + match.group(2),
                    html_text, count=1)
        for lang in ("el", "en"):
            html_text = include_addenda(html_text, verified_addenda.get(profile.stem, []), lang, profile.stem)
        # Preserve richer archival biographies while including the latest sourced
        # 2026 swimming result in the eight pre-existing public profile pages.
        if (swimming_2026 and profile.stem in swimming_2026.get("personIds", [])
                and profile.stem in revised_people):
            person = canonical_people[profile.stem]
            for lang, key in (("el", "bio"), ("en", "bio_en")):
                fact = person.get(key, "").split("\n\n")[-1]
                if "2026" not in fact:
                    continue
                section = (r'(<section\b[^>]*data-profile-language="' + lang
                           + r'"[^>]*>.*?<div class="bio">)(.*?)(</div>)')
                def add_fact(match):
                    if html_escape(fact, quote=False) in match.group(2):
                        return match.group(0)
                    return match.group(1) + match.group(2) + "\n\n" + html_escape(fact, quote=False) + match.group(3)
                html_text, added = re.subn(section, add_fact, html_text, count=1, flags=re.S)
                if added != 1:
                    raise ValueError("Cannot add verified 2026 swimming result: " + profile.stem)
        # Standalone biographies, like the Hall popup, link directly to the
        # one canonical news article per event rather than to the news landing page.
        linked = sorted(
            (item for item in news_items
             if profile.stem in item.get("personIds", []) and not item.get("unverified")),
            key=lambda item: item.get("date", ""), reverse=True
        )[:8]
        if linked:
            links = '<section class="profile-related-news"><h2>Σχετικές ειδήσεις</h2><ul>' + ''.join(
                '<li><a href="/news.html?article=' + html_escape(item["id"], quote=True) + '">' +
                html_escape(item["title"]) + '</a></li>' for item in linked
            ) + '</ul></section>'
            marker = next((m for m in ('<div class="profile-actions">', '</article>', '</main>') if m in html_text), None)
            if marker:
                html_text = html_text.replace(marker, links + marker, 1)
        for old in ("/assets/navigation.css", "/assets/footer.css", "/assets/accessibility.css"):
            html_text = html_text.replace(f'<link rel="stylesheet" href="{old}">', "")
        for old in ("/assets/navigation.js", "/assets/footer.js", "/assets/accessibility.js"):
            html_text = html_text.replace(f'<script src="{old}" defer></script>', "")
        # Old per-event fragments no longer exist after removal of history-events.
        # Route to 70 Moments without leaving a dead or misleading fragment.
        html_text = re.sub(r'href="/history-events\.html(?:#[^"]*)?"', 'href="/70-stigmes.html"', html_text)
        additions = [
            '<link rel="stylesheet" href="/assets/site/css/tokens.css">',
            '<link rel="stylesheet" href="/assets/site/css/components.css">',
            '<link rel="stylesheet" href="/assets/site/css/collection.css">',
            '<link rel="stylesheet" href="/assets/site/css/profile-release.css">',
            '<link rel="stylesheet" href="/assets/site/css/viewports.css">',
            '<link rel="stylesheet" href="/assets/site/css/motion.css">',
            '<script defer src="/assets/site/js/shell.js"></script>',
            '<script defer src="/assets/site/js/favorites.js"></script>',
            '<script defer src="/assets/site/js/profile-favorite.js"></script>',
            '<script defer src="/assets/site/js/motion.js"></script>',
        ]
        if html_text.count("</head>") != 1:
            raise ValueError("Invalid historical profile head: " + profile.name)
        html_text = html_text.replace("</head>", "\n".join(additions) + "\n</head>")
        profile.write_text(html_text, encoding="utf-8")

    # The published JavaScript refers to the new organized data folder.
    for script in (OUTPUT / "assets" / "site" / "js").glob("*.js"):
        src = script.read_text(encoding="utf-8")
        src = src.replace("/rebuild/data/", "/assets/site/data/")
        script.write_text(src, encoding="utf-8")

    # Fingerprint CSS imports. A new mobile.css must invalidate viewports.css,
    # otherwise phones can keep stale imported CSS even when the parent changes.
    viewport_css = OUTPUT / "assets/site/css/viewports.css"
    viewport_text = viewport_css.read_text(encoding="utf-8")
    for child in ("mobile", "tablet", "laptop", "desktop", "accessibility"):
        child_path = OUTPUT / "assets/site/css" / (child + ".css")
        fingerprint = sha256(child_path.read_bytes()).hexdigest()[:12]
        needle = 'url("./' + child + '.css")'
        if needle not in viewport_text:
            raise ValueError("Responsive stylesheet import missing: " + child)
        viewport_text = viewport_text.replace(
            needle, 'url("./' + child + '.css?v=' + fingerprint + '")'
        )
    viewport_css.write_text(viewport_text, encoding="utf-8")

    # Keep public Hall SEO counts in sync with the reviewed master on every build.
    # Historic standalone biography pages (682) are a separate archive.
    people_source = json.loads((ROOT / "hall-of-fame-people.json").read_text(encoding="utf-8"))
    hall_total = len(people_source["people"])
    if people_source.get("count") != hall_total:
        raise RuntimeError("Hall of Fame master data count mismatch")
    pages = METADATA["pages"]
    hall_page = next((entry for entry in pages if entry["file"] == "hall-of-fame.html"), None)
    if hall_page is None:
        raise RuntimeError("Hall of Fame SEO metadata missing")
    for key, marker in (("title", " Πρόσωπα του Αρχέλαου"), ("description", " πρόσωπα του Γ.Α.Σ.")):
        new_value, replacements = re.subn(
            r"\b[0-9]+(?=" + re.escape(marker) + r")",
            str(hall_total),
            hall_page[key],
            count=1,
        )
        if replacements != 1:
            raise RuntimeError("Hall of Fame SEO total not found: " + key)
        hall_page[key] = new_value
    for entry in pages:
        create_page(entry)
    profile_files = sorted((OUTPUT / "people").glob("*.html"))
    if len(profile_files) != len(current_master_ids):
        raise RuntimeError(f"Expected {len(current_master_ids)} standalone profiles; found {len(profile_files)}")
    expected = {person_id + ".html" for person_id in current_master_ids}
    actual = {path.name for path in profile_files}
    if expected != actual:
        raise RuntimeError(f"Profile file mismatch: missing={len(expected-actual)} extra={len(actual-expected)}")
    # The Hall listing and biography modal must use the current reviewed master file,
    # not the older 682-person profile snapshot used for standalone archive pages.
    master_people = json.loads((ROOT / "hall-of-fame-people.json").read_text(encoding="utf-8"))
    if master_people.get("count") != len(master_people.get("people", [])):
        raise RuntimeError("Hall of Fame master data count mismatch")
    copy2(ROOT / "hall-of-fame-people.json", OUTPUT / "assets" / "site" / "data" / "people.json")
    copy2(ROOT / "hall-of-fame-people.json", OUTPUT / "hall-of-fame-people.json")
    # Render the public Hall of Fame count in the HTML before JavaScript runs.
    # Avoid a flash of the old archive total on refresh and in crawlers.
    homepage = OUTPUT / "index.html"
    home_html = homepage.read_text(encoding="utf-8")
    home_html, count_matches = re.subn(
        r'(<span id="new-people-total">)\d+(</span>)',
        lambda match: match.group(1) + str(len(master_people["people"])) + match.group(2),
        home_html,
    )
    if count_matches != 1:
        raise RuntimeError("Expected one homepage Hall of Fame count")
    homepage.write_text(home_html, encoding="utf-8")


    from build_match_schedule import calendar as make_ical, validate as validate_matches
    match_data = json.loads((STAGE / "data" / "match-schedule.json").read_text(encoding="utf-8"))
    validate_matches(match_data)
    (OUTPUT / "calendar.ics").write_bytes(make_ical(match_data).encode("utf-8"))
    # Dedicated, stable URLs for adding JUST one approved match to a personal calendar.
    individual = OUTPUT / "calendar" / "events"
    individual.mkdir(parents=True, exist_ok=True)
    for fixture in validate_matches(match_data):
        item = {**match_data, "matches": [fixture]}
        (individual / (fixture["id"] + ".ics")).write_bytes(make_ical(item).encode("utf-8"))
    # Regenerate stable subscription URLs from the SAME weekly training JSON
    # that sports popups use. Subscribed users receive future published changes
    # on their calendar app's refresh schedule.
    from build_training_schedule import calendar as training_ical, validate as validate_training
    training_data = json.loads((STAGE / "data" / "training-schedule.json").read_text(encoding="utf-8"))
    training_groups = validate_training(training_data)
    training_dir = OUTPUT / "calendar" / "training"
    training_dir.mkdir(parents=True, exist_ok=True)
    (training_dir / "all.ics").write_bytes(training_ical(training_data).encode("utf-8"))
    for key, details in training_groups.items():
        if details["sessions"]:
            (training_dir / (key + ".ics")).write_bytes(training_ical(training_data, key).encode("utf-8"))
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
        "User-agent: *\nAllow: /\nSitemap: " + SITE + "/sitemap.xml\n",
        encoding="utf-8"
    )
    copy2(ROOT / "_redirects", OUTPUT / "_redirects")
    (OUTPUT / "_headers").write_text(
        "/*\n  X-Content-Type-Options: nosniff\n"
        "  X-Frame-Options: DENY\n"
        "  Referrer-Policy: strict-origin-when-cross-origin\n"
        "  Permissions-Policy: camera=(), microphone=(), geolocation=()\n"
        "\n/assets/site/*\n  Cache-Control: public, max-age=0, must-revalidate\n"
        "\n/*.html\n  Cache-Control: no-cache, max-age=0, must-revalidate\n"
        "\n/assets/site/js/*\n  Cache-Control: no-cache, max-age=0, must-revalidate\n"
        "\n/assets/site/data/*\n  Cache-Control: no-store\n"
        "\n/assets/news.js\n  Cache-Control: no-store\n"
        "\n/assets/news.css\n  Cache-Control: no-store\n"
        "\n/assets/home-news.js\n  Cache-Control: no-store\n"
        "\n/assets/home-news.css\n  Cache-Control: no-store\n"
        "\n/news.json\n  Cache-Control: no-store\n"
        "\n/hall-of-fame-people.json\n  Cache-Control: no-store\n"
        "\n/images/*\n  Cache-Control: public, max-age=604800\n"
        "\n/calendar.ics\n  Cache-Control: public, max-age=0, must-revalidate\n"
        "\n/calendar/training/*\n  Content-Type: text/calendar; charset=utf-8\n  Cache-Control: no-store, max-age=0\n",
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
    # Error routes receive the same navigation, accessibility controls,
    # scroll-to-top and footer as the 13 principal pages and 682 profiles.
    (OUTPUT / "404.html").write_text(
        '<!doctype html><html lang="el"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<meta name="robots" content="noindex">'
        '<title>404 · Η σελίδα δεν βρέθηκε | Αρχέλαος</title>'
        '<link rel="stylesheet" href="/assets/site/css/tokens.css">'
        '<link rel="stylesheet" href="/assets/site/css/components.css">'
        '<link rel="stylesheet" href="/assets/site/css/viewports.css">'
        '<script defer src="/assets/site/js/shell.js"></script>'
        '<script defer src="/assets/site/js/favorites.js"></script>'
        '</head><body>'
        '<main id="main-content" style="max-width:680px;min-height:58vh;padding:10vh 24px;margin:auto">'
        '<p style="color:#8c6c31">Γ.Α.Σ. «Ο ΑΡΧΕΛΑΟΣ»</p>'
        '<h1 style="font:72px Georgia,serif;margin:16px 0">404</h1>'
        '<p>Η σελίδα που αναζητάτε δεν βρέθηκε.</p>'
        '<p><a href="/" style="color:#073d2a">Επιστροφή στην αρχική ↗</a></p>'
        '</main></body></html>', encoding="utf-8"
    )
    # Fingerprint every generated HTML reference to our shared CSS and JS,
    # including all 682 people profiles and the 404 page. This prevents a split
    # between cached mobile styles and fresh desktop HTML after deployment.
    static_ref = re.compile(
        r'(?P<quote>["\x27])(?P<asset>/assets/site/(?:css|js)/'
        r'[A-Za-z0-9._/-]+\.(?:css|js))(?:[?][^"\x27]*)?(?P=quote)'
    )
    fingerprints = {}
    for page in OUTPUT.rglob("*.html"):
        source = page.read_text(encoding="utf-8")
        def rewrite_static_ref(match):
            asset = match.group("asset")
            if asset not in fingerprints:
                local = OUTPUT / asset.lstrip("/")
                if not local.is_file():
                    raise FileNotFoundError("Missing linked static asset: " + asset)
                fingerprints[asset] = sha256(local.read_bytes()).hexdigest()[:12]
            quote = match.group("quote")
            return quote + asset + "?v=" + fingerprints[asset] + quote
        updated = static_ref.sub(rewrite_static_ref, source)
        if updated != source:
            page.write_text(updated, encoding="utf-8")

    print(f"BUILD OK: {len(pages)} principal pages, {len(profile_files)} profiles, "
          "two sitemaps, a sitemap index, robots.txt and preserved redirects.")
    print("Output: dist/ — not deployed. Production root was not modified.")


if __name__ == "__main__":
    make_release()
    # Cloudflare runs this build script; do not leave a publishable dist on QA failure.
    try:
        from verify_release import verify
        verify()
    except Exception:
        if OUTPUT.exists():
            rmtree(OUTPUT)
        raise
