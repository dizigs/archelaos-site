#!/usr/bin/env python3
"""Privacy-safe, deterministic fingerprints for whole-site health incidents.

Only known public paths and categorical error codes are persisted. No IPs,
email addresses, query strings, request bodies, raw exception messages or
private contribution content ever enter the normalized event log.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
from hashlib import sha256
import json
import os
from pathlib import Path
import re

PATH = re.compile(r"(?<![A-Za-z0-9])/([A-Za-z0-9._/-]{1,140})")
VALID_PUBLIC = re.compile(
    r"^/(?:[a-z0-9-]+[.]html|[a-z0-9-]+[.](?:json|xml|txt|webmanifest)"
    r"|assets/(?:site/)?(?:css|js|data)/[a-z0-9._/-]+"
    r"|people/arch-[a-z0-9-]+[.]html|images/[a-z0-9._/-]+|)$",
    re.IGNORECASE,
)


def safe_route(message: str) -> str:
    """Only return a static, recognized, public route; never a user-supplied URL."""
    m = PATH.search(message)
    if not m:
        return "site"
    path = "/" + m.group(1)
    if path.startswith("/people/"):
        return "/people/:profile.html"
    return path if len(path) <= 140 and VALID_PUBLIC.fullmatch(path) else "site"


def categorize(message: str) -> str:
    value = message.casefold()
    if "canonical does not match" in value:
        return "SEO_CANONICAL_MISMATCH"
    if "fingerprint mismatch" in value:
        return "STATIC_ASSET_MISMATCH"
    if "unversioned asset" in value or "without hash" in value:
        return "STATIC_ASSET_UNVERSIONED"
    if "unexpected redirect" in value:
        return "UNEXPECTED_REDIRECT"
    if "http " in value or "timed out" in value or "urlopen" in value:
        return "HTTP_UNAVAILABLE"
    if "invalid archive" in value or "duplicated" in value:
        return "DATA_INTEGRITY"
    if "missing" in value:
        return "MISSING_REQUIRED_CONTENT"
    if "cache-control" in value:
        return "CACHE_HEADER_MISSING"
    return "UNCLASSIFIED"


def build_events(report: dict) -> dict:
    """Produce deduplicated, stable signatures; deliberately discard raw messages."""
    found = Counter()
    for severity, key in (("error", "errors"), ("warning", "warnings")):
        for message in report.get(key, []):
            if not isinstance(message, str):
                continue
            category = categorize(message)
            route = safe_route(message)
            found[(severity, category, route)] += 1
    events = []
    for (severity, category, route), occurrences in sorted(found.items()):
        signature = "|".join((severity, category, route))
        events.append({
            "fingerprint": sha256(signature.encode("utf-8")).hexdigest()[:16],
            "severity": severity,
            "code": category,
            "route": route,
            "occurrences": occurrences,
        })
    return {
        "schema_version": 1,
        "source": "public-site-monitor",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "github_run_id": os.getenv("GITHUB_RUN_ID", "") if os.getenv("GITHUB_RUN_ID", "").isdigit() else "",
        "total_checked": len(report.get("checked", [])),
        "errors": len(report.get("errors", [])),
        "warnings": len(report.get("warnings", [])),
        "events": events,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.input.is_file():
        report = json.loads(args.input.read_text(encoding="utf-8"))
        if not isinstance(report, dict):
            raise ValueError("Health report must be a JSON object")
    else:
        report = {"errors": ["monitor report missing"], "warnings": [], "checked": []}
    events = build_events(report)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(events, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("SITE HEAL EVENTS: checked={} errors={} warnings={} distinct={}".format(
        events["total_checked"], events["errors"], events["warnings"], len(events["events"])
    ))
    for row in events["events"]:
        print("{severity} {code} {route} count={occurrences} signature={fingerprint}".format(**row))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
