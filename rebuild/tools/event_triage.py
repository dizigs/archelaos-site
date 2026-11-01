#!/usr/bin/env python3
"""Non-binding source triage: owner decides, never accept based on heuristics.

Generates stable event IDs, numbered rows and source/context blockers.
No web request, no raw Drive content, no write to history and no deploy.
"""
from __future__ import annotations
import argparse
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/"research/historical-events.json"
REPORT_DIR=ROOT/"test-artifacts"

def fingerprint(catalog:dict)->str:
    raw=json.dumps(catalog,sort_keys=True,ensure_ascii=False,separators=(",",":"))
    return sha256(raw.encode("utf-8")).hexdigest()

def assess(catalog:dict)->dict:
    sources={s["id"]:s for s in catalog["source_registry"]}
    pending={}
    for q in catalog.get("research_queue",[]):
        if q.get("event_id"):pending.setdefault(q["event_id"],[]).append(q)
    conflicts={}
    for flag in catalog.get("review_flags",[]):
        if flag.get("status")=="requires_human_review":
            conflicts.setdefault(flag["moment_id"],[]).append(flag)
    rows=[]
    for e in catalog["events"]:
        linked=[sources[s] for s in e.get("source_ids",[]) if s in sources]
        blocked=[]
        for q in pending.get(e["id"],[]):
            blocked.append("Missing evidence: "+q.get("issue",""))
        for mid in e.get("associations",{}).get("moment_ids",[]):
            for c in conflicts.get(mid,[]):
                blocked.append("Moment #"+str(mid)+" has unresolved contradiction: "+c["issue"])
        if len(linked)!=len(e.get("source_ids",[])) or not linked:
            blocked.append("Missing or unknown source in registry")
        if e.get("editorial_status")=="rejected":
            blocked.append("Prior editorial rejection")
        kinds={s["kind"] for s in linked}
        if blocked:
            category="hold_for_evidence"
            reason="Εκκρεμούν συγκεκριμένες πηγές, ταυτοποιήσεις ή ιστορικές αντιφάσεις."
        elif "official_federation" in kinds:
            category="candidate_for_owner_review"
            reason="Η καταχώριση παραπέμπει σε επίσημη ομοσπονδία. Ελέγχονται ακόμη οι ακριβείς ισχυρισμοί."
        elif e["event_type"] in {"governance","club_honours"} and "official_municipality" in kinds:
            category="candidate_for_owner_review"
            reason="Η σχετική δημοτική ανακοίνωση μπορεί να τεκμηριώνει τη συγκεκριμένη εκδήλωση."
        elif e["event_type"]=="championship" and "official_municipality" in kinds:
            category="needs_primary_results"
            reason="Χρειάζεται πρωτογενές αποτέλεσμα διοργάνωσης για την ακριβή αγωνιστική διάκριση."
        else:
            category="needs_independent_confirmation"
            reason="Χρειάζεται πρόσθετη διασταύρωση πριν από την τελική έγκριση."
        rows.append({
            "number":len(rows)+1,"id":e["id"],"title":e["title"],
            "sport":e["sport"],"date_or_period":e["temporal"].get("date") or e["temporal"].get("season") or str(e["temporal"].get("year","")),
            "recommendation":category,"explanation":reason,
            "blockers":blocked,
            "sources":[{"id":s["id"],"provider":s["provider"],"url":s["url"],"kind":s["kind"]} for s in linked],
            "existing_status":e.get("editorial_status","awaiting_owner_review"),
            "person_links":len(e.get("associations",{}).get("people",[]))
        })
    return {"schema_version":1,"dataset_fingerprint":fingerprint(catalog),
            "advisory_only":True,"owner_decides":True,"rows":rows,
            "summary":dict(Counter(x["recommendation"] for x in rows))}

def markdown(report:dict)->str:
    labels={"hold_for_evidence":"ΑΝΑΜΟΝΗ / ΑΝΤΙΦΑΣΗ",
            "candidate_for_owner_review":"Προς δική σου αξιολόγηση",
            "needs_primary_results":"Χρειάζεται πρωτογενές αποτέλεσμα",
            "needs_independent_confirmation":"Χρειάζεται διασταύρωση"}
    lines=["# Αρχέλαος · Εσωτερική λίστα γεγονότων προς έλεγχο",
           "","Η πρόταση του εργαλείου **δεν αποτελεί επιβεβαίωση**. Την τελική απόφαση τη λαμβάνει ο υπεύθυνος του αρχείου.",
           "", "Στιγμιότυπο: "+report["dataset_fingerprint"][:16], "",
           "| # | Γεγονός | Σύσταση | Πηγές |", "|---:|---|---|---:|"]
    for x in report["rows"]:
        title=x["title"].replace("|","/").replace("\n"," ")
        lines.append("| "+str(x["number"])+" | "+title+" | "+labels[x["recommendation"]]+" | "+str(len(x["sources"]))+" |")
    lines.extend(["","## Χρειάζονται επιπλέον στοιχεία"])
    for x in report["rows"]:
        if x["blockers"]:
            lines.extend(["", "**"+str(x["number"])+". "+x["id"]+"**",
                           *["- "+b for b in x["blockers"]]])
    lines.extend(["","Για αποφάσεις χρησιμοποιούμε τους **σταθερούς κωδικούς ID**· οι αριθμοί ισχύουν μόνο για το συγκεκριμένο στιγμιότυπο.",""])
    return "\n".join(lines)

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--json",type=Path,default=REPORT_DIR/"event-review-queue.json")
    p.add_argument("--markdown",type=Path,default=REPORT_DIR/"event-review-queue.md")
    args=p.parse_args()
    for path in (args.json,args.markdown):
        dest=path.resolve()
        if not dest.is_relative_to(REPORT_DIR.resolve()):
            raise SystemExit("Reports may only be written into ignored test-artifacts/")
    data=json.loads(SOURCE.read_text(encoding="utf-8"))
    report=assess(data)
    args.json.parent.mkdir(parents=True,exist_ok=True)
    args.markdown.parent.mkdir(parents=True,exist_ok=True)
    args.json.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    args.markdown.write_text(markdown(report),encoding="utf-8")
    print("EDITORIAL TRIAGE:",len(report["rows"]),"events;",report["summary"],
          "— OWNER DECISION REQUIRED, NO AUTOMATIC APPROVAL.")

if __name__=="__main__":main()
