#!/usr/bin/env python3
"""One safe entrypoint for Archelaos editorial maintenance.

No command in this toolbox can publish, push, merge, delete or apply edits.
Examples:
  python rebuild/tools/toolbox.py health
  python rebuild/tools/toolbox.py find "Σαββίδης"
  python rebuild/tools/toolbox.py draft --person "Αλκίνοος Τασόπουλος" \
    --field bio --before "old" --after "new" --reason "verified document"
  python rebuild/tools/toolbox.py preview --manifest /path/to/reviewed-draft.json
"""
from __future__ import annotations
import argparse
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[2]
TOOLS=ROOT/"rebuild/tools"
TESTS=ROOT/"rebuild/tests"
CHECKS=(
    ("Site and content",TESTS/"check.py",()),
    ("Editorial tools",TESTS/"editorial_tools.py",()),
    ("Translations",TOOLS/"audit_translations.py",()),
    ("Media inventory",TOOLS/"media_inventory.py",()),
)
def run(path,args=()):
    cmd=[sys.executable,str(path),*args]
    return subprocess.run(cmd,cwd=ROOT,check=False).returncode

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    subs=parser.add_subparsers(dest="command",required=True)
    subs.add_parser("health",help="Run essential integrity, editorial, translation and image checks")
    finder=subs.add_parser("find",help="Find all staged references of a person or event")
    finder.add_argument("phrase")
    finder.add_argument("--json",action="store_true")
    draft=subs.add_parser("draft",help="Prepare a local-only exact correction; never applies it")
    target=draft.add_mutually_exclusive_group(required=True)
    target.add_argument("--person")
    target.add_argument("--era")
    draft.add_argument("--field",required=True,choices=("bio","bio_en","html"))
    draft.add_argument("--before",required=True)
    draft.add_argument("--after",required=True)
    draft.add_argument("--reason",required=True)
    draft.add_argument("--key")
    draft.add_argument("--save",action="store_true")
    preview=subs.add_parser("preview",help="Validate an editorial manifest, without writing")
    preview.add_argument("--manifest",type=Path,required=True)
    args=parser.parse_args()
    if args.command=="health":
        failed=[]
        for title,script,options in CHECKS:
            print("\n=== "+title+" ===",flush=True)
            if run(script,options):failed.append(title)
        if failed:
            print("\nFAILED: "+", ".join(failed))
            return 1
        print("\nALL TOOLBOX HEALTH CHECKS PASSED")
        return 0
    if args.command=="find":
        return run(TOOLS/"find_references.py",[args.phrase]+(["--json"] if args.json else []))
    if args.command=="preview":
        return run(TOOLS/"quick_edit.py",["--manifest",str(args.manifest)])
    if args.command=="draft":
        flags=["--person",args.person] if args.person else ["--era",args.era]
        flags+=["--field",args.field,"--before",args.before,"--after",args.after,
                "--reason",args.reason]
        if args.key:flags+=["--key",args.key]
        if args.save:flags+=["--save"]
        return run(TOOLS/"prepare_correction.py",flags)
    return 2

if __name__=="__main__":sys.exit(main())
