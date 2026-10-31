#!/usr/bin/env python3
"""Offline regression test: public-safe additions, source privacy and idempotency."""
import copy
import importlib.util
import json
import tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("ingest",ROOT/"tools/ingest_verified.py")
tool=importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)
data=tool.read(ROOT/"data")
original=json.dumps(data,sort_keys=True,ensure_ascii=False)
def entry(op, **payload):
    return dict(operation=op,verified=True,safe_for_publication=True,
                source_label="Δημοσιευμένο τεκμήριο συλλόγου, 1994, σελ. 4",**payload)
def pkg(*items,approved=True):
    return {"schema_version":1,"approval":{"status":"approved" if approved else "pending",
            "reviewed_by":"Υπεύθυνος ιστορικού αρχείου"},"entries":list(items)}
story=entry("append_story",story={
    "sport":"Χειροσφαίριση","year":"1994",
    "title":"Δοκιμαστική τεκμηριωμένη αφήγηση που δεν δημοσιεύεται",
    "lead":"Τεκμηριωμένα αγωνιστικά δεδομένα για την ιστορία του συλλόγου.",
    "text":"Η παρούσα καταχώριση υπάρχει αποκλειστικά για τον έλεγχο ασφαλούς εισαγωγής. "
           "Η ιστορική πληροφορία αναμένει διασταύρωση και δεν προστίθεται στο δημόσιο αρχείο.",
    "relatedPeople":[data["people"]["people"][0]["id"]]})
event=entry("add_event",event={
    "title":"Δοκιμαστικό ιστορικό γεγονός χωρίς δημοσίευση",
    "period":"1994","body":"Η δοκιμαστική περιγραφή περιέχει <script>alert(1)</script> "
                            "που πρέπει να μετατραπεί σε ασφαλές κείμενο."})
changed,msg=tool.merge(pkg(story,event),data)
assert len(changed["stories"]["stories"])==len(data["stories"]["stories"])+1
assert changed["stories"]["count"]==len(changed["stories"]["stories"])
assert len(changed["museum"]["articles"])==len(data["museum"]["articles"])+1
assert "<script>" not in changed["museum"]["articles"][-1]["html"]
assert "&lt;script&gt;" in changed["museum"]["articles"][-1]["html"]
again,_=tool.merge(pkg(story,event),changed)
assert again==changed,"same package should not duplicate records"
try:
    tool.merge(pkg(story,approved=False),data)
    raise AssertionError("unapproved content imported")
except ValueError:pass
for bad in [
    dict(story,source_private_url="https://drive.google.com/private"),
    dict(story,source_label="https://drive.google.com/drive/folders/private"),
]:
    try:
        tool.merge(pkg(bad),data)
        raise AssertionError("private Drive information passed")
    except ValueError:pass
try:
    tool.merge(pkg(story,entry("biography_note",person_id="arch-does-not-exist",
      paragraph_el="Δοκιμαστική ελληνική παράγραφος βιογραφίας με ελάχιστα στοιχεία.",
      paragraph_en="Test English biography paragraph with enough characters.")),data)
    raise AssertionError("partial import accepted an invalid person")
except ValueError:pass
assert json.dumps(data,sort_keys=True,ensure_ascii=False)==original,"source mutated during dry run"
with tempfile.TemporaryDirectory() as tmp:
    temp=Path(tmp)
    for key in tool.TYPES:
        (temp/(key+".json")).write_text(
            json.dumps(data[key],ensure_ascii=False),encoding="utf-8")
    draft=temp/"reviewed.json";draft.write_text(
        json.dumps(pkg(story),ensure_ascii=False),encoding="utf-8")
    before=(temp/"stories.json").read_bytes()
    tool.run(draft,temp,apply=False)
    assert (temp/"stories.json").read_bytes()==before
    tool.run(draft,temp,apply=True)
    now=json.loads((temp/"stories.json").read_text(encoding="utf-8"))
    assert len(now["stories"])==len(data["stories"]["stories"])+1
print("STAGED INGESTION OK: validated approvals, duplicate protection, escaped HTML, dry-run and privacy.")
