#!/usr/bin/env python3
"""Regression: unpublished facts never enter the reciprocal graph."""
import copy,importlib.util,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("event_graph",ROOT/"tools/build_event_graph.py")
assert spec and spec.loader
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def main():
    data=json.loads((ROOT/"research/historical-events.json").read_text(encoding="utf-8"))
    people=json.loads((ROOT/"data/people.json").read_text(encoding="utf-8"))["people"]
    baseline=mod.compile_graph(data,people)
    assert baseline["events"]==[] and baseline["by_person"]=={}, "No approved events should publish automatically"
    sample=copy.deepcopy(data)
    event=next(x for x in sample["events"] if x["id"]=="arc-multisport-honours-2022")
    event["editorial_status"]="approved"
    graph=mod.compile_graph(sample,people)
    assert len(graph["events"])==1
    assert len(graph["by_event"][event["id"]])==4
    for pid in graph["by_event"][event["id"]]:
        assert event["id"] in graph["by_person"][pid]
    sample["research_queue"].append({"event_id":event["id"],"status":"needs_identity_evidence"})
    assert mod.compile_graph(sample,people)["events"]==[]
    other=copy.deepcopy(data)
    disputed=next(e for e in other["events"] if 63 in e["associations"]["moment_ids"])
    disputed["editorial_status"]="approved"
    assert mod.compile_graph(other,people)["events"]==[]
    other=copy.deepcopy(data)
    other["events"][14]["editorial_status"]="approved"
    other["events"][14]["associations"]["people"][0]["person_id"]="arch-unknown"
    assert mod.compile_graph(other,people)["events"]==[]
    print("BIDIRECTIONAL EVENT QA OK: approval gate, reciprocal links, conflict and identity locks.")

if __name__=="__main__":main()
