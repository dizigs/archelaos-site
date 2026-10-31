#!/usr/bin/env python3
"""Safe, exact, multi-file editorial corrections in the rebuilt site.

Default is read-only dry run. --apply is allowed ONLY on the isolated rebuild
branch, never main. The tool does not commit, push, deploy, contact Drive or AI.
"""
from __future__ import annotations
import argparse
from html import escape
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT=Path(__file__).resolve().parents[2]
DEFAULT=ROOT/"rebuild/data/editorial-corrections.json"
ALLOWED={"person":{"bio","bio_en"},"board":{"html"}}

def load(path):
    return json.loads(path.read_text(encoding="utf-8"))
def dump(data):
    return json.dumps(data,ensure_ascii=False,indent=2)+"\n"
def exact_replace(text,before,after,where):
    if not before or before==after or not after:
        raise ValueError(f"{where}: change must have distinct nonempty text")
    if after in text:
        # This is an idempotent archived correction; do not duplicate.
        return text,False
    count=text.count(before)
    if count!=1:
        raise ValueError(f"{where}: expected exactly one original phrase, found {count}")
    return text.replace(before,after,1),True

def profile_replace(html,before,after,where):
    # Keep visible biography AND JSON-LD in sync, including apostrophe entities.
    pairs=list(dict.fromkeys((
        (before,after),
        (escape(before,quote=True),escape(after,quote=True)),
        (escape(before,quote=True).replace("&#x27;","&#39;"),
         escape(after,quote=True).replace("&#x27;","&#39;"))
    )))
    matched=False
    changed=False
    for original,updated in pairs:
        if original==updated:continue
        token="\x01ARCH-QUICK-EDIT-RESERVED\x02"
        if token in html:raise ValueError(f"{where}: reserved token found")
        already=updated in html
        protected=html.replace(updated,token) if already else html
        count=protected.count(original)
        if count>3:
            raise ValueError(f"{where}: unexpected duplicate original phrase ({count})")
        if count:
            protected=protected.replace(original,updated)
            changed=True
        if already or count:matched=True
        html=protected.replace(token,updated)
    if not matched:
        raise ValueError(f"{where}: profile does not contain expected original phrase")
    return html,changed

def patch_manifest(manifest, root=ROOT):
    if manifest.get("schema_version")!=1:
        raise ValueError("Expected editorial manifest schema_version 1")
    edits=manifest.get("changes")
    if not isinstance(edits,list) or not 1<=len(edits)<=40:
        raise ValueError("Expected 1–40 editorial changes")
    sources={}
    report=[]
    seen=set()
    def source(relative):
        path=root/relative
        if relative not in sources:
            sources[relative]=[path.read_text(encoding="utf-8"),None]
        if sources[relative][1] is None:
            sources[relative][1]=load(path) if relative.endswith(".json") else sources[relative][0]
        return sources[relative][1]
    def replace_sourced(relative,object_ref,before,after,label):
        # Works for dict string fields only.
        old=object_ref[0][object_ref[1]]
        updated,changed=exact_replace(old,before,after,label)
        object_ref[0][object_ref[1]]=updated
        return changed
    for edit in edits:
        if not isinstance(edit,dict) or set(edit)!={"key","kind","id","replacements","reason"}:
            raise ValueError("Edit requires only key, kind, id, replacements, reason")
        key,kind,pid=edit["key"],edit["kind"],edit["id"]
        if not isinstance(key,str) or not re.fullmatch(r"[a-z0-9-]{5,90}",key) or key in seen:
            raise ValueError("Duplicate or invalid edit key")
        seen.add(key)
        if kind not in ALLOWED or not isinstance(pid,str) or not re.fullmatch(r"[a-z0-9-]{1,90}",pid):
            raise ValueError(f"{key}: unsupported kind or id")
        if not isinstance(edit["reason"],str) or len(edit["reason"].strip())<8:
            raise ValueError(f"{key}: missing editorial reason")
        replacements=edit["replacements"]
        if not isinstance(replacements,list) or not 1<=len(replacements)<=4:
            raise ValueError(f"{key}: expected 1–4 exact replacements")
        if len({r.get("field") for r in replacements if isinstance(r,dict)})!=len(replacements):
            raise ValueError(f"{key}: duplicate field")
        if kind=="person":
            master=source("rebuild/data/people.json")["people"]
            current=next((x for x in master if x["id"]==pid),None)
            archive=source("hall-of-fame-people.json")
            original=archive if isinstance(archive,list) else archive["people"]
            indexed=next((x for x in original if x["id"]==pid),None)
            english=source("rebuild/i18n/content/en/people.json")["people"]
            translated=next((x for x in english if x["id"]==pid),None)
            profile_path="people/"+pid+".html"
            profile=source(profile_path)
            if not all((current,indexed,translated)):
                raise ValueError(f"{key}: canonical profile missing")
        else:
            periods=source("rebuild/data/board.json")["eras"]
            current=next((x for x in periods if x["id"]==pid),None)
            if current is None:
                raise ValueError(f"{key}: board era does not exist")
            board=source("board.html")
        for change in replacements:
            if not isinstance(change,dict) or set(change)!={"field","before","after"}:
                raise ValueError(f"{key}: malformed replacement")
            field,before,after=change["field"],change["before"],change["after"]
            if field not in ALLOWED[kind] or not all(isinstance(x,str) for x in (before,after)):
                raise ValueError(f"{key}: unsupported field or invalid text")
            label=key+"/"+field
            replace_sourced("rebuild/data/"+("people" if kind=="person" else "board")+".json",(current,field),before,after,label)
            if kind=="person":
                replace_sourced("hall-of-fame-people.json",(indexed,field),before,after,label+" index")
                if field=="bio_en":
                    replace_sourced("rebuild/i18n/content/en/people.json",(translated,"biography"),before,after,label+" English")
                profile,changed=profile_replace(profile,before,after,label+" profile")
                sources[profile_path][1]=profile
            else:
                board,changed=exact_replace(board,before,after,label+" archived board")
                sources["board.html"][1]=board
            report.append(label+": validated")
    staged={}
    for relative,(original,updated) in sources.items():
        result=dump(updated) if relative.endswith(".json") else updated
        if result!=original:
            staged[relative]=result
    return staged,report

def safe_write(pending,root):
    branch=subprocess.check_output(["git","-C",str(root),"branch","--show-current"],text=True).strip()
    if branch!="rebuild/clean-foundation":
        raise RuntimeError("Refusing --apply outside rebuild/clean-foundation")
    # All validation happens before ANY write. Git is the rollback mechanism.
    for relative,body in pending.items():
        path=root/relative
        with tempfile.NamedTemporaryFile(mode="w",encoding="utf-8",dir=path.parent,
                                         prefix=".quick-edit-",delete=False) as file:
            file.write(body)
            temporary=Path(file.name)
        try:
            os.replace(temporary,path)
        finally:
            temporary.unlink(missing_ok=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest",type=Path,default=DEFAULT)
    parser.add_argument("--apply",action="store_true",help="write only to rebuild branch checkout")
    opt=parser.parse_args()
    pending,report=patch_manifest(load(opt.manifest))
    print("\n".join(report))
    print("Files requiring changes:",len(pending))
    for filename in pending:
        print(" -",filename)
    if opt.apply:
        safe_write(pending,ROOT)
        print("Staged files updated. Review git diff, run tests, commit separately.")
    else:
        print("DRY RUN: no files changed. Use --apply on rebuild branch after review.")

if __name__=="__main__":
    main()
