#!/usr/bin/env python3
"""Read-only sport launch gate audit. Never claims DNS or deployment from PR checks."""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
ALLOWED={"not-checked","blocked","verified"}

def assess(registry,matrix):
    keys={d["key"] for d in registry["departments"]}
    required=matrix.get("requiredGates",[])
    errors=[]
    if matrix.get("schemaVersion")!=1 or not required or len(required)!=len(set(required)):
        errors.append("invalid gate list/version")
    if set(matrix.get("departments",{}))!=keys:
        errors.append("sport set mismatch")
    result={}
    for sport in registry["departments"]:
        key=sport["key"]
        gates=matrix.get("departments",{}).get(key,{}).get("gates",{})
        if set(gates)!=set(required):
            errors.append(key+": missing or extra gates")
        passed=[]
        for name in required:
            x=gates.get(name,{})
            if not isinstance(x,dict) or x.get("status") not in ALLOWED:
                errors.append(key+":"+name+": invalid status")
                continue
            if x["status"]=="verified":
                if not isinstance(x.get("checkedAt"),str) or not isinstance(x.get("evidenceUrl"),str) or not x["evidenceUrl"].startswith("https://"):
                    errors.append(key+":"+name+": no evidence")
                else:
                    passed.append(name)
            elif x.get("checkedAt") is not None or x.get("evidenceUrl") is not None:
                errors.append(key+":"+name+": unexpected evidence")
        result[key]={"verified":len(passed),"total":len(required),"ready":len(passed)==len(required)}
        if sport.get("themeStatus")!="approved-archery-only" and "brand_approved" in passed:
            errors.append(key+": brand approval not in registry")
    if errors:
        for item in result.values():
            item["ready"]=False
    return errors,result

if __name__=="__main__":
    registry=json.loads((ROOT/"config/sport-sites.json").read_text(encoding="utf-8"))
    matrix=json.loads((ROOT/"config/sport-launch-readiness.json").read_text(encoding="utf-8"))
    errors,report=assess(registry,matrix)
    for sport,info in sorted(report.items()):
        print(f"{sport}: {info['verified']}/{info['total']} verified gates; ready={info['ready']}")
    if errors:
        raise SystemExit("\n".join(errors))
    print("PASS: evidence format valid; no deployment, DNS, analytics or telemetry checks performed")
