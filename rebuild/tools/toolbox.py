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
import os
import runpy
import sys

ROOT=Path(__file__).resolve().parents[2]
TOOLS=ROOT/"rebuild/tools"
TESTS=ROOT/"rebuild/tests"
CHECKS=(
    ("Site and content","check",()),
    ("Editorial tools","editorial",()),
    ("Translations","translations",()),
    ("Media inventory","media",()),
)
RUNNERS={
    "check":TESTS/"check.py", "editorial":TESTS/"editorial_tools.py",
    "translations":TOOLS/"audit_translations.py", "media":TOOLS/"media_inventory.py",
    "find":TOOLS/"find_references.py", "preview":TOOLS/"quick_edit.py",
    "draft":TOOLS/"prepare_correction.py",
}

def run(name,args=()):
    if name not in RUNNERS:
        raise ValueError("Unknown fixed toolbox command")
    path=RUNNERS[name]
    original_argv,original_path,original_cwd=sys.argv,sys.path,Path.cwd()
    try:
        # Only reviewed checkout scripts execute. No OS command/interpreter
        # argument boundary; user text remains data for the fixed script parser.
        sys.argv=[str(path),*args]
        sys.path=[str(path.parent),*original_path]
        os.chdir(ROOT)
        runpy.run_path(str(path),run_name="__main__")
        return 0
    except SystemExit as error:
        return error.code if isinstance(error.code,int) else (0 if error.code is None else 1)
    except (OSError,ValueError):
        print("TOOLBOX_INPUT_REJECTED",file=sys.stderr)
        return 2
    finally:
        sys.argv,sys.path=original_argv,original_path
        os.chdir(original_cwd)

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
        return run("find",(["--json"] if args.json else [])+["--",args.phrase])
    if args.command=="preview":
        return run("preview",["--manifest="+str(args.manifest)])
    if args.command=="draft":
        flags=["--person="+args.person] if args.person else ["--era="+args.era]
        flags+=["--field="+args.field,"--before="+args.before,"--after="+args.after,
                "--reason="+args.reason]
        if args.key:flags+=["--key="+args.key]
        if args.save:flags+=["--save"]
        return run("draft",flags)
    return 2

if __name__=="__main__":sys.exit(main())
