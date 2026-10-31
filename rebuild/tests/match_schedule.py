#!/usr/bin/env python3
"""No unapproved, wrong timezone or invented fixtures appear publicly."""
import copy,importlib.util,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("schedule",ROOT/"tools/build_match_schedule.py")
assert spec and spec.loader
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

def main():
    blank=json.loads((ROOT/"data/match-schedule.json").read_text(encoding="utf-8"))
    assert m.validate(blank)==[]
    assert "BEGIN:VCALENDAR\r\n" in m.calendar(blank)
    good={
     "id":"fixture-approve-a1b2c3d4","sport":"handball",
     "home_team":"ΓΑΣ Αρχέλαος","away_team":"ΑΣΕ Δούκας",
     "start_at":"2027-04-11T18:30:00+03:00","status":"scheduled",
     "competition":"Πρωτάθλημα","venue":"Κλειστό Κατερίνης",
     "source":{"label":"Εγκεκριμένο επίσημο πρόγραμμα"},
     "approval":{"status":"owner_approved","reviewed_on":"2027-03-11T12:00:00+02:00"}}
    data=copy.deepcopy(blank);data["matches"]=[good]
    assert len(m.validate(data))==1
    out=m.calendar(data)
    assert "DTSTART:20270411T153000Z" in out
    assert "STATUS:CONFIRMED" in out
    assert "UID:fixture-approve-a1b2c3d4@archelaos.club" in out
    for key,value in [
     ("start_at","2027-04-11T18:30:00"),
     ("home_team","Κάποια άλλη ομάδα"),
     ("sport","nonexistent")]:
      bad=copy.deepcopy(data);bad["matches"][0][key]=value
      try:m.validate(bad)
      except ValueError:pass
      else:raise AssertionError("Failed to reject "+key)
    bad=copy.deepcopy(data);bad["matches"][0]["approval"]["status"]="draft"
    try:m.validate(bad)
    except ValueError:pass
    else:raise AssertionError("Unapproved match passed")
    extra=copy.deepcopy(good);extra["id"]="fixture-approve-other"
    bad=copy.deepcopy(data);bad["matches"].append(extra)
    try:m.validate(bad)
    except ValueError:pass
    else:raise AssertionError("Duplicate match was accepted")
    print("MATCH PUBLICATION QA OK: empty safe, explicit approval, timezone, duplicates, RFC5545 export.")
if __name__=="__main__":main()
