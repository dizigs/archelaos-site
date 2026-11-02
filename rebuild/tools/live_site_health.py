#!/usr/bin/env python3
"""Read-only live deployment monitor. Standard library only; no credentials or writes to site."""
from __future__ import annotations
import argparse
from hashlib import sha256
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from xml.etree import ElementTree as ET

PAGES = (
    "/", "/history.html", "/hall-of-fame.html", "/70-stigmes.html",
    "/stories.html", "/tmimata.html", "/board.html", "/contact.html",
    "/sponsors.html", "/retro-matches.html", "/search.html",
    "/favorites.html", "/contribute.html", "/interviews.html", "/news.html",
)
ROOT = Path(__file__).resolve().parents[2]
# Last independently confirmed production archive sizes (2026-11-02).
# These are publication floors, NOT checkout-derived expectations: proposed new
# records do not make the live monitor fail before the Pages deploy finishes.
# Advance the floors only after checking a successful production deployment.
CANONICAL_PEOPLE_COUNT = 760
CANONICAL_NEWS_COUNT = 117
DATA = {
    "/news.json": ("items", CANONICAL_NEWS_COUNT),
    "/hall-of-fame-people.json": ("people", CANONICAL_PEOPLE_COUNT),
    "/assets/site/data/people.json": ("people", CANONICAL_PEOPLE_COUNT),
    "/assets/site/data/moments.json": ("moments", 70),
    "/assets/site/data/stories.json": ("stories", 21),
    "/assets/site/data/interviews.json": ("items", 28),
    "/assets/site/data/museum.json": ("articles", 14),
    "/assets/site/data/match-schedule.json": ("matches", 24),
}
USER_AGENT = "ArchelaosHealthCheck/1.0 (+https://archelaos.club)"
MAX_BODY = 12 * 1024 * 1024


