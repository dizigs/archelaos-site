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
    assert blank["display_policy"]=="home_only"
    assert len(m.validate(blank))==12
    from datetime import datetime
    assert sum(x["sport"]=="handball" for x in blank["matches"])==6
    assert sum(x["sport"]=="volleyball" for x in blank["matches"])==6
    for fixture in blank["matches"]:
        dt=datetime.fromisoformat(fixture["start_at"])
        assert dt.weekday()==(5 if fixture["sport"]=="handball" else 6)
        assert fixture["home_team"]=="ΓΑΣ Αρχέλαος Κατερίνης"
        assert "end_at" not in fixture
        if fixture["sport"]=="handball":assert dt.hour==18
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
    assert "DTEND:" not in out, "Never invent the end time for a match"
    end=copy.deepcopy(data)
    end["matches"][0]["end_at"]="2027-04-11T20:45:00+03:00"
    end["matches"][0]["end_at_verified"]=True
    assert "DTEND:20270411T174500Z" in m.calendar(end)
    unverified=copy.deepcopy(end);unverified["matches"][0].pop("end_at_verified")
    try:m.validate(unverified)
    except ValueError:pass
    else:raise AssertionError("Unverified calendar end time accepted")
    all_day=copy.deepcopy(data)
    all_day["matches"][0].pop("start_at")
    all_day["matches"][0]["date"]="2027-04-11"
    all_day["matches"][0]["kickoff_status"]="time_to_be_announced"
    assert len(m.validate(all_day))==1
    ics=m.calendar(all_day)
    assert "DTSTART;VALUE=DATE:20270411" in ics
    assert "DTEND;VALUE=DATE:20270412" in ics
    assert "T153000Z" not in ics
    bad_day=copy.deepcopy(all_day);bad_day["matches"][0]["start_at"]="2027-04-11T18:30:00+03:00"
    try:m.validate(bad_day)
    except ValueError:pass
    else:raise AssertionError("Mixed known and unknown fixture time accepted")

    invalid_end=copy.deepcopy(end)
    invalid_end["matches"][0]["end_at"]="2027-04-11T17:00:00+03:00"
    try:m.validate(invalid_end)
    except ValueError:pass
    else:raise AssertionError("Unexpected negative match duration was accepted")

    for key,value in [
     ("start_at","2027-04-11T18:30:00+02:00"),
     ("start_at","2027-04-11T18:30:00"),
     ("home_team","Κάποια άλλη ομάδα"),
     ("sport","nonexistent")]:
      bad=copy.deepcopy(data);bad["matches"][0][key]=value
      try:m.validate(bad)
      except ValueError:pass
      else:raise AssertionError("Failed to reject "+key)
    away=copy.deepcopy(data)
    away["matches"][0]["home_team"]="ΑΣΕ Δούκας"
    away["matches"][0]["away_team"]="ΓΑΣ Αρχέλαος"
    try:m.validate(away)
    except ValueError:pass
    else:raise AssertionError("Away match accepted in home schedule")
    missing_policy=copy.deepcopy(data);missing_policy.pop("display_policy")
    try:m.validate(missing_policy)
    except ValueError:pass
    else:raise AssertionError("Home-only publication policy is missing")
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
