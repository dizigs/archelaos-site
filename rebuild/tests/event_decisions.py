#!/usr/bin/env python3
"""Owner gates, stale fingerprints and source conflicts must be enforced."""
import copy,importlib.util,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
from event_triage import fingerprint
spec=importlib.util.spec_from_file_location("decisions",ROOT/"tools/review_event_decisions.py")
assert spec and spec.loader
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
data=json.loads((ROOT/"research/historical-events.json").read_text(encoding="utf-8"))

def plan(event_id,action="approve",reason="Επαλήθευση επίσημης πηγής και απόφαση υπευθύνου αρχείου."):
 return {"schema_version":1,"authorization":"explicit_owner_decision",
         "dataset_fingerprint":fingerprint(data),
         "decisions":[{"event_id":event_id,"action":action,"reason":reason}]}

def refused(message,proposal):
 try:m.enact(data,proposal)
 except ValueError:return
 raise AssertionError("Should refuse "+message)

def main():
 requested="arc-multisport-honours-2022"
 updated,actions=m.enact(data,plan(requested))
 assert updated["events"][14]["editorial_status"]=="approved" and len(actions)==1
 assert len(data.get("editorial_decisions",[]))==0
 refused("historic contradiction",plan("arc-handball-borec-home-1994"))
 refused("missing evidence",plan("arc-archery-national-championship-2026"))
 refused("stale data",{**plan(requested),"dataset_fingerprint":"bad"})
 refused("no explicit authorization",{**plan(requested),"authorization":"automatic"})
 refused("duplicate IDs",{**plan(requested),"decisions":plan(requested)["decisions"]*2})
 rejected,log=m.enact(data,plan("arc-archery-national-championship-2026","reject"))
 assert any(e.get("editorial_status")=="rejected" for e in rejected["events"])
 assert len(log)==1
 print("OWNER DECISION QA OK: no auto approval, stale/blocked/duplicate rejection, dry-run default.")
if __name__=="__main__":main()
