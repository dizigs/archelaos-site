#!/usr/bin/env python3
"""Regression tests for safe history corrections and reference discovery."""
from pathlib import Path
import importlib.util
import json
import tempfile

ROOT=Path(__file__).resolve().parents[1]

def load_module(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/"tools"/file)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

editor=load_module("quick_edit","quick_edit.py")
finder=load_module("find_references","find_references.py")
manifest=json.loads((ROOT/"data/editorial-corrections.json").read_text(encoding="utf-8"))
# Already-applied reference corrections do not rewrite public content.
pending,log=editor.patch_manifest(manifest,ROOT.parent)
assert not pending,f"History correction out of sync: {list(pending)}"
assert len(log)==3
assert finder.find("Αλκίνοος Τασόπουλος"),"Cannot trace known person"
assert any(h["type"]=="board" for h in finder.find("Χαράλαμπος Σαββίδης"))
# Verify failure occurs before writes and doesn't hide missing source text.
bad=json.loads(json.dumps(manifest,ensure_ascii=False))
bad["changes"][0]["replacements"][0]["before"]="NONEXISTENT UNVERIFIED HISTORICAL FACT"
bad["changes"][0]["replacements"][0]["after"]="DO NOT ADD THIS"
try:
    editor.patch_manifest(bad,ROOT.parent)
except ValueError:
    pass
else:
    raise AssertionError("Incorrect old phrase was accepted")
print("EDITORIAL TOOL QA OK: exact multi-file records, idempotence, source lookup, safe failure")
