#!/usr/bin/env python3
"""Generate a deterministic, non-deployed index from approved events and public news.

Only explicit, valid IDs create Event <-> Article <-> Person links.
Public research marked merely 'source_checked' is NOT editorially approved.
Missing/ambiguous IDs and unrelated articles are returned as diagnostics,
never connected by loose title/year similarity or inferred identity.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from build_event_graph import compile_graph
from build_archive_links import link_proposals

ROOT = Path(__file__).resolve().parents[1]
DEFAULT = ROOT / "test-artifacts/canonical-archive-index.json"


def _unique_records(records: list[dict], kind: str) -> dict:
    output = {}
    for item in records:
        if not isinstance(item, dict):
            continue
        identifier = item.get("id")
        if not isinstance(identifier, str) or not identifier:
            raise ValueError("Invalid " + kind + " ID")
        if identifier in output:
            raise ValueError("Duplicate " + kind + " ID: " + identifier)
        output[identifier] = item
    return output


def build_index(events: dict, news: dict, hall: dict, collections: dict | None = None) -> dict:
    people = _unique_records(hall.get("people", []), "person")
    articles = _unique_records(news.get("items", []), "news article")
    event_rows = _unique_records(events.get("events", []), "historical event")
    approved = compile_graph(events, list(people.values()))
    approved_by_id = {event["id"]: event for event in approved["events"]}

    person_articles = {}
    person_events = {p: sorted(set(refs)) for p, refs in approved["by_person"].items()}
    article_events = {}
    event_articles = {eid: [] for eid in approved_by_id}
    article_index = {}
    unresolved_people = []
    unresolved_events = []
    duplicate_source_urls = {}
    for aid, article in sorted(articles.items()):
        declared = article.get("personIds", [])
        if not isinstance(declared, list):
            raise ValueError("Invalid personIds on news article " + aid)
        linked_people = []
        for pid in declared:
            if not isinstance(pid, str):
                continue
            if pid not in people:
                unresolved_people.append({"article_id": aid, "person_id": pid})
                continue
            if pid not in linked_people:
                linked_people.append(pid)
                person_articles.setdefault(pid, []).append(aid)
        linked_people.sort()
        linked_events = []
        explicit = article.get("eventIds", [])
        if article.get("eventId"):
            explicit = [article["eventId"], *explicit] if isinstance(explicit, list) else [article["eventId"]]
        if not isinstance(explicit, list):
            raise ValueError("Invalid eventIds on news article " + aid)
        for eid in explicit:
            if not isinstance(eid, str):
                continue
            if eid not in approved_by_id:
                unresolved_events.append({"article_id": aid, "event_id": eid,
                                          "reason": "not_approved_or_unknown"})
                continue
            if eid not in linked_events:
                linked_events.append(eid)
                event_articles[eid].append(aid)
        linked_events.sort()
        article_events[aid] = linked_events
        url = article.get("sourceUrl")
        if isinstance(url, str) and url.startswith(("https://", "http://")):
            duplicate_source_urls.setdefault(url.strip(), []).append(aid)
        article_index[aid] = {
            "id": aid, "title": str(article.get("title", "")),
            "date": article.get("date"), "sport": article.get("sport"),
            "source_url": url if isinstance(url, str) else None,
            "person_ids": linked_people, "event_ids": linked_events,
        }

    event_index = {}
    timeline = []
    for eid, event in sorted(approved_by_id.items()):
        full = event_rows[eid]
        temporal = event.get("temporal", {})
        date_label = next((temporal.get(k) for k in ("date", "season", "year", "period")
                           if temporal.get(k)), None)
        event_index[eid] = {
            **event,
            "article_ids": sorted(event_articles.get(eid, [])),
            "person_ids": sorted(set(approved["by_event"].get(eid, []))),
            "editorial_status": "approved",
        }
        timeline.append({
            "event_id": eid, "title": event["title"], "date_label": date_label,
            "temporal": temporal, "sport": event["sport"],
            "detail_ref": eid, "popup_only": True,
        })
    timeline.sort(key=lambda x: (
        str(x["date_label"] or ""), x["event_id"]
    ))
    excluded = sorted(set(event_rows) - set(approved_by_id))
    archive_links = link_proposals(hall, {"news": news, **(collections or {})})
    source_collisions = [{
        "url": url, "article_ids": sorted(ids),
    } for url, ids in sorted(duplicate_source_urls.items()) if len(ids) > 1]
    return {
        "schema_version": 1,
        "publication_scope": "preview_only",
        "note": "Only explicit approved relations; not deployed or auto-published.",
        "events": event_index,
        "articles": article_index,
        "person_to_articles": {p: sorted(a) for p, a in sorted(person_articles.items())},
        "person_to_events": {p: sorted(a) for p, a in sorted(person_events.items())},
        "article_to_events": article_events,
        "event_to_articles": {e: sorted(a) for e, a in sorted(event_articles.items())},
        "timeline_cards": timeline,
        "archive_record_to_people": archive_links["people_by_record"],
        "person_to_archive_records": archive_links["records_by_person"],
        "unresolved_archive_person_ids": archive_links["missing_canonical_ids"],
        "excluded_event_ids": excluded,
        "unresolved_person_references": sorted(
            unresolved_people, key=lambda v: (v["article_id"], v["person_id"])),
        "unresolved_event_references": sorted(
            unresolved_events, key=lambda v: (v["article_id"], v["event_id"])),
        "possible_duplicate_source_urls": source_collisions,
        "stats": {
            "approved_event_count": len(event_index),
            "unapproved_or_unresolved_event_count": len(excluded),
            "article_count": len(article_index),
            "timeline_card_count": len(timeline),
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", type=Path, default=DEFAULT)
    args = parser.parse_args()
    destination = args.json.resolve()
    if (not destination.is_relative_to((ROOT / "test-artifacts").resolve())
            or destination.suffix != ".json"):
        parser.error("Output must stay under gitignored rebuild/test-artifacts/*.json")
    def load(relative):
        return json.loads((ROOT.parent / relative).read_text(encoding="utf-8"))
    payload = build_index(
        load("rebuild/research/historical-events.json"),
        load("news.json"), load("hall-of-fame-people.json"),
        {"interview": load("rebuild/data/interviews.json"),
         "story": load("rebuild/data/stories.json"),
         "moment": load("rebuild/data/moments.json"),
         "museum": load("rebuild/data/museum.json")}
    )
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
                           encoding="utf-8")
    print("ARCHIVE INDEX (NOT DEPLOYED):", json.dumps(payload["stats"],
                                                  ensure_ascii=False))


if __name__ == "__main__":
    main()
