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
    print("Dataset stays research-only and is excluded from dist/.")


if __name__=="__main__":
    main()
