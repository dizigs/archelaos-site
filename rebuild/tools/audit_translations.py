#!/usr/bin/env python3
"""Offline translation integrity gate. No language is enabled by this check."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
I18N=ROOT/"i18n"
DATA=ROOT/"data"
load=lambda p: json.loads(Path(p).read_text(encoding="utf-8"))
manifest=load(I18N/"manifest.json")
assert manifest["default_language"]=="el", "Greek must remain live"
assert manifest["language_switcher_enabled"] is False, "Never enable draft translations"
langs=manifest["languages"]
codes=[l["code"] for l in langs]
assert len(codes)==len(set(codes)) and len(codes)>2, "Expected distinct planned locales"
assert sum(l["status"]=="live" for l in langs)==1 and langs[0]["code"]=="el"
keys=set(load(I18N/"ui"/"el.json")["strings"])
for lang in langs:
    file=I18N/lang["ui"]
    doc=load(file)
    assert doc["locale"]==lang["code"] and set(doc["strings"])==keys
    assert all(isinstance(v,str) and v.strip() for v in doc["strings"].values())
    if lang["code"]!="el": assert lang["status"]!="live"
people=load(DATA/"people.json")["people"]
en=load(I18N/"content"/"en"/"people.json")["people"]
assert len(en)==len(people)==682
assert [p["id"] for p in en]==[p["id"] for p in people]
# Correct source of temporary presidential duties after Alkinoos Tasopoulos.
alkinoos=next(p for p in people if p["id"]=="arch-61d8d097f601")
alkinoos_en=next(p for p in en if p["id"]=="arch-61d8d097f601")
assert "τα καθήκοντα του προέδρου άσκησε προσωρινά ο Χαράλαμπος Σαββίδης" in alkinoos["bio"]
assert "Charalampos Savvidis temporarily carried out the president's duties" in alkinoos["bio_en"]
assert alkinoos_en["biography"]==alkinoos["bio_en"], "English export not in sync"

assert all(p["biography"] and p["name"] for p in en)
moments=load(DATA/"moments.json")["moments"]
translated=load(I18N/"content"/"en"/"moments.json")["moments"]
assert [m["id"] for m in translated]==[m["id"] for m in moments] and len(translated)==70
assert all(m["title"] and m["paragraphs"] for m in translated)
coverage=load(I18N/"content"/"en"/"coverage.json")
assert coverage["verified_as_complete"] is False and coverage["published"] is False
assert coverage["counts"]["untranslated_stories"]==len(load(DATA/"stories.json")["stories"])
summaries=load(I18N/"content"/"en"/"stories-summaries.json")
source_stories=load(DATA/"stories.json")["stories"]
assert summaries["fully_translated"] is False and len(summaries["stories"])==len(source_stories)==21
assert all(row["body_en"] is None and row["title_en"] and row["lead_en"] for row in summaries["stories"])
assert [row["id"] for row in summaries["stories"]]==list(range(1,22))
print("I18N OK:",len(langs),"prepared locales; 682 English biography drafts; 70 English moments; switch OFF")
