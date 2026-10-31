#!/usr/bin/env python3
"""Apply a SPECIFIC owner's already-made editorial decision to research JSON.

Dry-run by default. Never accepts reviewer decisions by inference, score,
or unmoderated visitor input. Blocks stale snapshots, unresolved conflicts,
unknown IDs, and operation on the deployed main branch.
"""
from __future__ import annotations

import argparse
import copy
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import tempfile

ROOT=Path(__file__).resolve().parents[1]
CATALOG=ROOT/"research/historical-events.json"
PRIVATE=ROOT/"test-artifacts"
from event_triage import assess, fingerprint

def enact(catalog:dict,plan:dict)->tuple[dict,list[dict]]:
    if plan.get("schema_version")!=1 or plan.get("authorization")!="explicit_owner_decision":
        raise ValueError("A reviewed explicit owner decision is required")
    if plan.get("dataset_fingerprint")!=fingerprint(catalog):
        raise ValueError("Stale research snapshot: regenerate the owner queue first")
    decision_rows=plan.get("decisions")
    if not isinstance(decision_rows,list) or not decision_rows or len(decision_rows)>20:
        raise ValueError("Decision batch must contain 1-20 entries")
    report=assess(catalog)
    current={r["id"]:r for r in report["rows"]}
    result=copy.deepcopy(catalog)
    byid={r["id"]:r for r in result["events"]}
    prior=result.setdefault("editorial_decisions",[])
    used=set();actions=[]
    for record in decision_rows:
        event_id=record.get("event_id")
        action=record.get("action")
        note=record.get("reason","")
        if event_id not in current or event_id in used:
            raise ValueError("Unknown or repeated event ID")
        used.add(event_id)
        if action not in {"approve","reject"} or not isinstance(note,str) or not 12<=len(note.strip())<=800:
            raise ValueError("Each event decision needs action and a meaningful owner reason")
        current_row=current[event_id]
        if action=="approve":
            if current_row["recommendation"]!="candidate_for_owner_review" or current_row["blockers"]:
                raise ValueError("Cannot approve unresolved or insufficiently documented event: "+event_id)
            if current_row["existing_status"]=="rejected":
                raise ValueError("Rejected historical record requires formal re-review")
            status="approved"
        else:
            if current_row["existing_status"]=="approved":
                raise ValueError("Revocation of already approved record needs separate correction procedure")
            status="rejected"
        if current_row["existing_status"]==status:
            raise ValueError("This exact editorial decision was already recorded")
        entry=byid[event_id]
        entry["editorial_status"]=status
        stamp={"event_id":event_id,"action":action,"reason":note.strip(),
               "previous_status":current_row["existing_status"],
               "decision_origin":"explicit_owner_instruction"}
        actions.append(stamp)
    prior.extend(actions)
    return result,actions

def branch_name():
    root=ROOT.parent
    proc=subprocess.run(["git","symbolic-ref","--short","HEAD"],cwd=root,
                        text=True,capture_output=True,check=False)
    return proc.stdout.strip() if proc.returncode==0 else ""

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--decision-file",type=Path,required=True)
    p.add_argument("--apply",action="store_true",help="Write reviewed decisions on isolated branch only")
    args=p.parse_args()
    if not args.decision_file.resolve().is_relative_to(PRIVATE.resolve()):
        raise SystemExit("Decision plan MUST be local-only inside rebuild/test-artifacts/")
    catalog=json.loads(CATALOG.read_text(encoding="utf-8"))
    plan=json.loads(args.decision_file.read_text(encoding="utf-8"))
    updated,actions=enact(catalog,plan)
    print("DECISION PREVIEW:",json.dumps(actions,ensure_ascii=False))
    if not args.apply:
        print("DRY-RUN ONLY. Neither research nor website was changed.")
        return
    if branch_name()!="rebuild/clean-foundation":
        raise SystemExit("Refusing writes outside isolated rebuild/clean-foundation")
    # Ensure source did not change in the meantime.
    current=json.loads(CATALOG.read_text(encoding="utf-8"))
    if fingerprint(current)!=plan["dataset_fingerprint"]:
        raise SystemExit("Research source changed while processing; review again")
    tmp=None
    try:
        with tempfile.NamedTemporaryFile(mode="w",encoding="utf-8",dir=CATALOG.parent,
                                         prefix=".event-decision-",suffix=".json",
                                         delete=False) as f:
            tmp=Path(f.name)
            json.dump(updated,f,ensure_ascii=False,indent=2)
            f.write("\n")
        tmp.replace(CATALOG)
    finally:
        if tmp and tmp.exists():
            tmp.unlink()
    print("OWNER DECISIONS SAVED TO RESEARCH ONLY — no publication, commit or deployment.")

if __name__=="__main__":main()
