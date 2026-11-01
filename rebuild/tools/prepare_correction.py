#!/usr/bin/env python3
"""Prepare a safe editorial change by Greek/English name or board-era ID.

Read-only by default. Does not change a biography, commit, push or deploy.
Example:
  python rebuild/tools/prepare_correction.py --person "Αλκίνοος Τασόπουλος" \
    --field bio --before "old exact phrase" --after "new exact phrase" \
    --reason "Checked against the club historical archive" --save
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import re
import unicodedata

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data"
DRAFTS=ROOT/"test-artifacts"/"drafts"

def fold(value):
    normalized=unicodedata.normalize("NFD",str(value).casefold())
    return " ".join("".join(c for c in normalized if not unicodedata.combining(c)).split())

def person_by_name(name, records=None):
    if records is None:
        records=json.loads((DATA/"people.json").read_text(encoding="utf-8"))["people"]
    normalized=fold(name)
    if len(normalized)<3:
        raise ValueError("Provide a complete Greek or English name")
    matches={p["id"]:p for p in records if normalized in (fold(p["name"]),fold(p.get("name_en","")))}
    if len(matches)!=1:
        raise ValueError(f"Expected one exact name matching {name!r}, got {len(matches)}; use the full name.")
    return next(iter(matches.values()))

def prepare(*,kind,reference,field,before,after,reason,key=None,people=None,eras=None):
    if kind=="person":
        if field not in ("bio","bio_en"):
            raise ValueError("Person corrections support bio or bio_en only")
        person=person_by_name(reference,people)
        identifier=person["id"]
        source=person[field]
    elif kind=="board":
        if field!="html":
            raise ValueError("Board corrections support html only")
        if eras is None:
            eras=json.loads((DATA/"board.json").read_text(encoding="utf-8"))["eras"]
        matches=[e for e in eras if e["id"]==reference]
        if len(matches)!=1:
            raise ValueError("Unknown board-era ID")
        identifier=reference
        source=matches[0]["html"]
    else:
        raise ValueError("Only person and board corrections supported")
    if not isinstance(reason,str) or len(reason.strip())<8:
        raise ValueError("A clear editorial reason/source is required")
    if not all(isinstance(x,str) and x.strip() for x in (before,after)):
        raise ValueError("Both original and proposed text are required")
    if before==after:
        raise ValueError("The two phrases are identical")
    n=source.count(before)
    if n!=1:
        if after in source:
            raise ValueError("This correction has already been made")
        raise ValueError(f"Original phrase must occur exactly once; found {n}")
    if after in source:
        raise ValueError("Proposed phrase already exists in this record")
    slug=key or f"correction-{identifier}-{field.replace('_','-')}"
    if not re.fullmatch(r"[a-z0-9-]{5,90}",slug):
        raise ValueError("Correction key should contain only lowercase ASCII letters, numbers and dashes")
    return {"schema_version":1,"changes":[{
        "key":slug,"kind":kind,"id":identifier,"reason":reason.strip(),
        "replacements":[{"field":field,"before":before,"after":after}]
    }]}

def save_draft(document,name,out=DRAFTS):
    if not re.fullmatch(r"[a-z0-9-]{5,90}",name):
        raise ValueError("Unsafe draft name")
    out.mkdir(parents=True,exist_ok=True)
    dest=out/(name+".json")
    # Never overwrite a different, previously reviewed draft.
    with dest.open("x",encoding="utf-8") as f:
        f.write(json.dumps(document,ensure_ascii=False,indent=2)+"\n")
    return dest

def main():
    p=argparse.ArgumentParser(description=__doc__)
    target=p.add_mutually_exclusive_group(required=True)
    target.add_argument("--person",help="Exact Greek/English full name, accents optional")
    target.add_argument("--era",help="Board era identifier: foundation, growth, europe, recent")
    p.add_argument("--field",required=True,choices=("bio","bio_en","html"))
    p.add_argument("--before",required=True)
    p.add_argument("--after",required=True)
    p.add_argument("--reason",required=True)
    p.add_argument("--key",help="Unique correction slug")
    p.add_argument("--save",action="store_true",help="Save a non-public draft without applying it")
    args=p.parse_args()
    kind="person" if args.person else "board"
    document=prepare(kind=kind,reference=args.person or args.era,
                     field=args.field,before=args.before,after=args.after,
                     reason=args.reason,key=args.key)
    print(json.dumps(document,ensure_ascii=False,indent=2))
    if args.save:
        file=save_draft(document,document["changes"][0]["key"])
        print(f"\nSaved local-only draft: {file.relative_to(ROOT.parent)}")
        print(f"Review with: python rebuild/tools/quick_edit.py --manifest {file.relative_to(ROOT.parent)}")
    else:
        print("\nRead-only preview. Use --save to create an ignored draft.")
if __name__=="__main__":main()
