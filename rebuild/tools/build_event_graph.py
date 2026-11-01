#!/usr/bin/env python3
"""Build a reciprocal person↔event graph from editor-approved public research ONLY.

Unapproved, disputed or unresolved records are excluded. Output stays in
gitignored test-artifacts, never directly inside the deployed website.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT = ROOT / "test-artifacts/approved-event-graph.json"

def compile_graph(catalog: dict, people: list[dict]) -> dict:
    persons = {p["id"]: p for p in people}
    sources = {s["id"]: s for s in catalog["source_registry"]}
    unresolved_events = {x.get("event_id") for x in catalog.get("research_queue", []) if x.get("event_id")}
    disputed_moments = {x["moment_id"] for x in catalog.get("review_flags", []) if x.get("status") == "requires_human_review"}
    records = []
    by_person: dict[str,list[str]] = {}
    for item in catalog["events"]:
        if item.get("editorial_status") != "approved" or item["id"] in unresolved_events:
            continue
        if any(mid in disputed_moments for mid in item.get("associations", {}).get("moment_ids", [])):
            continue
        if not item.get("source_ids") or any(s not in sources for s in item["source_ids"]):
            continue
        relations = item.get("associations", {}).get("people", [])
        if any(r.get("person_id") not in persons or r.get("source_id") not in item["source_ids"]
               for r in relations):
            continue
        named = []
        for r in relations:
            pid = r["person_id"]
            named.append({"id":pid,"name":persons[pid]["name"],"role":r["role"]})
            by_person.setdefault(pid, []).append(item["id"])
        records.append({
            "id":item["id"],"title":item["title"],"summary":item["summary"],
            "sport":item["sport"],"sports":item.get("sports",[item["sport"]]),
            "temporal":item["temporal"],"people":named,
            "moment_ids":item.get("associations",{}).get("moment_ids",[]),
            "sources":[{"title":sources[s]["title"],"provider":sources[s]["provider"],
                        "url":sources[s]["url"]} for s in item["source_ids"]]
        })
    records.sort(key=lambda e:e["id"])
    return {"schema_version":1,"publication_scope":"approved_only",
            "events":records,"by_person":{k:sorted(v) for k,v in sorted(by_person.items())},
            "by_event":{e["id"]:[x["id"] for x in e["people"]] for e in records}}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--json",type=Path,default=DEFAULT)
    args=p.parse_args()
    dst=args.json.resolve()
    if not dst.is_relative_to((ROOT/"test-artifacts").resolve()) or dst.suffix!=".json":
        raise SystemExit("Export is restricted to gitignored rebuild/test-artifacts/*.json")
    catalogue=json.loads((ROOT/"research/historical-events.json").read_text(encoding="utf-8"))
    persons=json.loads((ROOT/"data/people.json").read_text(encoding="utf-8"))["people"]
    graph=compile_graph(catalogue,persons)
    dst.parent.mkdir(parents=True,exist_ok=True)
    dst.write_text(json.dumps(graph,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("APPROVED EVENT GRAPH:",len(graph["events"]),"events,",len(graph["by_person"]),
          "people linked; output is not publicly deployed.")

if __name__=="__main__":main()
