#!/usr/bin/env python3
"""Compare live main and rebuild editorial data; detect unsynchronized emergency edits.

Read-only Git inspection. No network, no writes except an optional JSON report.
Requires: git fetch origin main:refs/remotes/origin/main
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[2]
STAGE=ROOT/"rebuild"

def live_json(ref,path):
    content=subprocess.check_output(["git","-C",str(ROOT),"show",f"{ref}:{path}"],text=True)
    return json.loads(content)

def live_text(ref,path):
    return subprocess.check_output(["git","-C",str(ROOT),"show",f"{ref}:{path}"],text=True)

def report(ref="origin/main"):
    live=live_json(ref,"hall-of-fame-people.json")
    livepeople=live if isinstance(live,list) else live["people"]
    staged=json.loads((STAGE/"data/people.json").read_text(encoding="utf-8"))["people"]
    main={person["id"]:person for person in livepeople}
    draft={person["id"]:person for person in staged}
    changes=[]
    for pid in sorted(set(main)|set(draft)):
        if pid not in main:changes.append({"id":pid,"issue":"missing_live"});continue
        if pid not in draft:changes.append({"id":pid,"issue":"missing_rebuild"});continue
        fields=[k for k in ("name","name_en","bio","bio_en") if main[pid].get(k)!=draft[pid].get(k)]
        if fields:changes.append({"id":pid,"issue":"text_differs","fields":fields})
    # Historic, verified editorial decisions from our own correction ledger.
    ledger=json.loads((STAGE/"data/editorial-corrections.json").read_text(encoding="utf-8"))["changes"]
    board=live_text(ref,"board.html")
    stagedboard=json.loads((STAGE/"data/board.json").read_text(encoding="utf-8"))["eras"]
    failures=[]
    for edit in ledger:
        if edit["kind"]=="person":
            l=main.get(edit["id"])
            s=draft.get(edit["id"])
            for replacement in edit["replacements"]:
                k=replacement["field"]
                expected=replacement["after"]
                if not l or expected not in l.get(k,""):
                    failures.append(f"main person {edit['id']} {k} lacks reviewed correction")
                if not s or expected not in s.get(k,""):
                    failures.append(f"rebuild person {edit['id']} {k} lacks reviewed correction")
        if edit["kind"]=="board":
            era=next((x for x in stagedboard if x["id"]==edit["id"]),None)
            for change in edit["replacements"]:
                expected=change["after"]
                if expected not in board:
                    failures.append("main board lacks "+edit["key"])
                if era is None or expected not in era.get(change["field"],""):
                    failures.append("rebuild board lacks "+edit["key"])
    return {
        "compare":ref+" vs rebuild/clean-foundation",
        "live_people":len(livepeople),"rebuilt_people":len(staged),
        "different_people":len(changes),"changes":changes[:120],
        "change_list_truncated":len(changes)>120,
        "reviewed_corrections":len(ledger),"critical_mismatches":failures
    }

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--ref",default="origin/main")
    p.add_argument("--json",type=Path)
    p.add_argument("--strict-reviewed",action="store_true")
    args=p.parse_args()
    result=report(args.ref)
    print(f"LIVE SYNC: {result['different_people']} biography differences,"
          f" {len(result['critical_mismatches'])} missing reviewed corrections.")
    for line in result["critical_mismatches"]:print("CRITICAL:",line)
    for row in result["changes"][:12]:print("REVIEW:",row)
    if args.json:
        args.json.parent.mkdir(parents=True,exist_ok=True)
        args.json.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    if args.strict_reviewed and result["critical_mismatches"]:
        raise SystemExit(1)

if __name__=="__main__":main()
