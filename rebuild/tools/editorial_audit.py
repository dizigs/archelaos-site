#!/usr/bin/env python3
"""Non-destructive editorial QA of public draft content. No AI or Drive access.

Runs with Python stdlib. Suggestions never rewrite biographies or historic claims.
python rebuild/tools/editorial_audit.py --json rebuild/test-artifacts/editorial-report.json
Use --strict to fail the run only on structural errors (not editorial suggestions).
"""
from __future__ import annotations
import argparse
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
GREEK = re.compile(r"[\u0370-\u03ff\u1f00-\u1fff]")
LATIN = re.compile(r"[A-Za-z]")
META_NOTES = re.compile(r"η προγενέστερη γραφή|η παλαιότερη γραφή|λανθασμένη γραφή|πατήστε για περισσότερα", re.I)

def normal(text):
    return " ".join(re.findall(r"[\w]+", "".join(
        c for c in unicodedata.normalize("NFD",str(text or "").casefold())
        if not unicodedata.combining(c)
    )))

def paragraphs(item):
    if isinstance(item,list):
        return [str(x).strip() for x in item if str(x).strip()]
    return [s.strip() for s in re.split(r"\n\s*\n",str(item or "")) if s.strip()]

def load(file, key):
    return json.loads((DATA/file).read_text(encoding="utf-8"))[key]

def audit():
    people=load("people.json","people")
    moments=load("moments.json","moments")
    stories=load("stories.json","stories")
    report={"scope":"public staged content only","automatic_edits":0,
            "checked":{"biographies":len(people),"moments":len(moments),"stories":len(stories)},
            "issues":[]}
    def issue(level,section,ref,rule,detail):
        report["issues"].append(dict(level=level,section=section,ref=str(ref),rule=rule,detail=detail))
    def check_text(section,ref,key,value,language=None):
        para=paragraphs(value)
        if not para:
            issue("error",section,ref,"missing_text",key+" is empty")
            return
        full="\n\n".join(para)
        if any(c in full for c in ("\ufffd","\u200b","\u2060")):
            issue("review",section,ref,"encoding",key+" contains invisible/replacement characters")
        if re.search(r"[ \t]{3,}",full):
            issue("review",section,ref,"spacing",key+" contains excessive whitespace")
        if language and len(full)>120:
            greek=len(GREEK.findall(full))
            latin=len(LATIN.findall(full))
            total=greek+latin
            if total>=50 and (greek if language=="el" else latin)/total<.66:
                issue("review",section,ref,"language",key+" may use the wrong language")
        if language=="el" and META_NOTES.search(full):
            issue("review",section,ref,"editorial_note",key+" may contain an internal correction note")
        seen=set()
        for p in para:
            n=normal(p)
            if len(n)<100:continue
            if n in seen:
                issue("review",section,ref,"repeat",key+" repeats an entire paragraph")
                break
            seen.add(n)

    ids=set()
    for person in people:
        pid=person.get("id","")
        if not pid or pid in ids:issue("error","biography",pid or "(missing)","duplicate_or_missing_id","person ID missing/repeated")
        ids.add(pid)
        for k,lang in (("name",None),("name_en",None),("bio","el"),("bio_en","en")):
            check_text("biography",pid,k,person.get(k),lang)
        if person.get("name") and "(" in person["name"]:
            # Common name variants are legitimate; flag only, never alter automatically.
            issue("review","biography",pid,"name_parentheses","Check initials/monogram does not include parentheses")
    mid=set()
    for m in moments:
        k=m.get("id","")
        if not k or k in mid:issue("error","moment",k,"duplicate_or_missing_id","moment ID missing/repeated")
        mid.add(k)
        for name,lang in (("title","el"),("title_en","en"),("body","el"),("body_en","en")):
            check_text("moment",k,name,m.get(name),lang)
    titles=defaultdict(list)
    for i,story in enumerate(stories,1):
        ref="story-"+str(i).zfill(3)
        for name in ("title","lead","text"):
            check_text("story",ref,name,story.get(name),"el")
        titles[normal(story.get("title"))].append(ref)
        for target in story.get("relatedPeople",[]):
            if target not in ids:issue("error","story",ref,"unknown_person","Related person ID does not exist")
    for name,refs in titles.items():
        if name and len(refs)>1:issue("review","story",",".join(refs),"duplicate_title","Same story title appears multiple times")
    report["issues"].sort(key=lambda x:(x["level"]!="error",x["section"],x["ref"],x["rule"]))
    report["summary"]=dict(Counter(x["level"] for x in report["issues"]))
    return report

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--json",type=Path,help="Write machine-readable editorial suggestions")
    p.add_argument("--strict",action="store_true",help="Fail only on structural errors")
    a=p.parse_args()
    result=audit()
    if a.json:
        a.json.parent.mkdir(parents=True,exist_ok=True)
        a.json.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("Editorial QA:",result["checked"],result["summary"],"— zero automatic edits.")
    if a.strict and result["summary"].get("error",0):
        raise SystemExit(1)
