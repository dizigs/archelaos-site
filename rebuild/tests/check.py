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
                "board.html","contact.html","sponsors.html","tmimata.html","retro-matches.html","search.html","favorites.html","contribute.html","interviews.html"}
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
    museum_html=(REBUILD/"history.html").read_text(encoding="utf-8")
    assert museum_html.count('class="mu-interviews"') == 1, "The Museum must have one Voices feature"
    assert museum_html.count('href="/interviews.html"') == 1, "The Museum interviews link must be unique"
    for old in ('id="archive-voices"', 'id="arch-press-voices"', 'id="mu-press-grid"', 'Δέκα φωνές από τις εφημερίδες'):
        assert old not in museum_html, "Duplicate Voices section returned: " + old
    museum_tour=(REBUILD/"js/museum-tour.js").read_text(encoding="utf-8")
    assert "museum-interviews" in museum_tour and "arch-press-voices" not in museum_tour, "The Museum tour must point to the single Voices card"
    museum_js=(REBUILD/"js/museum.js").read_text(encoding="utf-8")
    assert "mu-press-grid" not in museum_js, "Unused press grid binder remains"
    departments_html = (REBUILD/"tmimata.html").read_text(encoding="utf-8")
    departments_css = (REBUILD/"css/departments.css").read_text(encoding="utf-8")
    sports = ("handball","track","archery","shooting","gymnastics","volleyball","wrestling","swimming","basketball")
    assert departments_html.count('class="dp-card ') == 10, "Expected exactly nine sport cards and one historical card"
    for sport in sports:
        assert f'data-dp-open="{sport}"' in departments_html, f"Missing sport card: {sport}"
        assert f'[data-dp-open="{sport}"]' in departments_css, f"Missing icon assignment: {sport}"
        svg = (REBUILD/"images/sport-silhouettes"/(sport+".svg")).read_text(encoding="utf-8")
        assert svg.count("<path") >= 1 and "Apache License 2.0" in svg, f"Sports pictogram not migrated: {sport}"
    assert 'data-dp-open="inactive-depts"' in departments_html, "Historical departments card missing"
    historic = departments_html.split('data-dp-open="inactive-depts"',1)[1].split('</button>',1)[0]
    assert 'class="dp-title"' in historic and 'class="dp-silhouette"' not in historic, "Historical card must keep title-only design without a sports pictogram"
    assert 'class="dp-watermark"' not in historic, "Retired historical watermark reintroduced"
    assert "filter:blur(4px)" in departments_css, "Classic sports cards should use 4px photo blur"
    assert ".dp-silhouette{display:none!important}" in departments_css, "Sports pictograms should be hidden in classic photo cards"
    assert 'class="dp-cta"' not in departments_html, "Sport cards must be entirely clickable, without CTA text"
    contribution=(REBUILD/"contribute.html").read_text(encoding="utf-8")
    contribution_js=(REBUILD/"js/contribute-guide.js").read_text(encoding="utf-8")
    for selector in ("ac-attachments", "ac-archive-link", "ac-sender-email", "ac-private-consent", "ac-guide-send"):
        assert f'id="{selector}"' in contribution, f"Missing contribution transfer field: {selector}"
    for api_contract in ("'/api/contact'", "'archive'", "'consent','true'", "form.append('attachments'"):
        assert api_contract in contribution_js or api_contract.replace("form.append('attachments'", "payload.append('attachments'") in contribution_js, f"Contribution backend contract missing: {api_contract}"
    assert "Η online φόρμα και το ασφαλές upload δεν έχουν ενεργοποιηθεί ακόμη" not in contribution, "Obsolete contribution notice returned"
    # Responsive CSS must stay modular, and every declared import must exist.
    viewport_css = (REBUILD/"css/viewports.css").read_text(encoding="utf-8")
    for name in ("mobile.css", "tablet.css", "laptop.css", "desktop.css", "accessibility.css"):
        assert (REBUILD/"css"/name).is_file(), f"responsive stylesheet missing: {name}"
        assert f'url("./{name}")' in viewport_css, f"viewport stylesheet not imported: {name}"
    for file in (REBUILD/"data").glob("*.json"):
        json.loads(file.read_text(encoding="utf-8"))
    interview_data = json.loads((REBUILD/"data/interviews.json").read_text(encoding="utf-8"))
    published_ids = [record["id"] for record in interview_data["items"]]
    source_ids = [record["id"] for record in json.loads((ROOT/"interviews.json").read_text(encoding="utf-8"))["items"]]
    assert len(published_ids) >= 25, "Archive interviews incomplete"
    assert len(set(published_ids)) == len(published_ids), "Duplicate interview identifiers"
    assert set(published_ids) == set(source_ids), "Interview production archive differs from source"
    moments = json.loads((REBUILD/"data/moments.json").read_text(encoding="utf-8"))["moments"]
    stories = json.loads((REBUILD/"data/stories.json").read_text(encoding="utf-8"))["stories"]
    people = json.loads((REBUILD/"data/people.json").read_text(encoding="utf-8"))["people"]
    assert len(moments) == 70 and len({m["id"] for m in moments}) == 70, "70 moments mismatch"
    assert len(stories) >= 21, "21 original stories must remain"
    source_stories = json.loads((REBUILD/"data/stories.json").read_text(encoding="utf-8"))
    assert source_stories["count"] == len(stories), "story count metadata does not match entries"
    assert len({s["title"].casefold() for s in stories}) == len(stories), "duplicate story titles"
    museum = json.loads((REBUILD/"data/museum.json").read_text(encoding="utf-8"))
    foundation = next(a for a in museum["articles"] if a["id"] == "intro")
    colours = next(a for a in museum["articles"] if a["id"] == "colors-1968")
    assert "29 Απριλίου 1956" in foundation["html"] and "27 Ιουνίου 1968" not in foundation["html"], "1956 founding article contains duplicated 1968 text"
    assert "27 Ιουνίου 1968" in colours["html"] and "Καθορίζονται οριστικώς" in colours["html"], "1968 colours article missing original second paragraph or archive quote"
    assert "η αυτούσια διατύπωση δεν έχει επαληθευτεί" in colours["html"], "Archive quotation provenance disclosure missing"
    assert "colors-1968" in (REBUILD/"js/museum.js").read_text(encoding="utf-8"), "Museum exhibit points to wrong record"
    assert len({a["id"] for a in museum["articles"]}) == len(museum["articles"]), "Duplicate Museum exhibit identifier"
    assert len(museum["articles"]) >= 14, "original 14 museum articles missing"
    assert len({a["id"] for a in museum["articles"]}) == len(museum["articles"]), "duplicate museum article IDs"
    assert len(museum["press"]) == 10, "10 press archive entries mismatch"
    board = json.loads((REBUILD/"data/board.json").read_text(encoding="utf-8"))
    assert len(board["members"]) == 8 and len(board["eras"]) == 4, "board source mismatch"
    timeline = " ".join(era["html"] for era in board["eras"])
    assert not re.search(
        r"Έχετε συμπληρωματικά στοιχεία|Επικοινωνήστε μαζί μας|Have additional information\\?|Contact us",
        timeline, re.IGNORECASE
    ), "Deprecated contact prompt leaked into Board popups"
    assert "pbh-modal-foot" not in timeline, "Deprecated board popup footer reappeared"
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
