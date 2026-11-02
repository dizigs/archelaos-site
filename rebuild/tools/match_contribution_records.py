#!/usr/bin/env python3
"""Offline candidate matching for contribution leads against public club records.

This never verifies historical claims, changes source data, or publishes content.
It uses private excerpts locally to suggest existing news, event, and person IDs.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
YEAR = re.compile(r"\b(?:19|20)\d{2}\b")
SCORE = re.compile(r"\b(\d{1,3})\s*[-–:]\s*(\d{1,3})\b")
STOP = {
    "αρχέλαος", "αρχελαος", "κατερίνης", "κατερινης", "γασ", "στον",
    "στην", "στους", "στις", "στης", "στη", "στο", "απο", "αλλά",
    "αυτη", "αυτο", "είναι", "κατά", "μετά", "έναν", "εναν",
    "ομάδα", "ομαδα", "αγώνα", "αγωνες", "του", "της", "των",
    "και", "για", "από", "αλλα", "στην", "που", "τον", "έτος",
}
SPORTS = {
    "handball": ("χαντμπολ", "χειροσφαιριση", "handball"),
    "volleyball": ("βόλεϊ", "βολει", "πετοσφαιριση", "volleyball"),
    "wrestling": ("παλη", "wrestling"),
    "archery": ("τοξοβολια", "archery"),
    "athletics": ("στιβος", "στιβου", "athletics"),
    "basketball": ("μπασκετ", "καλαθοσφαιριση", "basketball"),
    "gymnastics": ("ενοργανη", "γυμναστικη", "gymnastics"),
    "swimming": ("κολυμβηση", "swimming"),
}


def fold(text):
    value = unicodedata.normalize("NFD", str(text).casefold())
    return "".join(ch for ch in value if unicodedata.category(ch) != "Mn")


def words(text):
    return [w for w in re.findall(r"[a-zα-ω0-9]+", fold(text)) if len(w) >= 4]


def key_terms(text):
    return set(words(text)) - {fold(w) for w in STOP}


def years(text):
    return set(YEAR.findall(str(text)))


def score_pairs(text):
    return {tuple(sorted(map(int, x))) for x in SCORE.findall(str(text))}


def sport_of(text):
    value = fold(text)
    candidates = [
        label for label, variants in SPORTS.items()
        if any(fold(v) in value for v in variants)
    ]
    return candidates[0] if len(candidates) == 1 else None


def candidate_matches(lead, records, kind):
    excerpt = str(lead.get("excerpt", ""))[:1000]
    lead_years = years(excerpt + " " + " ".join(map(str, lead.get("dates", []))))
    lead_scores = score_pairs(excerpt + " " + " ".join(map(str, lead.get("scores", []))))
    lead_sport = sport_of(excerpt)
    lead_terms = key_terms(excerpt)
    found = []
    for record in records:
        if not isinstance(record, dict) or not record.get("id"):
            continue
        title = str(record.get("title", ""))
        summary = str(record.get("summary", ""))
        temporal = record.get("temporal", {})
        metadata = " ".join(str(record.get(key, "")) for key in
                            ("date", "year", "period")) + " " + json.dumps(
            temporal, ensure_ascii=False) + " " + title + " " + summary
        target_years = years(metadata)
        if lead_years and target_years and not (lead_years & target_years):
            continue
        target_sport = sport_of(record.get("sport", ""))
        if lead_sport and target_sport and lead_sport != target_sport:
            continue
        match = record.get("match", {})
        target_scores = score_pairs(title + " " + summary)
        if isinstance(match, dict) and "home_score" in match and "away_score" in match:
            try:
                target_scores.add(tuple(sorted((int(match["home_score"]),
                                               int(match["away_score"])))))
            except (TypeError, ValueError):
                pass
        score_hit = bool(lead_scores & target_scores)
        shared = sorted(lead_terms & key_terms(title + " " + summary))
        year_hit = bool(lead_years & target_years)
        sport_hit = bool(lead_sport and target_sport == lead_sport)
        if not score_hit and len(shared) < (2 if year_hit else 3):
            continue
        strength = (5 if score_hit else 0) + (3 if year_hit else 0) + (
            2 if sport_hit else 0) + min(len(shared), 4)
        found.append({
            "id": record["id"],
            "internal_provisional_id": record.get("internal_provisional_id", False),
            "title": title,
            "type": kind,
            "strength": strength,
            "signals": {
                "matching_years": sorted(lead_years & target_years),
                "matching_score": score_hit,
                "matching_sport": sport_hit,
                "shared_terms": shared[:6],
            },
            "status": "possible_overlap_requires_review",
        })
    return sorted(found, key=lambda x: (-x["strength"], str(x["id"])))[:8]


def name_occurs(name_tokens, text_tokens):
    """Allow the common Greek nominative -ς to accusative ending change only."""
    if not name_tokens or len(text_tokens) < len(name_tokens):
        return False
    for offset in range(len(text_tokens) - len(name_tokens) + 1):
        actual = text_tokens[offset:offset + len(name_tokens)]
        if all(a == b or (b.endswith("σ") and a == b[:-1])
               for a, b in zip(actual, name_tokens)):
            return True
    return False


def person_candidates(excerpt, people):
    text_tokens = words(excerpt)
    groups = {}
    for p in people:
        if not isinstance(p, dict) or not p.get("id") or not p.get("name"):
            continue
        name_tokens = words(p["name"])
        name = " ".join(name_tokens)
        if len(name_tokens) < 2 or len(name) < 8:
            continue
        if name_occurs(name_tokens, text_tokens):
            groups.setdefault(name, []).append({"id": p["id"], "name": p["name"]})
    return [
        {"candidates": matches, "status": (
            "homonym_requires_review" if len(matches) > 1 else "exact_name_candidate"
        )}
        for _, matches in sorted(groups.items())
    ]



def normalize_collection(data, kind):
    """Project varied *public* archives into a read-only matching index.

    Synthetic story IDs are internal suggestions, never URLs or publication IDs.
    Quoted interview answers are intentionally not treated as verified facts.
    """
    configs = {
        "interview": "items",
        "story": "stories",
        "moment": "moments",
        "museum": "articles",
    }
    if kind not in configs:
        raise ValueError("Unknown archive collection")
    records = data.get(configs[kind], [])
    if not isinstance(records, list):
        raise ValueError("Invalid archive collection")
    normalized = []
    for position, raw in enumerate(records):
        if not isinstance(raw, dict):
            continue
        title = str(raw.get("title") or raw.get("name") or "")
        identifier = raw.get("id")
        provisional = identifier is None and kind == "story"
        if provisional:
            digest = hashlib.sha256(title.encode("utf-8")).hexdigest()[:12]
            identifier = "story-title-" + digest
        if identifier is None or not title:
            continue
        if kind == "interview":
            summary = str(raw.get("event") or raw.get("context") or "")
        elif kind == "story":
            summary = str(raw.get("lead") or "")
        elif kind == "moment":
            paragraphs = raw.get("body", [])
            summary = " ".join(map(str, paragraphs[:1])) if isinstance(paragraphs, list) else ""
        else:
            markup = str(raw.get("html", ""))
            # Summaries are only for suggesting related *existing* archive entries.
            summary = html.unescape(
                re.sub(r"<[^>]+>", " ", markup))[:500]
        summary = re.sub(r"\s+", " ", summary).strip()[:500]
        normalized.append({
            "id": identifier,
            "title": title,
            "summary": summary,
            "year": str(raw.get("year") or ""),
            "period": str(raw.get("period") or ""),
            "sport": str(raw.get("sport") or ""),
            "internal_provisional_id": provisional,
            "archive_position": position if provisional else None,
        })
    return normalized


def reconcile(leads, news, events, people, collections=None):
    if leads.get("privacy") != "internal_only":
        raise ValueError("Contribution leads must be private/internal")
    collections = collections or {}
    converted = {
        kind: normalize_collection(collections.get(kind, {}), kind)
        for kind in ("interview", "story", "moment", "museum")
    }
    output = []
    for lead in leads.get("research_leads", [])[:40]:
        if not isinstance(lead, dict):
            continue
        excerpt = str(lead.get("excerpt", ""))[:1000]
        output.append({
            "lead_id": lead.get("id"),
            "news_candidates": candidate_matches(lead, news.get("items", []), "news"),
            "event_candidates": candidate_matches(lead, events.get("events", []), "event"),
            "person_candidates": person_candidates(excerpt, people.get("people", [])),
            "interview_candidates": candidate_matches(lead, converted["interview"], "interview"),
            "story_candidates": candidate_matches(lead, converted["story"], "story"),
            "moment_candidates": candidate_matches(lead, converted["moment"], "moment"),
            "museum_candidates": candidate_matches(lead, converted["museum"], "museum"),
            "verification_status": "pending",
            "editor_approval_status": "pending",
            "publishable": False,
        })
    return {
        "schema_version": 1,
        "privacy": "internal_only",
        "publication_scope": "none",
        "note": "Suggestions only: no match is an established duplicate or verified biography.",
        "matches": output,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("leads", type=Path)
    parser.add_argument("--news", type=Path, default=ROOT / "news.json")
    parser.add_argument("--events", type=Path,
                        default=ROOT / "rebuild/research/historical-events.json")
    parser.add_argument("--people", type=Path, default=ROOT / "hall-of-fame-people.json")
    parser.add_argument("--interviews", type=Path,
                        default=ROOT / "rebuild/data/interviews.json")
    parser.add_argument("--stories", type=Path,
                        default=ROOT / "rebuild/data/stories.json")
    parser.add_argument("--moments", type=Path,
                        default=ROOT / "rebuild/data/moments.json")
    parser.add_argument("--museum", type=Path,
                        default=ROOT / "rebuild/data/museum.json")
    args = parser.parse_args()
    def read(path):
        return json.loads(path.read_text(encoding="utf-8"))
    collections = {
        "interview": read(args.interviews),
        "story": read(args.stories),
        "moment": read(args.moments),
        "museum": read(args.museum),
    }
    result = reconcile(read(args.leads), read(args.news),
                       read(args.events), read(args.people), collections)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
