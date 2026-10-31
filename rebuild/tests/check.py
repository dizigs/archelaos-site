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
    assert len(html_pages) >= 11, "expected multiple rebuilt pages"
    known = {p.name for p in html_pages}
    expected = {"index.html","history.html","hall-of-fame.html","70-stigmes.html","stories.html",
                "board.html","contact.html","sponsors.html","tmimata.html","retro-matches.html","search.html","favorites.html","contribute.html"}
    assert expected.issubset(known), "missing required rebuilt routes: " + str(expected-known)

    for path in html_pages:
        source = path.read_text(encoding="utf-8")
        assert '/rebuild/css/motion.css' in source and '/rebuild/js/motion.js' in source, f"{path.name}: shared elegant motion missing"
        assert "noindex" in source, f"{path.name}: missing preview-only noindex"
        if path.name not in ("preview.html", "contribute.html"):
            assert '/rebuild/css/collection.css' in source and '/rebuild/js/favorites.js' in source, f"{path.name}: shared favorite module missing"
        parser = Assets(path)
        parser.feed(source)
        assert not parser.missing, "\n".join(parser.missing)
    # Responsive CSS must stay modular, and every declared import must exist.
    viewport_css = (REBUILD/"css/viewports.css").read_text(encoding="utf-8")
    for name in ("mobile.css", "tablet.css", "laptop.css", "desktop.css", "accessibility.css"):
        assert (REBUILD/"css"/name).is_file(), f"responsive stylesheet missing: {name}"
        assert f'url("./{name}")' in viewport_css, f"viewport stylesheet not imported: {name}"
    for file in (REBUILD/"data").glob("*.json"):
        json.loads(file.read_text(encoding="utf-8"))
    moments = json.loads((REBUILD/"data/moments.json").read_text(encoding="utf-8"))["moments"]
    stories = json.loads((REBUILD/"data/stories.json").read_text(encoding="utf-8"))["stories"]
    people = json.loads((REBUILD/"data/people.json").read_text(encoding="utf-8"))["people"]
    assert len(moments) == 70 and len({m["id"] for m in moments}) == 70, "70 moments mismatch"
    assert len(stories) >= 21, "21 original stories must remain"
    source_stories = json.loads((REBUILD/"data/stories.json").read_text(encoding="utf-8"))
    assert source_stories["count"] == len(stories), "story count metadata does not match entries"
    assert len({s["title"].casefold() for s in stories}) == len(stories), "duplicate story titles"
    museum = json.loads((REBUILD/"data/museum.json").read_text(encoding="utf-8"))
    assert len(museum["articles"]) >= 14, "original 14 museum articles missing"
    assert len({a["id"] for a in museum["articles"]}) == len(museum["articles"]), "duplicate museum article IDs"
    assert len(museum["press"]) == 10, "10 press archive entries mismatch"
    board = json.loads((REBUILD/"data/board.json").read_text(encoding="utf-8"))
    assert len(board["members"]) == 8 and len(board["eras"]) == 4, "board source mismatch"
    timeline = " ".join(era["html"] for era in board["eras"])
    assert "τα διοικητικά καθήκοντα ασκούσε μεταβατικά ο αντιπρόεδρος Χαράλαμπος Σαββίδης" in timeline
    assert "Vice President Charalampos Savvidis temporarily performed the president's duties" in timeline
    assert "τα διοικητικά καθήκοντα ασκούσε μεταβατικά ο αντιπρόεδρος Παναγιώτης Διαμαντόπουλος" not in timeline

    retro = json.loads((REBUILD/"data/retro.json").read_text(encoding="utf-8"))
    assert [m["year"] for m in retro["matches"]] == [1990,1993,1994,1996], "retro final years mismatch"
    additions = json.loads((REBUILD/"data/people-addenda.json").read_text(encoding="utf-8"))["entries"]
    assert isinstance(additions, dict), "profile additions must be a map"
    assert all(person_id in {p["id"] for p in people}
               for person_id in additions), "profile additions contain missing IDs"
    assert all(all(x.get("el") and x.get("en") and x.get("source_label") for x in entries)
               for entries in additions.values()), "incomplete bilingual additions"
    assert len(people) == 682 and len({p["id"] for p in people}) == 682, "682 biographies mismatch"
    assert all(p.get("name") and p.get("name_en") and p.get("bio") and p.get("bio_en") for p in people), "incomplete biographies"
    home = json.loads((REBUILD/"data/home.json").read_text(encoding="utf-8"))
    assert len(home["sports"]) == 8 and len(home["slides"]) == 8, "homepage sports/slides missing"
    assert {s["key"] for s in home["sports"]} == {"handball","track","archery","shooting","gymnastics","volleyball","wrestling","swimming"}, "unexpected homepage sports list"
    assert all(s.get("photo") and s.get("description") for s in home["sports"]), "homepage details missing"

    assert all(m.get("title_en") and m.get("body_en") for m in moments), "missing moment translations"
    calendar = json.loads((REBUILD/"data/on-this-day.json").read_text(encoding="utf-8"))
    assert all(len(event["day"]) == 5 and event["day"][2] == "-"
               and event["momentId"] in {m["id"] for m in moments}
               for event in calendar["events"]), "invalid daily archive data"
    assert len({e["day"] for e in calendar["events"]}) == len(calendar["events"]), "duplicate exact-date entries"

    print(f"REBUILD OK: {len(html_pages)} HTML pages; {len(moments)} moments; {len(stories)} stories; {len(people)} profiles")

if __name__ == "__main__":
    inspect()
