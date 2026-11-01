#!/usr/bin/env python3
"""Find historical references across the staged content without writing to files.

This does not crawl private Drive documents or external sites.
Examples:
  python rebuild/tools/find_references.py "Σαββίδης"
  python rebuild/tools/find_references.py "Κύπελλο" --json
"""
from __future__ import annotations
import argparse
import json
from html import unescape
from pathlib import Path
import re
import unicodedata

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data"
SOURCES={
 "people":("people",("name","name_en","role","bio","bio_en")),
 "moments":("moments",("year","title","title_en","body","body_en")),
 "stories":("stories",("title","lead","text","sport","year")),
 "board":("eras",("title","subtitle","html")),
 "museum":("articles",("title","html")),
}

def fold(s):
    return "".join(x for x in unicodedata.normalize("NFD",str(s).casefold())
                   if not unicodedata.combining(x))
def clean(s):
    s=unescape(re.sub(r"<[^>]*>"," ",str(s)))
    return " ".join(s.split())

def find(query,limit=100):
    needle=fold(query.strip())
    if len(needle)<2:raise ValueError("Search term must contain at least 2 characters")
    hits=[]
    for name,(key,fields) in SOURCES.items():
        file=DATA/(name+".json")
        data=json.loads(file.read_text(encoding="utf-8"))
        for i,record in enumerate(data[key]):
            ref=record.get("id") or ("story-"+str(i+1).zfill(3) if name=="stories" else "record-"+str(i+1))
            for field in fields:
                value=record.get(field)
                if value is None:continue
                if isinstance(value,list):value=" ".join(str(v) for v in value)
                plain=clean(value)
                pos=fold(plain).find(needle)
                if pos<0:continue
                # Offset in accent-folded text is approximate, but excerpt always local.
                excerpt=plain[max(0,pos-105):pos+min(220,len(query)+130)]
                hits.append({"source":str(file.relative_to(ROOT)),"type":name,
                             "record_id":ref,"field":field,"excerpt":excerpt})
                if len(hits)>=limit:return hits
    # Find also static-page-only references that might not be in canonical JSON.
    for file in sorted(ROOT.glob("*.html")):
        page=clean(file.read_text(encoding="utf-8"))
        pos=fold(page).find(needle)
        if pos>=0:
            hits.append({"source":file.name,"type":"html","record_id":file.stem,
                         "field":"page","excerpt":page[max(0,pos-105):pos+min(220,len(query)+130)]})
            if len(hits)>=limit:return hits
    return hits

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phrase")
    parser.add_argument("--json",action="store_true",help="machine-readable search hits")
    parser.add_argument("--limit",type=int,default=100)
    args=parser.parse_args()
    if not 1<=args.limit<=1000:parser.error("--limit must be 1–1000")
    results=find(args.phrase,args.limit)
    if args.json:
        print(json.dumps({"query":args.phrase,"matches":len(results),"results":results},
                         ensure_ascii=False,indent=2))
    else:
        print(f"Found {len(results)} matching references for: {args.phrase}")
        for hit in results:
            print(f"{hit['source']} / {hit['record_id']} / {hit['field']}: {hit['excerpt']}")

if __name__=="__main__":main()
