#!/usr/bin/env python3
"""Ensure visible evidence requests are neutral, bounded and never historic claims."""
from pathlib import Path
import json
import re
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data/verification-requests.json"
RESEARCH=ROOT/"research/historical-events.json"

def validate(data):
    assert data["schema_version"]==1
    assert data["policy"]["no_unreviewed_claims"] is True
    assert data["policy"]["no_user_content_displayed"] is True
    ids=set();sports=set()
    for row in data["requests"]:
        assert re.fullmatch(r"request-[a-z-]{8,100}",row["id"]),row
        assert row["id"] not in ids
        ids.add(row["id"]);sports.add(row["sport"])
        assert row["status"]=="awaiting_evidence"
        assert row["public_safe"] is True
        assert row["kind"]=="neutral_document_request"
        assert 12<=len(row["prompt"])<=500
        assert 12<=len(row["evidence_needed"])<=200
        assert "source_ids" not in row and "people" not in row and "result" not in row
    reg=json.loads(RESEARCH.read_text(encoding="utf-8"))["department_registry"]
    assert sports=={x["id"] for x in reg}, "All departments need an honest contribution request"
    content=(ROOT/"contribute.html").read_text(encoding="utf-8")
    assert 'id="archive-verification"' in content and "Προς <em>τεκμηρίωση" in content
    assert "/rebuild/js/verification-requests.js" in content
    assert "mailto:info@archelaos.club" in content
    print("PUBLIC EVIDENCE REQUESTS OK:",len(ids),"neutral, source-seeking requests across all departments")

if __name__=="__main__":
    validate(json.loads(DATA.read_text(encoding="utf-8")))
