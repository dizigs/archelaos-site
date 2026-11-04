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

from html import escape, escape as html_escape
from hashlib import sha256
from pathlib import Path
from shutil import copy2, copytree, rmtree
from urllib.parse import urlparse
from xml.etree import ElementTree as ET
import json
import re

from hof_biography import correct_name, include_addenda, normalized, ensure_biography_sections, sync_biography

ROOT = Path(__file__).resolve().parents[2]
STAGE = ROOT / "rebuild"
OUTPUT = ROOT / "dist"
SITE = "https://www.archelaos.club"
IMAGE = f"{SITE}/social-preview.jpg"
# Four explicit club-reviewed editorial corrections. The independent source
# files remain unchanged for historical provenance and private fact-check.
PUBLIC_EDITORIAL_CORRECTION_IDS = frozenset({
    "arch-3fe6e9ae9b29",
    "arch-af9470c5745f",
    "arch-999730e06982",
    "arch-f6152b60c43f",
})

METADATA = json.loads((STAGE / "seo" / "metadata.json").read_text(encoding="utf-8"))
assert METADATA["site_url"] == SITE, "Do not silently change canonical domain."

STATIC_ROOT = (
    "archelaos-logo-gold.png", "archelaos-logo-green.png",
    "archelaos-welcome.png", "social-preview.jpg",
    "favicon.ico", "favicon-180.png", "favicon-192.png", "favicon-512.png",
    "archelaos-history-events.json", "archelaos-person-index.json",
    "archelaos-person-links.js", "hall-of-fame-people.json",
    "hall-of-fame-person-aliases.json",
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
    link_style = '<link rel="stylesheet" href="/assets/archive-links.css">'
    if link_style not in raw:
        raw = raw.replace("</head>", link_style + "\n</head>", 1)
    # One biography popup contract on every generated museum/search/department page.
    # The central HOF JSON remains the only source of biographical text.
    # Shared related-content script is generated on every museum route.
    # News is copied verbatim from root news.html and includes it directly.
    related_script = '<script defer src="/assets/archive-links.js"></script>'
    if related_script not in raw:
        raw = raw.replace("</body>", related_script + "\n</body>", 1)
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
    # Use the reviewed, full-format historical template source; the live root has a
    # different legacy HTML layout and must not be overwritten to build dist.
    copytree(STAGE / "source-profiles", OUTPUT / "people")
    # Keep the rich archival template pages and publish every additional canonical
    # Hall of Fame profile from the root master, including new youth athletes.
    current_master = json.loads((ROOT / "hall-of-fame-people.json").read_text(encoding="utf-8"))
    canonical_people = {person["id"]: person for person in current_master["people"]}
    current_master_ids = set(canonical_people)
    aliases = json.loads((ROOT / "hall-of-fame-person-aliases.json").read_text(encoding="utf-8"))["aliases"]
    if (set(aliases) & current_master_ids) or not set(aliases.values()).issubset(current_master_ids):
        raise ValueError("Hall aliases point to missing canonical IDs or preserve retired IDs")
    # Retired HTML stays in repository history but never becomes a duplicate public page.
    for retired_id in aliases:
        (OUTPUT / "people" / (retired_id + ".html")).unlink(missing_ok=True)
    for person_id in sorted(current_master_ids):
        target = OUTPUT / "people" / (person_id + ".html")
        if target.exists():
            continue
        source = ROOT / "people" / (person_id + ".html")
        if not source.is_file():
            raise FileNotFoundError("Missing canonical Hall profile: " + person_id)
        target.write_text(ensure_biography_sections(source.read_text(encoding="utf-8"),
                                              canonical_people[person_id].get("bio_en", ""),
                                              profile_id=person_id), encoding="utf-8")
    for name in ("css", "js", "data"):
        copytree(STAGE / name, OUTPUT / "assets" / "site" / name)
    # Publish the reviewed text in the legacy public asset copy as well.
    # The source snapshot remains unchanged in Git.
    archive_copy = OUTPUT / "assets/site/data/people.json"
    archive_document = json.loads(archive_copy.read_text(encoding="utf-8"))
    patched_ids = set()
    for person in archive_document["people"]:
        if person["id"] in PUBLIC_EDITORIAL_CORRECTION_IDS:
            canonical = canonical_people[person["id"]]
            for field in ("bio", "bio_en"):
                person[field] = canonical.get(field, "")
            patched_ids.add(person["id"])
    if patched_ids != PUBLIC_EDITORIAL_CORRECTION_IDS:
        raise ValueError("Editorial correction references missing archival profile")
    archive_copy.write_text(json.dumps(archive_document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
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
    # Always derive the public Hall feed from the canonical root master.
    # The staged archive is a legacy profile source, never a production feed.
    copy2(ROOT / "hall-of-fame-people.json", OUTPUT / "hall-of-fame-people.json")
    # Only independently approved, conflict-free relations may enter public data.
    # Never copy research source, review queue or owner-only information to dist.
    from build_event_graph import compile_graph
    event_research = json.loads((STAGE / "research" / "historical-events.json").read_text(encoding="utf-8"))
    # Use the same complete identity set for the event graph and public Hall.
    # Otherwise added athletes disappear from graph relations while remaining
    # visible in Hall modals and standalone profile pages.
    owner_graph = compile_graph(event_research, current_master["people"])
    editorially_approved = sum(e.get("editorial_status") == "approved"
                              for e in event_research["events"])
    if len(owner_graph["events"]) != editorially_approved:
        raise ValueError("An approved event is still blocked by identity or historical review")
    (OUTPUT / "assets" / "site" / "data" / "approved-event-graph.json").write_text(
        js_data(owner_graph) + "\n", encoding="utf-8")
    # One public, reciprocal graph across news, biographies, stories, Voices,
    # moments, departments and archived event identities. Do not ship Drive
    # originals, unapproved research queues or inferred person matches.
    from build_archive_relationships import generate as generate_archive_links
    link_graph = generate_archive_links()
    (OUTPUT / "assets" / "site" / "data" / "archive-relationships.json").write_text(
        js_data(link_graph) + "\n", encoding="utf-8")
    # Keep all historical profile URLs/Person metadata, but replace the old
    # per-profile navbar/footer with the shared site-wide shell in the generated release.
    # Source backup profiles remain completely untouched.
    profiles = sorted((OUTPUT / "people").glob("arch-*.html"))
    # Never overwrite the richer legacy biography with the sometimes shorter
    # central index summary. Append ONLY newly verified paragraphs to each language.
    verified_addenda = json.loads((STAGE / "data" / "people-addenda.json").read_text(encoding="utf-8"))["entries"]
    all_ids = {p.stem for p in profiles}
    if set(verified_addenda) - all_ids:
        raise ValueError("Biographical additions reference missing canonical profile IDs")

    # Root data is authoritative. Independent archival prose is preserved unless
    # it is literally contained in the newer canonical biography (Issue #57).
    archival_by_id = {p["id"]: p for p in json.loads(
        (STAGE / "data" / "people.json").read_text(encoding="utf-8"))["people"]}

    # Public news is linked to the same canonical person IDs used by the Hall modal.
    news_items = json.loads((ROOT / "news.json").read_text(encoding="utf-8"))["items"]
    swimming_2026_id = "swimming-national-17-athletes-106-points-aug-2026"
    swimming_2026 = next((item for item in news_items if item["id"] == swimming_2026_id), None)

    for profile in profiles:
        html_text = correct_name(profile.read_text(encoding="utf-8"))
        # The public apex redirects to www. Generated profile metadata must
        # use the same canonical host as the 14 core pages and sitemap.
        # Original archival HTML in source-profiles remains untouched.
        html_text = html_text.replace("https://archelaos.club/", SITE + "/")
        # Apply the shared profile shell to historical and newly added biographies.
        def mark_person_page(match):
            attrs = match.group(1)
            classes = re.search(r'\bclass=(["\x27])(.*?)\1', attrs, flags=re.I|re.S)
            if classes:
                values = classes.group(2).split()
                if "person-page" not in values:
                    values.append("person-page")
                attrs = attrs[:classes.start()] + 'class="' + " ".join(values) + '"' + attrs[classes.end():]
            else:
                attrs += ' class="person-page"'
            return "<body" + attrs + ">"
        html_text, body_count = re.subn(r'<body([^>]*)>', mark_person_page, html_text, count=1, flags=re.I)
        if body_count != 1:
            raise ValueError("Missing profile body: " + profile.name)

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
            canonical_bio = canonical_people[profile.stem].get("bio" if lang == "el" else "bio_en", "")
            if profile.stem in PUBLIC_EDITORIAL_CORRECTION_IDS:
                # Explicit public correction replaces an obsolete legacy
                # assertion, without altering the independently archived HTML.
                section = (r'(<section\b[^>]*data-profile-language="' + lang
                           + r'"[^>]*>.*?<div class="bio">)(.*?)(</div>)')
                html_text, changed = re.subn(
                    section,
                    lambda match: match.group(1) + html_escape(canonical_bio) + match.group(3),
                    html_text, count=1, flags=re.S)
                if changed != 1:
                    raise ValueError("Missing reviewed biography: " + profile.stem + "/" + lang)
            else:
                html_text = sync_biography(html_text, canonical_bio, lang, profile_id=profile.stem)
        # Avoid leaving obsolete editorial correction text in Person JSON-LD
        # and social metadata after the visible Greek biography is cleaned.
        before = archival_by_id.get(profile.stem, {}).get("bio", "")
        after = canonical_people.get(profile.stem, {}).get("bio", "")
        if (profile.stem in PUBLIC_EDITORIAL_CORRECTION_IDS
                or (before and before != after and normalized(before) in normalized(after))):
            def adjust_person_schema(match):
                try:
                    schema = json.loads(match.group(2))
                except (TypeError, ValueError):
                    return match.group(0)
                if schema.get("@type") != "Person":
                    return match.group(0)
                if (profile.stem in PUBLIC_EDITORIAL_CORRECTION_IDS or
                        re.sub(r"\s+", " ", schema.get("description", "")).strip() == re.sub(r"\s+", " ", before).strip()):
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
                and profile.stem in archival_by_id):
            person = canonical_people[profile.stem]
            for lang, key in (("el", "bio"), ("en", "bio_en")):
                fact = person.get(key, "").split("\n\n")[-1]
                if "2026" not in fact:
                    continue
                section = (r'(<section\b[^>]*data-profile-language="' + lang
                           + r'"[^>]*>.*?<div class="bio">)(.*?)(</div>)')
                def add_fact(match):
                    if normalized(fact) in normalized(match.group(2)):
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
            '<link rel="stylesheet" href="/assets/site/css/support-footer.css">',
            '<link rel="stylesheet" href="/assets/site/css/viewports.css">',
            '<link rel="stylesheet" href="/assets/site/css/motion.css">',
            '<script defer src="/assets/site/js/shell.js"></script>',
            '<script defer src="/assets/site/js/support-footer.js"></script>',
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
    # Historic staged standalone biography templates are a separate archive.
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
    # not the legacy template snapshot used for historical standalone pages.
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
        r'(<span id="new-people-total">)[^<]+(</span>)',
        lambda match: match.group(1) + str(len(master_people["people"])) + match.group(2),
        home_html,
    )
    if count_matches != 1:
        raise RuntimeError("Expected one homepage Hall of Fame count")
    homepage.write_text(home_html, encoding="utf-8")
    # The visible Hall hero must also be accurate before its dynamic JS loads.
    hall_html_file = OUTPUT / "hall-of-fame.html"
    hall_html = hall_html_file.read_text(encoding="utf-8")
    hall_html, hall_matches = re.subn(
        r'(<strong id="hall-total">)[^<]*(</strong>)',
        lambda match: match.group(1) + str(hall_total) + match.group(2),
        hall_html,
    )
    if hall_matches != 1:
        raise RuntimeError("Expected one Hall hero count placeholder")
    hall_html_file.write_text(hall_html, encoding="utf-8")


    # Preserve approved match/training source records for archive and sports
    # information, but do NOT generate public iCalendar exports/subscriptions.
    from build_match_schedule import validate as validate_matches
    from build_training_schedule import validate as validate_training
    validate_matches(json.loads((STAGE / "data" / "match-schedule.json").read_text(encoding="utf-8")))
    validate_training(json.loads((STAGE / "data" / "training-schedule.json").read_text(encoding="utf-8")))
    # Create one canonical URL for every reviewed historic timeline event.
    from build_event_pages import render as build_event_pages
    event_paths = build_event_pages(ROOT, OUTPUT)
    (OUTPUT / "sitemaps").mkdir()
    (OUTPUT / "sitemaps" / "pages.xml").write_text(
        sitemap_xml([entry["path"] for entry in pages if entry.get("indexable", True)]), encoding="utf-8"
    )
    (OUTPUT / "sitemaps" / "people.xml").write_text(
        sitemap_xml(["/people/" + file.name for file in profile_files]), encoding="utf-8"
    )
    (OUTPUT / "sitemaps" / "events.xml").write_text(
        sitemap_xml(event_paths), encoding="utf-8"
    )
    (OUTPUT / "sitemap.xml").write_text(
        sitemap_index(["pages.xml", "people.xml", "events.xml"]), encoding="utf-8"
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
    # Error routes receive the same navigation, accessibility controls,
    # scroll-to-top and footer as the principal pages and all canonical profiles.
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
    # including all canonical people profiles and the 404 page. This prevents a split
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