def fetch(base: str, route: str) -> tuple[bytes, dict]:
    if not route.startswith("/") or route.startswith("//"):
        raise ValueError("Unsafe route")
    last = None
    for attempt in range(2):
        try:
            req = Request(base + route, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
            with urlopen(req, timeout=8) as response:
                landed = urlsplit(response.geturl())
                wanted = urlsplit(base)
                official_redirect = (
                    wanted.scheme == "https" and wanted.netloc == "archelaos.club"
                    and landed.scheme == "https" and landed.netloc == "www.archelaos.club"
                )
                if not official_redirect and (landed.scheme != wanted.scheme or landed.netloc != wanted.netloc):
                    raise RuntimeError("Unexpected redirect outside verified site: "+landed.scheme+"://"+landed.netloc+landed.path[:80])
                if response.status != 200:
                    raise RuntimeError(f"HTTP {response.status}")
                data = response.read(MAX_BODY + 1)
                if len(data) > MAX_BODY:
                    raise RuntimeError("Response exceeds 12 MiB")
                headers = {k.casefold(): v for k, v in response.headers.items()}
                if official_redirect:
                    headers["x-monitor-redirect-target"] = landed.netloc
                return data, headers
        except (HTTPError, URLError, TimeoutError, RuntimeError) as error:
            last = error
            if attempt == 0:
                time.sleep(1)
    raise RuntimeError(f"{route}: {last}")


def audit(base: str) -> dict:
    if base != "https://archelaos.club" and not base.startswith("http://127.0.0.1:"):
        raise ValueError("Only official public site or loopback test server supported")
    report = {"site": base, "checked": [], "warnings": [], "errors": [], "counts": {}}
    def check(route: str):
        try:
            body, headers = fetch(base, route)
            report["checked"].append(route)
            return body, headers
        except Exception as error:
            report["errors"].append(str(error))
            return None, {}

    pages = {}
    # When the homepage itself is unavailable, fail immediately rather than
    # spending minutes on dozens of follow-up requests during an outage.
    home, home_headers = check("/")
    if home is None:
        return report
    if home_headers.get("x-monitor-redirect-target"):
        report.setdefault("notes", []).append("Apex correctly redirects to https://"+home_headers["x-monitor-redirect-target"]+"/")
    for route in PAGES:
        body, headers = (home, home_headers) if route == "/" else check(route)
        if body is None:
            continue
        html = body.decode("utf-8", errors="replace")
        pages[route] = html
        # A canonical pointing to a redirecting apex is an SEO conflict.
        # Keep this a warning to avoid publishing a false site outage.
        canonical = "https://www.archelaos.club" + route
        if f'<link rel="canonical" href="{canonical}">' not in html:
            report["warnings"].append(f"{route}: canonical does not match final www host")
        if "<main" not in html.lower():
            report["errors"].append(f"{route}: missing main element")
        if route == "/news.html":
            if 'id="an-grid"' not in html or 'id="an-search"' not in html:
                report["errors"].append("News controls missing")
        if route == "/search.html":
            if 'id="sr-query"' not in html or 'id="sr-results"' not in html:
                report["errors"].append("Search controls missing")
        if route == "/tmimata.html" and 'data-dp-open="archery"' not in html:
            report["errors"].append("Department cards missing")
        if "/assets/site/css/viewports.css" not in html:
            report["errors"].append(f"{route}: responsive CSS missing")
        if "/assets/site/js/shell.js" not in html:
            report["errors"].append(f"{route}: common navigation script missing")
        if not headers.get("cache-control") and route != "/":
            report["warnings"].append(f"{route}: Cache-Control not returned")
        # Fingerprints prevent desktop and mobile from loading different stale assets.
        for asset in re.findall(r'["\x27](/assets/site/(?:css|js)/[\w./-]+\.(?:css|js))(?:\?v=([a-f0-9]{12}))?["\x27]', html):
            if not asset[1]:
                report["warnings"].append(f"{route}: unversioned asset {asset[0]}")
    data = {}
    for route, (key, minimum) in DATA.items():
        body, _ = check(route)
        if body is None:
            continue
        try:
            obj = json.loads(body)
            records = obj[key]
            if not isinstance(records, list) or len(records) < minimum:
                raise ValueError(f"{key} count below {minimum}")
            report["counts"][key] = len(records)
            if route == "/news.json":
                report["counts"]["news_articles"] = len(records)
            data[key] = records
        except (ValueError, TypeError, KeyError) as error:
            report["errors"].append(f"{route}: invalid archive ({error})")
    if "people" in data:
        ids = [str(x.get("id", "")) for x in data["people"]]
        if len(set(ids)) != len(ids) or not all(ids):
            report["errors"].append("Person IDs are missing or duplicated")
        for pid in ids[:2]:
            if re.fullmatch(r"arch-[a-z0-9-]{8,60}", pid):
                check("/people/" + pid + ".html")
    for route in ("/robots.txt", "/sitemap.xml", "/site.webmanifest"):
        body, _ = check(route)
        if body is None:
            continue
        if route == "/robots.txt" and b"Sitemap:" not in body:
            report["errors"].append("robots.txt missing Sitemap")
        if route == "/sitemap.xml":
            try:
                ET.fromstring(body)
            except ET.ParseError:
                report["errors"].append("Invalid sitemap XML")
        if route == "/site.webmanifest":
            try:
                json.loads(body)
            except ValueError:
                report["errors"].append("Invalid webmanifest JSON")
    # Verify that the actual served JS/CSS bytes match the hashes in HTML.
    # This catches the mobile-vs-desktop stale cache problem after deployment.
    seen_assets = set()
    for page in ("/search.html", "/tmimata.html"):
        html = pages.get(page, "")
        assets = re.findall(r'["\x27](/assets/site/(?:css|js)/[\w./-]+\.(?:css|js)(?:\?v=[a-f0-9]{12})?)["\x27]', html)
        for asset in assets:
            if asset in seen_assets:
                continue
            seen_assets.add(asset)
            body, _ = check(asset)
            if body is None:
                continue
            parsed = urlsplit(asset)
            if re.fullmatch(r"v=[a-f0-9]{12}", parsed.query):
                version = parsed.query[2:]
                if sha256(body).hexdigest()[:12] != version:
                    report["errors"].append("Published asset fingerprint mismatch: " + parsed.path)
            else:
                report["warnings"].append("Published asset without hash: " + parsed.path)
            if parsed.path == "/assets/site/css/viewports.css":
                styles = re.findall(r'url\(["\x27]?\./(mobile|tablet|laptop|desktop|accessibility)\.css\?v=([a-f0-9]{12})', body.decode("utf-8", errors="replace"))
                if {name for name, _ in styles} != {"mobile", "tablet", "laptop", "desktop", "accessibility"}:
                    report["errors"].append("Responsive CSS imports missing or not versioned")
                for name, expected in styles:
                    css_path = f"/assets/site/css/{name}.css?v={expected}"
                    if css_path in seen_assets:
                        continue
                    seen_assets.add(css_path)
                    css, _ = check(css_path)
                    if css is not None and sha256(css).hexdigest()[:12] != expected:
                        report["errors"].append("Responsive CSS fingerprint mismatch: " + name)
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="https://archelaos.club")
    parser.add_argument("--json", type=Path)
    args = parser.parse_args()
    report = audit(args.base.rstrip("/"))
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"LIVE CHECK: {len(report['checked'])} resources, {len(report['errors'])} errors, {len(report['warnings'])} warnings")
    for message in report["errors"]:
        print("ERROR:", message)
    for message in report["warnings"][:8]:
        print("WARNING:", message)
    return 1 if report["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
