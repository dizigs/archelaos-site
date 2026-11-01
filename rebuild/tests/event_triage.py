#!/usr/bin/env python3
"""Suggestions are non-binding; contradictions cannot become approved by scoring."""
import copy,importlib.util,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("triage",ROOT/"tools/event_triage.py")
assert spec and spec.loader
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
def main():
    data=json.loads((ROOT/"research/historical-events.json").read_text(encoding="utf-8"))
    r=mod.assess(data)
    assert len(r["rows"])==len(data["events"])
    assert len({x["id"] for x in r["rows"]})==len(r["rows"])
    assert r["owner_decides"] and r["advisory_only"]
    assert all(x["existing_status"]!="approved" for x in r["rows"])
    flagged=next(x for x in r["rows"] if x["id"]=="arc-handball-borec-home-1994")
    assert flagged["recommendation"]=="hold_for_evidence"
    revised=copy.deepcopy(data)
    revised["source_registry"][0]["url"]="https://example.org/changed"
    assert mod.fingerprint(revised)!=mod.fingerprint(data)
    assert "Εσωτερική λίστα" in mod.markdown(r)
    print("EVENT TRIAGE QA OK: stable IDs, source fingerprint, warnings, owner-only decision.")
if __name__=="__main__":main()
