#!/usr/bin/env python3
"""Offline image health inventory for the rebuilt sports site.

Enumerates dynamic images in JSON + static HTML. Never downloads media, never
changes images or metadata and never publishes unlicensed replacements.
"""
from __future__ import annotations
import argparse
from collections import Counter
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import urlparse, unquote

ROOT=Path(__file__).resolve().parents[2]
STAGE=ROOT/"rebuild"
IMAGE_KEY=re.compile(r"(?:photo|image|thumbnail|poster|logo|avatar|cover|picture|^src$)",re.I)
REMOTE=("https://","http://","//")

class Tags(HTMLParser):
    def __init__(self):
        super().__init__()
        self.src=[]
    def handle_starttag(self,tag,attrs):
        if tag!="img":return
        attributes=dict(attrs)
        if attributes.get("src"):self.src.append(attributes["src"])

def walk(obj, origin, output):
    if isinstance(obj,list):
        for i,value in enumerate(obj):
            walk(value,f"{origin}[{i}]",output)
    elif isinstance(obj,dict):
        for k,value in obj.items():
            key=f"{origin}.{k}"
            if isinstance(value,str) and IMAGE_KEY.search(k):
                if value.startswith(REMOTE) or value.startswith(("/images/","/assets/")):
                    output.append((key,value))
            if isinstance(value,str) and ("<img" in value):
                p=Tags()
                p.feed(value)
                for i,src in enumerate(p.src):output.append((f"{key}.img[{i}]",src))
            if isinstance(value,(list,dict)):walk(value,key,output)

def inventory():
    found=[]
    for path in sorted((STAGE/"data").glob("*.json")):
        walk(json.loads(path.read_text(encoding="utf-8")),path.name,found)
    for path in sorted(STAGE.glob("*.html")):
        parser=Tags()
        parser.feed(path.read_text(encoding="utf-8"))
        for i,src in enumerate(parser.src):found.append((path.name+f".img[{i}]",src))
    problems=[]
    remote=[]
    local=[]
    for owner,url in found:
        if url.startswith(REMOTE):
            remote.append({"owner":owner,"url":url})
        else:
            parsed=urlparse(url)
            if not parsed.path.startswith("/"):continue
            target=ROOT/unquote(parsed.path.lstrip("/"))
            record={"owner":owner,"path":parsed.path}
            if not target.is_file():
                problems.append(record)
            else:
                record["bytes"]=target.stat().st_size
                local.append(record)
    return {
      "scanned":len(found),
      "local_assets":len(local),
      "missing_local_assets":problems,
      "external_image_references":remote,
      "external_unique_domains":dict(Counter(urlparse(x["url"]).netloc for x in remote)),
      "large_local_images":[x for x in local if x["bytes"]>3_000_000],
      "notes":"External images are dependency warnings, not proof of broken URLs; no network checks."
    }

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--json",type=Path)
    p.add_argument("--strict-local",action="store_true")
    a=p.parse_args()
    result=inventory()
    print(f"MEDIA INVENTORY: {result['scanned']} image refs, "
          f"{len(result['missing_local_assets'])} missing local, "
          f"{len(result['external_image_references'])} external, "
          f"{len(result['large_local_images'])} local larger than 3MB.")
    for x in result["missing_local_assets"][:20]:print("MISSING:",x)
    for host,count in result["external_unique_domains"].items():print("EXTERNAL:",host,count)
    if a.json:
        a.json.parent.mkdir(parents=True,exist_ok=True)
        a.json.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    if a.strict_local and result["missing_local_assets"]:raise SystemExit(1)

if __name__=="__main__":main()
