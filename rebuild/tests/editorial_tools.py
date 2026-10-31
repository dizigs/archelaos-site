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
# Simulate a REAL correction in an isolated temporary checkout.
with tempfile.TemporaryDirectory() as temp:
    sandbox=Path(temp)
    used=[
        "rebuild/data/people.json","hall-of-fame-people.json",
        "rebuild/i18n/content/en/people.json",
        "people/arch-61d8d097f601.html",
        "rebuild/data/board.json","board.html"
    ]
    for relative in used:
        path=sandbox/relative
        path.parent.mkdir(parents=True,exist_ok=True)
        text=(ROOT.parent/relative).read_text(encoding="utf-8")
        for edit in manifest["changes"]:
            for op in edit["replacements"]:
                text=text.replace(op["after"],op["before"])
                if op["field"]=="bio_en":
                    text=text.replace(
                        editor.escape(op["after"],quote=True).replace("&#x27;","&#39;"),
                        editor.escape(op["before"],quote=True).replace("&#x27;","&#39;")
                    )
        path.write_text(text,encoding="utf-8")
    prepared,comments=editor.patch_manifest(manifest,sandbox)
    assert prepared, "Quick-edit did not produce any corrected files"
    assert len(prepared)>=5, f"Unexpectedly few files: {list(prepared)}"
    for relative,body in prepared.items():
        (sandbox/relative).write_text(body,encoding="utf-8")
    again,_=editor.patch_manifest(manifest,sandbox)
    assert not again, "Second run must be idempotent"
    for relative in used:
        text=(sandbox/relative).read_text(encoding="utf-8")
        for edit in manifest["changes"]:
            for op in edit["replacements"]:
                if op["after"] in (ROOT.parent/relative).read_text(encoding="utf-8"):
                    assert op["after"] in text, relative
print("EDITORIAL TOOL QA OK: exact multi-file records, idempotence, source lookup, safe failure")
