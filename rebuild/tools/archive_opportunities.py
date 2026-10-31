#!/usr/bin/env python3
"""Report candidate links between PUBLIC biographies, moments, stories and museum.

Read-only. The exact appearance of a full name in text is a suggestion,
NOT proof of identity or a license to change/publish historical claims.
Never opens Drive, never adds unsourced biographies and never deploys.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import unicodedata

DATA = Path(__file__).resolve().parents[1] / "data"


def words(value: object) -> str:
    """Accent-insensitive, punctuation-neutral Greek/Latin matching."""
    lowered = unicodedata.normalize("NFD", str(value or "").casefold())
    lowered = "".join(c for c in lowered if not unicodedata.combining(c))
    lowered = lowered.replace("ς", "σ")
    return " ".join(re.findall(r"[^\W_]+", lowered, flags=re.UNICODE))


class Visible(HTMLParser):
    """Ignore HTML tags/attributes and executable/style content in museum text."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "noscript"}:
            self.hidden += 1

    def handle_endtag(self, tag):
        if tag in {"script", "style", "noscript"} and self.hidden:
            self.hidden -= 1

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def visible_html(value: str) -> str:
    parser = Visible()
    parser.feed(value)
    return " ".join(parser.parts)


def get(name: str, key: str) -> list:
    return json.loads((DATA / name).read_text(encoding="utf-8"))[key]


def documents(moments: list, stories: list, museum: dict) -> list[dict]:
    result = []
    for m in moments:
        result.append({"kind": "moment", "id": str(m["id"]),
                       "title": str(m["title"]),
                       "content": " ".join([m["title"], *m.get("body", [])])})
    for i, s in enumerate(stories, 1):
        result.append({"kind": "story", "id": str(i),
                       "title": str(s["title"]),
                       "content": " ".join([s.get("title", ""), s.get("lead", ""),
                                            s.get("text", "")])})
    for section in ("articles", "press"):
        for a in museum.get(section, []):
            result.append({"kind": "exhibit", "id": str(a["id"]),
                           "title": str(a.get("title", "")),
                           "content": " ".join([str(a.get("title", "")),
                                                visible_html(str(a.get("html", "")))])})
    return result


def find_associations(people: list, docs: list[dict]) -> dict:
    by_name = defaultdict(list)
    for p in people:
        name = words(p.get("name", ""))
        # A complete two-or-more-word name only; no loose surname matches.
        if len(name.split()) >= 2 and len(name) >= 8:
            by_name[name].append(p)
    ambiguous = [{"name": name, "people_ids": [p["id"] for p in rows]}
                 for name, rows in by_name.items() if len(rows) > 1]
    candidates = []
    normalized = [(d, words(d["content"])) for d in docs]
    for name, persons in by_name.items():
        if len(persons) != 1:
            continue
        person = persons[0]
        pattern = re.compile(r"(?<!\w)" + re.escape(name) + r"(?!\w)")
        matches = []
        for doc, content in normalized:
            if pattern.search(content):
                matches.append({"kind": doc["kind"], "id": doc["id"], "title": doc["title"]})
        if matches:
            candidates.append({"person_id": person["id"], "person_name": person["name"],
                               "evidence": "full-name text match; identity not verified",
                               "references": matches})
    candidates.sort(key=lambda p: (-len(p["references"]), p["person_name"]))
    return {"candidates": candidates, "ambiguous_full_names": ambiguous}


def build_report(people: list, moments: list, stories: list, museum: dict,
                 calendar: dict) -> dict:
    docs = documents(moments, stories, museum)
    result = find_associations(people, docs)
    by_section = Counter(d["kind"] for d in docs)
    mentioned_by_section = Counter()
    total_links = 0
    for row in result["candidates"]:
        total_links += len(row["references"])
        for ref in row["references"]:
            mentioned_by_section[ref["kind"]] += 1
    known_dates = calendar.get("events", [])
    year_counts = Counter()
    for m in moments:
        for year in set(re.findall(r"(?<!\d)(?:18|19|20)\d{2}(?!\d)",
                                   str(m.get("year", "")))):
            year_counts[year[:3] + "0s"] += 1
    return {
        "scope": "public staged JSON only, no Drive documents or network",
        "disclaimer": ("Suggestions based on exact normalized Greek full names, "
                       "not identity verification or automatic publication."),
        "counts": {
            "biographies": len(people), "moments": len(moments),
            "stories": len(stories), "museum_exhibits": by_section["exhibit"],
            "curated_exact_day_events": len(known_dates),
            "candidate_people_with_references": len(result["candidates"]),
            "candidate_person_to_document_links": total_links,
            "candidate_refs_by_section": dict(mentioned_by_section)
        },
        "moment_decades": dict(sorted(year_counts.items())),
        "biography_reference_field_count": sum(bool(p.get("refs")) for p in people),
        "moment_source_field_count": sum(bool(m.get("source")) for m in moments),
        "ambiguous_full_names": result["ambiguous_full_names"],
        "candidate_associations": result["candidates"],
        "editorial_next_steps": [
            "Check each candidate against reliable source records before linking profiles",
            "Verify homonyms, inflected Greek names and name variants manually",
            "Do not infer an achievement just because a name appears",
            "Review missing sports/decades and image provenance separately",
            "Never place private Drive source identifiers in a public release"
        ]
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", type=Path, help="Optional report (CI ignored artifact)")
    args = parser.parse_args()
    people = get("people.json", "people")
    moments = get("moments.json", "moments")
    stories = get("stories.json", "stories")
    museum = json.loads((DATA / "museum.json").read_text(encoding="utf-8"))
    calendar = json.loads((DATA / "on-this-day.json").read_text(encoding="utf-8"))
    report = build_report(people, moments, stories, museum, calendar)
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    c = report["counts"]
    print("ARCHIVE CONNECTIONS:", c["biographies"], "people;",
          c["moments"], "moments;", c["stories"], "stories;",
          c["museum_exhibits"], "exhibits;",
          c["candidate_people_with_references"], "people mentioned;",
          c["candidate_person_to_document_links"], "candidate links.")
    print("These are suggestions for historical review, not automatic identity matches.")


if __name__ == "__main__":
    main()
