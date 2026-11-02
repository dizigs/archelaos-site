#!/usr/bin/env python3
"""Scoped auto-repair for known inter-tag HTML whitespace defects site-wide.

Only normalize literal escaped whitespace *between HTML tags* in the
allowlisted public page <head> sections. Never touch JS, attributes, prose, user content,
public JSON, event records or any other path. The release guard remains the
authority: if an unknown escaped string is present, CI must fail rather than
mutate the site.
"""
from __future__ import annotations

import argparse
from pathlib import Path
import re
import json

ROOT = Path(__file__).resolve().parents[2]
# Explicit, reviewed HTML page list from the public release manifest. Never auto-edit
# user content, people profiles, archives, private inboxes, or arbitrary files.
STAGED_PAGES = tuple(entry["file"] for entry in json.loads(
    (ROOT / "rebuild/seo/metadata.json").read_text(encoding="utf-8"))["pages"])
if not all(re.fullmatch(r"[a-z0-9][a-z0-9-]*[.]html", name) for name in STAGED_PAGES):
    raise ValueError("Unsafe HTML page in site manifest")
ALLOWLIST = ("news.html",) + tuple("rebuild/" + name for name in STAGED_PAGES)
ESCAPED_BETWEEN_TAGS = re.compile(
    r"(<(script|style)\b[^>]*>.*?</\2\s*>)"
    r"|(?<=>)[ \t]*(?:\\n|\\r|\\t)+[ \t]*(?=<)",
    re.IGNORECASE | re.DOTALL,
)


def repair_news_head(raw: str) -> tuple[str, int]:
    if raw.count("<head>") != 1 or raw.count("</head>") != 1:
        raise ValueError("Unexpected news head markup; refusing repair")
    opening, remainder = raw.split("<head>", 1)
    head, body = remainder.split("</head>", 1)
    count = 0

    def replace(match: re.Match[str]) -> str:
        nonlocal count
        if match.group(1):
            return match.group(0)
        count += 1
        return "\n"

    cleaned = ESCAPED_BETWEEN_TAGS.sub(replace, head)
    return opening + "<head>" + cleaned + "</head>" + body, count


def repair(path: Path, apply: bool = False) -> int:
    if not path.is_file() or path.resolve() not in {(ROOT / name).resolve() for name in ALLOWLIST}:
        raise ValueError("Auto-fix restricted to allowlisted public HTML pages")
    source = path.read_text(encoding="utf-8")
    output, count = repair_news_head(source)
    if apply and count:
        path.write_text(output, encoding="utf-8")
    return count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    for name in ALLOWLIST:
        count = repair(ROOT / name, args.apply)
        print(f"SAFE_HTML_REPAIR {name}: {count} replacements; apply={args.apply}")


if __name__ == "__main__":
    main()
