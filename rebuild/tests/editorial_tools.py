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
# Prepare a draft by a full name, ignoring Greek accent differences.
preparer=load_module("prepare_correction","prepare_correction.py")
person=preparer.person_by_name("Αλκινοος Τασοπουλος")
assert person["id"]=="arch-61d8d097f601"
draft=preparer.prepare(kind="person",reference="Αλκινοος Τασοπουλος",
    field="bio",before="τα καθήκοντα του προέδρου άσκησε προσωρινά ο Χαράλαμπος Σαββίδης",
    after="τα καθήκοντα του προέδρου ασκούσε προσωρινά ο Χαράλαμπος Σαββίδης",
    reason="Correction test: generated pending review only")
assert draft["changes"][0]["id"]==person["id"]
assert len(draft["changes"])==1
for invalid_name in ("Τασόπουλος","Αλέξανδρος Ανύπαρκτος"):
    try:
        preparer.person_by_name(invalid_name)
    except ValueError:
        pass
    else:
        raise AssertionError("Draft preparer accepted partial or unknown name")
with tempfile.TemporaryDirectory() as scratch:
    dest=preparer.save_draft(draft,"test-correction",Path(scratch))
    assert json.loads(dest.read_text(encoding="utf-8"))==draft
    try:
        preparer.save_draft(draft,"test-correction",Path(scratch))
    except FileExistsError:
        pass
    else:
        raise AssertionError("Draft preparer overwrote a previous draft")

# A corrected phrase elsewhere must NOT mask an unreplaced original.
try:
    editor.exact_replace("old phrase / new phrase","old phrase","new phrase","coexisting")
except ValueError:
    pass
else:
    raise AssertionError("Partially applied correction passed validation")
print("EDITORIAL TOOL QA OK: exact multi-file records, idempotence, source lookup, safe failure")
