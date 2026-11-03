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
import os
from pathlib import Path
import secrets
import stat

if __package__:
    from .public_snapshot import output_directory
else:
    from public_snapshot import output_directory

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/"research/historical-events.json"
REPORT_DIR=ROOT/"test-artifacts"
REPORT_NAMES=("event-review-queue.json","event-review-queue.md")
JSON_CHOICE="rebuild/test-artifacts/event-review-queue.json"
MARKDOWN_CHOICE="rebuild/test-artifacts/event-review-queue.md"

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

def validate_destinations(directory):
    # Check both before writing either report. Never follow a destination link.
    for name in REPORT_NAMES:
        try:
            existing=os.stat(name,dir_fd=directory,follow_symlinks=False)
        except FileNotFoundError:
            continue
        if not stat.S_ISREG(existing.st_mode) or existing.st_nlink!=1:
            raise ValueError("Triage reports must be ordinary, non-linked files")

def write_report(directory,name,payload):
    if name not in REPORT_NAMES:
        raise ValueError("Triage report filename is not allowlisted")
    temporary=".event-triage-"+secrets.token_hex(12)+".tmp"
    descriptor=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,
                       0o600,dir_fd=directory)
    try:
        with os.fdopen(descriptor,"w",encoding="utf-8") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary,name,src_dir_fd=directory,dst_dir_fd=directory)
        os.fsync(directory)
    finally:
        try:
            os.unlink(temporary,dir_fd=directory)
        except FileNotFoundError:
            pass

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--json",choices=(JSON_CHOICE,),default=JSON_CHOICE,
                   help="Fixed checkout-relative JSON report; arbitrary paths are rejected")
    p.add_argument("--markdown",choices=(MARKDOWN_CHOICE,),default=MARKDOWN_CHOICE,
                   help="Fixed checkout-relative Markdown report; arbitrary paths are rejected")
    p.parse_args()
    try:
        with output_directory(("rebuild","test-artifacts")) as directory:
            validate_destinations(directory)
            data=json.loads(SOURCE.read_text(encoding="utf-8"))
            report=assess(data)
            write_report(directory,"event-review-queue.json",
                         json.dumps(report,ensure_ascii=False,indent=2)+"\n")
            write_report(directory,"event-review-queue.md",markdown(report))
    except (OSError,ValueError) as error:
        p.exit(2,"EVENT TRIAGE failed ("+type(error).__name__+
               "): check the public catalog and fixed report locations.\n")
    print("EDITORIAL TRIAGE:",len(report["rows"]),"events;",report["summary"],
          "— OWNER DECISION REQUIRED, NO AUTOMATIC APPROVAL.")

if __name__=="__main__":main()
