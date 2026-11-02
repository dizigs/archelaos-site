#!/usr/bin/env python3
"""Collect public archive source URLs for Lychee; never rewrite news or biographies."""
from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "lychee-inputs" / "archive-links.md"

def public_url(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    if not value or ">" in value or "\n" in value:
        return None
    parts = urlsplit(value)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        return None
    # The archive must never make link-check requests containing credentials.
    if parts.username or parts.password:
        return None
    return value

def main() -> None:
    news = json.loads((ROOT / "news.json").read_text(encoding="utf-8"))
    people = json.loads((ROOT / "hall-of-fame-people.json").read_text(encoding="utf-8"))
    groups: dict[str, set[str]] = {
        "Published news sources": set(),
        "External news images": set(),
        "Hall of Fame references": set(),
    }
    for article in news["items"]:
        source = public_url(article.get("sourceUrl"))
        if source:
            groups["Published news sources"].add(source)
        image = public_url(article.get("image"))
        if image:
            groups["External news images"].add(image)
    for person in people["people"]:
        for ref in person.get("refs", []):
            if not isinstance(ref, dict):
                continue
            url = public_url(ref.get("url"))
            if url:
                groups["Hall of Fame references"].add(url)

    lines = [
        "# Public source and image links from the Archelaos archive",
        "",
        "Generated for link-checking only. An unavailable external source does not",
        "automatically invalidate a historical news article or biography.",
        "",
    ]
    for heading, urls in groups.items():
        lines.extend((f"## {heading} ({len(urls)})", ""))
        lines.extend(f"- <{url}>" for url in sorted(urls))
        lines.append("")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text("\n".join(lines), encoding="utf-8")
    total = len(set().union(*groups.values()))
    print(f"Link audit inputs prepared: {total} unique external URLs; groups=")
    for group, urls in groups.items():
        print(f"  {group}: {len(urls)}")

if __name__ == "__main__":
    main()
