#!/usr/bin/env python3
"""Mutation tests for research-only, source-backed historical events."""
import copy
import importlib.util
import json
from pathlib import Path

r=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("verified_events",r/"tools"/"validate_verified_events.py")
assert spec and spec.loader
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

data=json.loads((r/"research"/"historical-events.json").read_text(encoding="utf-8"))
people=json.loads((r/"data"/"people.json").read_text(encoding="utf-8"))["people"]
moments=json.loads((r/"data"/"moments.json").read_text(encoding="utf-8"))["moments"]

def rejects(label,mutate):
    copy_data=copy.deepcopy(data)
    mutate(copy_data)
    try: m.validate(copy_data,people,moments)
    except ValueError: return
    raise AssertionError("Expected rejection: "+label)

def main():
    result=m.validate(data,people,moments)
    assert result["events"]>=12 and result["person_links"]>=2 and result["review_flags"]>=3
    assert data["events"][0]["temporal"]["precision"]=="season"
    rejects("unknown person",lambda d:d["events"][0]["associations"]["people"][0].update(person_id="arch-not-real"))
    rejects("person spoof",lambda d:d["events"][0]["associations"]["people"][0].update(name="Other Person"))
    rejects("uncited people",lambda d:d["events"][0]["associations"]["people"][0].update(source_id="sportfm-cup-history"))
    rejects("bad source",lambda d:d["events"][0]["source_ids"].append("fake-source"))
    rejects("duplicate event",lambda d:d["events"].append(copy.deepcopy(d["events"][0])))
    rejects("fake day on season",lambda d:d["events"][0]["temporal"].update(date="1983-06-01"))
    rejects("private Drive source",lambda d:d["source_registry"][0].update(url="https://drive.google.com/file/d/private"))
    rejects("news scraping",lambda d:d["policies"].update(news_scraping=True))
    rejects("auto publication",lambda d:d["policies"].update(automatic_publication=True))
    rejects("hide conflict",lambda d:d["review_flags"][0].update(status="resolved"))
    assert len(result["sport_coverage"]) == 9
    assert all(result["sport_coverage"][s]["documented_events"]>0 for s in result["sport_coverage"])
    assert result["unverified_queue"] >= 8
    rejects("lost sports coverage",lambda d:d["department_registry"].pop())
    rejects("untracked categories",lambda d:d["events"][-1].update(sports=["nonexistent"]))
    rejects("unverified events being published",lambda d:d["policies"].update(strict_evidence_only=False))
    rejects("unapproved biography writes",lambda d:d["policies"].update(no_auto_write_to_biographies=False))
    rejects("made-up exact date",lambda d:d["events"][-1]["temporal"].update(month=4))
    rejects("hide missing evidence queue",lambda d:d.pop("research_queue"))
    print("ALL DEPARTMENTS QA OK: 8 current + historic basketball, strict evidence and pending queue.")
    print("HISTORICAL EVENT QA OK: identity, sources, dates, privacy, conflicts, no auto-publish.")


if __name__=="__main__":main()
