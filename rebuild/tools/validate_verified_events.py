#!/usr/bin/env python3
"""Validate researched sports-history event records without publishing them."""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import date
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

REBUILD = Path(__file__).resolve().parents[1]
SOURCE = REBUILD / "research" / "historical-events.json"
PERSONS = REBUILD / "data" / "people.json"
MOMENTS = REBUILD / "data" / "moments.json"

def fail(message):
    raise ValueError(message)


def validate(catalog: dict, people: list[dict], moments: list[dict]) -> dict:
    if catalog.get("schema_version") != 1:
        fail("Unsupported research event schema")
    if catalog.get("policies", {}).get("automatic_publication") is not False:
        fail("Automatic publication must stay disabled")
    if catalog.get("policies", {}).get("news_scraping") is not False:
        fail("News scraping is not authorized")
    if catalog.get("policies", {}).get("strict_evidence_only") is not True:
        fail("The strict source-evidence policy must be enabled")
    if catalog.get("policies", {}).get("no_auto_write_to_biographies") is not True:
        fail("Do not auto-update biographies from research")
    registry = catalog.get("department_registry", [])
    expected = {"handball", "track", "archery", "shooting", "gymnastics",
                "volleyball", "wrestling", "swimming", "basketball"}
    if {d.get("id") for d in registry} != expected or len(registry) != len(expected):
        fail("All 8 current departments + historic basketball must remain represented")

    sources = catalog.get("source_registry")
    events = catalog.get("events")
    flags = catalog.get("review_flags")
    if not isinstance(sources,list) or not sources or not isinstance(events,list) or not events:
        fail("Expected documented sources and events")
    if not isinstance(flags,list):
        fail("Review flags must be a list")
    by_source = {}
    for source in sources:
        sid=source.get("id")
        if not re.fullmatch(r"[a-z][a-z0-9-]{5,90}",sid or "") or sid in by_source:
            fail("Missing/duplicate source ID")
        parsed=urlsplit(source.get("url",""))
        if parsed.scheme!="https" or not parsed.hostname or parsed.username or parsed.password:
            fail("Sources require a public HTTPS URL")
        host=parsed.hostname.lower()
        if (host in {"drive.google.com","docs.google.com","localhost","127.0.0.1"} or
            host.endswith(".internal") or "token=" in parsed.query.lower()):
            fail("Private/source credential URLs forbidden")
        if not source.get("title") or not source.get("provider") or not source.get("kind"):
            fail("Incomplete source attribution")
        date.fromisoformat(source.get("checked_on",""))
        by_source[sid]=source
    person_by_id = {p["id"]:p for p in people}
    moment_ids = {m["id"] for m in moments}
    if len(person_by_id)!=len(people) or len(moment_ids)!=len(moments):
        fail("Original records contain duplicate IDs")
    by_event = {}
    links = 0
    for e in events:
        eid=e.get("id")
        if not re.fullmatch(r"arc-[a-z0-9-]{8,100}",eid or "") or eid in by_event:
            fail("Duplicate/invalid event ID")
        if e.get("verification")!="source_checked":
            fail("Unreviewed or fictional verification level")
        if not e.get("sport") or not e.get("event_type") or not e.get("title"):
            fail("Event kind/title/sport missing")
        sport = e.get("sport")
        sports = e.get("sports", [sport])
        if not isinstance(sports, list) or not sports or len(sports) != len(set(sports)):
            fail("Event needs valid unique department coverage")
        if any(s not in expected for s in sports):
            fail("Event claims an unknown sports department")
        if sport == "multisport" and len(sports) < 2:
            fail("Multisport events must actually cover multiple departments")
        if sport != "multisport" and sports != [sport]:
            fail("A single sport cannot silently claim other departments")

        if not isinstance(e.get("summary"),str) or not 15<=len(e["summary"])<=750:
            fail("Missing/oversized event summary")
        temporal=e.get("temporal",{})
        if temporal.get("precision")=="day":
            if "season" in temporal:
                fail("Day must not include vague season")
            date.fromisoformat(temporal["date"])
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}",temporal["date"]):
                fail("Event date must be explicit ISO day")
        elif temporal.get("precision")=="season":
            if "date" in temporal or not re.fullmatch(r"\d{4}[–-]\d{4}",temporal.get("season","")):
                fail("Season must be explicit, never invented date")
        elif temporal.get("precision")=="year":
            if set(temporal)!={"precision","year"} or type(temporal["year"]) is not int or not 1956<=temporal["year"]<=2026:
                fail("Year-only events may not invent a month or day")
        else:
            fail("Date precision missing")
        sources_used=e.get("source_ids")
        if not isinstance(sources_used,list) or not sources_used or len(set(sources_used))!=len(sources_used):
            fail("Event needs unique actual sources")
        if any(sid not in by_source for sid in sources_used):
            fail("Event source has no registry entry")
        assoc=e.get("associations",{})
        associated_moments=assoc.get("moment_ids",[])
        if len(associated_moments)!=len(set(associated_moments)) or any(mid not in moment_ids for mid in associated_moments):
            fail("Event refers to missing or repeated historical moment")
        seen=set()
        for linked in assoc.get("people",[]):
            pid=linked.get("person_id")
            if pid in seen or pid not in person_by_id:
                fail("Duplicate or unknown Hall of Fame person")
            if linked.get("name")!=person_by_id[pid].get("name"):
                fail("Person full name must match canonical Hall of Fame record")
            if linked.get("source_id") not in sources_used:
                fail("Person link requires direct citation to event source")
            if not linked.get("role") or not linked.get("evidence"):
                fail("Person relation requires explicit role and evidence")
            if len(linked["evidence"])>350:
                fail("Person link evidence too long")
            seen.add(pid)
            links+=1
        match=e.get("match")
        if match is not None:
            if not isinstance(match,dict) or not all(
                isinstance(match.get(k),str) and match[k] for k in ("home","away")
            ) or not all(type(match.get(k)) is int and match[k]>=0
                         for k in ("home_score","away_score")):
                fail("Invalid match identity/score")
        by_event[eid]=e

    queue=catalog.get("research_queue")
    if not isinstance(queue,list):
        fail("Unverified claims must be tracked in a separate research queue")
    queue_ids=set()
    for item in queue:
        qid=item.get("id")
        if not qid or qid in queue_ids or item.get("sport") not in expected:
            fail("Invalid or duplicated research queue item")
        if item.get("status") not in {"needs_identity_evidence", "needs_sport_specific_source", "needs_source_reconciliation"}:
            fail("An unverified queue item must stay pending until reviewed")
        if item.get("event_id") and item["event_id"] not in by_event:
            fail("Unverified queue references an unknown event")
        if not item.get("required_evidence") or not item.get("issue"):
            fail("Unverified item must explain the missing proof")
        if any(x not in by_source for x in item.get("source_ids", [])):
            fail("Queue references an unknown source")
        queue_ids.add(qid)
    sport_specific = Counter()
    mentioned = Counter()
    for event in events:
        for sport_id in event.get("sports",[event["sport"]]):
            mentioned[sport_id]+=1
        if event["sport"]!="multisport":
            sport_specific[event["sport"]]+=1
    flag_ids=set()
    for f in flags:
        fid=f.get("id")
        if not fid or fid in flag_ids or f.get("status")!="requires_human_review":
            fail("Review flag invalid or silently resolved")
        if f.get("moment_id") not in moment_ids:
            fail("Review flag points to missing historical moment")
        if not f.get("issue") or not f.get("suggestion"):
            fail("Review flag missing documentation")
        if not f.get("source_ids") or any(x not in by_source for x in f["source_ids"]):
            fail("Review flags require traced public sources")
        flag_ids.add(fid)
    return {
        "events":len(events), "sources":len(sources),
        "person_links":links, "review_flags":len(flags),
        "years":dict(Counter(str(e["temporal"].get("date",e["temporal"].get("season","")))[:4] for e in events)),
        "unverified_queue":len(queue),
        "sport_coverage":{key:{"documented_events":mentioned[key],"sport_specific_events":sport_specific[key]} for key in sorted(expected)},
        "public_webpage_created":False
    }


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--json",type=Path)
    args=p.parse_args()
    c=json.loads(SOURCE.read_text(encoding="utf-8"))
    people=json.loads(PERSONS.read_text(encoding="utf-8"))["people"]
    moments=json.loads(MOMENTS.read_text(encoding="utf-8"))["moments"]
    result=validate(c,people,moments)
    if args.json:
        args.json.parent.mkdir(parents=True,exist_ok=True)
        args.json.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("HISTORICAL EVENT REGISTER OK:",result["events"],"events,",
          result["sources"],"public sources,",result["person_links"],
          "documented person links,",result["review_flags"],"historical review flags.")
    print("SPORT COVERAGE:",json.dumps(result["sport_coverage"],ensure_ascii=False))
    print("UNVERIFIED:",result["unverified_queue"],"queued for human review; not linked or published.")
    print("Dataset stays research-only and is excluded from dist/.")


if __name__=="__main__":
    main()
