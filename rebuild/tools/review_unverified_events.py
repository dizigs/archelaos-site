#!/usr/bin/env python3
"""Human-readable, review-only queue of unverified historical claims by sport.

Does not publish content, update biographies, scrape the web or resolve flags.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from collections import Counter

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/"research"/"historical-events.json"

def report(data):
    names={r["id"]:r["label"] for r in data["department_registry"]}
    queue=data["research_queue"]
    groups={key:[] for key in names}
    for item in queue:
        groups[item["sport"]].append({
            "id":item["id"],"issue":item["issue"],
            "required_evidence":item["required_evidence"],
            "status":item["status"],
            "source_urls":[s["url"] for s in data["source_registry"]
                if s["id"] in item.get("source_ids",[])]
        })
    coverage={key:{"documented":0,"sport_specific":0} for key in names}
    for e in data["events"]:
        for sport in e.get("sports",[e["sport"]]):
            coverage[sport]["documented"]+=1
        if e["sport"] in names:
            coverage[e["sport"]]["sport_specific"]+=1
    return {
      "status":"research_review_only; not public website",
      "departments":[{
        "sport":k,"label":names[k],
        "documented_events_including_multisport":coverage[k]["documented"],
        "independent_sport_events":coverage[k]["sport_specific"],
        "unverified_count":len(groups[k]),"unverified_items":groups[k]
      }for k in names],
      "historical_conflicts":[{"id":x["id"],"issue":x["issue"],
        "required_review":x["suggestion"],"source_ids":x["source_ids"],
        "moment_id":x["moment_id"]} for x in data["review_flags"]],
      "warning":"Absence of a verified event does not mean absence of sporting activity or achievement."
    }

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--json",type=Path)
    args=p.parse_args()
    data=json.loads(SRC.read_text(encoding="utf-8"))
    info=report(data)
    if args.json:
        args.json.parent.mkdir(parents=True,exist_ok=True)
        args.json.write_text(json.dumps(info,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    for group in info["departments"]:
        print(group["label"],":",group["independent_sport_events"],"αυτοτελή τεκμηριωμένα γεγονότα,",
              group["unverified_count"],"θέματα προς έλεγχο")
        for item in group["unverified_items"]:
            print("  •",item["id"],"—",item["required_evidence"])
    print("Historical conflicts:",len(info["historical_conflicts"]))
    print("Review only — nothing published or automatically linked.")

if __name__=="__main__":
    main()
