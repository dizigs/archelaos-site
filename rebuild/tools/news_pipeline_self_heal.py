#!/usr/bin/env python3
"""Source-backed news pipeline preflight; fixes only repeated canonical IDs."""
import argparse
from datetime import date
from hashlib import sha256
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]

def check(items,people,root=ROOT):
    known={p["id"] for p in people}; seen=set(); urls={}; events={}; out=[]
    def finding(code,aid,level,detail):
        key=sha256((code+"|"+aid).encode()).hexdigest()[:16]
        out.append(dict(code=code,article_id=aid,level=level,fingerprint=key,detail=detail))
    for item in items:
        aid=str(item.get("id") or "(empty)")
        if aid in seen: finding("DUPLICATE_NEWS_ID",aid,"error","Repeated article ID")
        seen.add(aid)
        url=item.get("sourceUrl") or ""
        if url:
            if not url.startswith("https://"): finding("BAD_SOURCE",aid,"error","Source is not HTTPS")
            key=url.split("#")[0].rstrip("/")
            if key in urls: finding("DUPLICATE_SOURCE",aid,"error","Same source as "+urls[key])
            urls[key]=aid
        links=item.get("personIds") or []
        if not isinstance(links,list) or any(not isinstance(p,str) for p in links):
            finding("BAD_PERSON_IDS",aid,"error","Invalid person list")
            links=[]
        if len(links)!=len(set(links)):
            finding("REPEATED_PERSON_IDS",aid,"repairable","Repeated canonical ID")
        if any(p not in known for p in links):
            finding("UNKNOWN_PERSON",aid,"error","Hall person missing")
        facts=item.get("personFacts") or {}
        if not isinstance(facts,dict) or any(p not in links or not isinstance(f,str) or not f.strip() for p,f in facts.items()) or (facts and not url):
            finding("BAD_PROFILE_FACT",aid,"error","Unlinked or unsourced biography fact")
        eid=item.get("eventId") or "news-"+aid
        if eid in events and events[eid]!=item.get("sport"):
            finding("EVENT_SPORT_CONFLICT",aid,"error","Same event in two sports")
        events[eid]=item.get("sport")
        eventdate=item.get("eventDate")
        if eventdate:
            try: date.fromisoformat(eventdate)
            except (ValueError,TypeError): finding("BAD_EVENT_DATE",aid,"error","Invalid YYYY-MM-DD date")
            if not url: finding("EVENT_WITHOUT_SOURCE",aid,"error","Dated event lacks source")
        photo=item.get("image") or ""
        if photo.startswith("images/news/"):
            path=root/photo
            if ".." in Path(photo).parts or not path.is_file():
                finding("LOCAL_PHOTO_MISSING",aid,"error","Local photo absent")
        elif not photo:
            finding("NO_PHOTO",aid,"warning","Fallback art; not publication-blocking")
    return sorted(out,key=lambda x:(x["code"],x["article_id"]))

def repair(items,people):
    known={p["id"] for p in people}
    changed=[]
    for row in items:
        ids=row.get("personIds")
        if not isinstance(ids,list) or any(not isinstance(p,str) or p not in known for p in ids):continue
        unique=list(dict.fromkeys(ids))
        if len(unique)<len(ids):
            row["personIds"]=unique
            changed.append(row["id"])
    return changed

if __name__=="__main__":
    ap=argparse.ArgumentParser()
    ap.add_argument("--apply-safe",action="store_true")
    ap.add_argument("--report",default="rebuild/test-artifacts/news-pipeline-incidents.json")
    args=ap.parse_args()
    data=json.loads((ROOT/"news.json").read_text("utf-8"))
    people=json.loads((ROOT/"hall-of-fame-people.json").read_text("utf-8"))["people"]
    fixed=repair(data["items"],people) if args.apply_safe else []
    if fixed:(ROOT/"news.json").write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n","utf-8")
    incidents=check(data["items"],people)
    report={"schema_version":1,"checked_articles":len(data["items"]),"fixed":fixed,"incidents":incidents}
    p=Path(args.report);p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n","utf-8")
    blockers=[e for e in incidents if e["level"] in ("error","repairable")]
    print("News pipeline:",len(data["items"]),"articles,",len(incidents),"findings,",len(fixed),"repairs,",len(blockers),"blockers")
    raise SystemExit(1 if blockers else 0)
