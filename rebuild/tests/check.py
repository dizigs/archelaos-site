#!/usr/bin/env python3
"""Offline integrity checks for backup-based rebuild. No third-party packages."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
import json, re

ROOT = Path(__file__).resolve().parents[2]
REBUILD = ROOT / "rebuild"

class Assets(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.source = source
        self.missing = []
    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag not in ("img", "script", "link"):
            return
        attr = d.get("src") or d.get("href")
        if not attr:
            return
        parsed = urlsplit(attr)
        if parsed.scheme or parsed.netloc or attr.startswith(("data:", "//", "#")):
            return
        target = ROOT / parsed.path.lstrip("/") if attr.startswith("/") else self.source.parent / parsed.path
        if not target.is_file():
            self.missing.append(f"{self.source.relative_to(ROOT)}: missing {attr}")

def inspect():
    html_pages = sorted(REBUILD.glob("*.html"))
    assert len(html_pages) >= 9, "expected multiple rebuilt pages"
    for path in html_pages:
        source = path.read_text(encoding="utf-8")
        assert "noindex" in source, f"{path.name}: missing preview-only noindex"
        parser = Assets(path)
        parser.feed(source)
        assert not parser.missing, "\n".join(parser.missing)
    for file in (REBUILD/"data").glob("*.json"):
        json.loads(file.read_text(encoding="utf-8"))
    moments = json.loads((REBUILD/"data/moments.json").read_text(encoding="utf-8"))["moments"]
    stories = json.loads((REBUILD/"data/stories.json").read_text(encoding="utf-8"))["stories"]
    people = json.loads((ROOT/"hall-of-fame-people.json").read_text(encoding="utf-8"))["people"]
    assert len(moments) == 70 and len({m["id"] for m in moments}) == 70, "70 moments mismatch"
    assert len(stories) == 21, "21 story records mismatch"
    museum = json.loads((REBUILD/"data/museum.json").read_text(encoding="utf-8"))
    assert len(museum["articles"]) == 14, "14 museum archive entries mismatch"
    assert len(museum["press"]) == 10, "10 press archive entries mismatch"
    board = json.loads((REBUILD/"data/board.json").read_text(encoding="utf-8"))
    assert len(board["members"]) == 8 and len(board["eras"]) == 4, "board source mismatch"
    assert len(people) == 682 and len({p["id"] for p in people}) == 682, "682 biographies mismatch"
    assert all(m.get("title_en") and m.get("body_en") for m in moments), "missing moment translations"
    print(f"REBUILD OK: {len(html_pages)} HTML pages; {len(moments)} moments; {len(stories)} stories; {len(people)} profiles")

if __name__ == "__main__":
    inspect()
