#!/usr/bin/env python3
"""Read-only live deployment monitor. Standard library only; no credentials or writes to site."""
from __future__ import annotations
import argparse
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
    "/favorites.html", "/contribute.html", "/interviews.html",
)
DATA = {
    "/assets/site/data/people.json": ("people", 682),
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
            with urlopen(req, timeout=18) as response:
                if response.status != 200:
                    raise RuntimeError(f"HTTP {response.status}")
                data = response.read(MAX_BODY + 1)
                if len(data) > MAX_BODY:
                    raise RuntimeError("Response exceeds 12 MiB")
                return data, dict(response.headers.items())
        except (HTTPError, URLError, TimeoutError, RuntimeError) as error:
            last = error
            if attempt == 0:
                time.sleep(2)
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
    for route in PAGES:
        body, headers = check(route)
        if body is None:
            continue
        html = body.decode("utf-8", errors="replace")
        pages[route] = html
        if "<main" not in html.lower():
            report["errors"].append(f"{route}: missing main element")
        if route == "/search.html":
            if 'id="sr-query"' not in html or 'id="sr-results"' not in html:
                report["errors"].append("Search controls missing")
        if route == "/tmimata.html" and 'data-dp-open="archery"' not in html:
            report["errors"].append("Department cards missing")
        if "/assets/site/css/viewports.css" not in html:
            report["errors"].append(f"{route}: responsive CSS missing")
        if "/assets/site/js/shell.js" not in html:
            report["errors"].append(f"{route}: common navigation script missing")
        if not headers.get("Cache-Control") and route != "/":
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
    for page in ("/search.html", "/tmimata.html"):
        html = pages.get(page, "")
        assets = re.findall(r'["\x27](/assets/site/(?:css|js)/[\w./-]+\.(?:css|js)(?:\?v=[a-f0-9]{12})?)["\x27]', html)
        for asset in assets:
            check(asset)
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
