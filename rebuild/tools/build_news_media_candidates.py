#!/usr/bin/env python3
"""Internal, non-published media facets generated from canonical news records.

One news ID may describe an interview and a press clipping, but no second
copy of the underlying report is created. This file is a review artifact,
not a public archive, a claim of copyright, or a transcription.
"""
from pathlib import Path
import json
from news_pipeline_self_heal import ARCHIVE_KINDS, check

ROOT=Path(__file__).resolve().parents[2]

def candidates(news,people):
    blockers=[f for f in check(news,people) if f["level"] in ("error","repairable")]
    if blockers:
        raise ValueError("Cannot derive archive candidates with unresolved source/identity faults: "+
                         ", ".join(sorted({f["code"] for f in blockers})))
    interviews=[]; press=[]
    for row in news:
        kinds=set(row.get("archiveKinds") or [])
        if not kinds:continue
        aid=row["id"]
        source={"news_id":aid,"url":row["sourceUrl"],"label":row.get("source","")}
        common={"news_article_id":aid,"event_id":row.get("eventId") or "news-"+aid,
                "date":row.get("eventDate") or row.get("date"),
                "title":row["title"],"person_ids":list(row.get("personIds") or []),
                "source":source,"editorial_status":"candidate"}
        if "interview" in kinds or "statement" in kinds:
            interviews.append(dict(common,id="news-"+aid,
                kind="interview" if "interview" in kinds else "statement",
                speaker=row["intervieweeName"],
                speaker_person_id=row.get("intervieweePersonId")))
        if "press_clipping" in kinds:
            press.append(dict(common,id="press-news-"+aid,kind="press_clipping"))
    return {"schema_version":1,"publication_scope":"internal_candidates_only",
            "note":"Labels are editorial, not inferred from keywords; approve before making separate archival profile pages.",
            "interviews":interviews,"press_clippings":press}

if __name__=="__main__":
    news=json.loads((ROOT/"news.json").read_text("utf-8"))["items"]
    people=json.loads((ROOT/"hall-of-fame-people.json").read_text("utf-8"))["people"]
    report=candidates(news,people)
    path=ROOT/"rebuild/test-artifacts/news-media-candidates.json"
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n","utf-8")
    print(f"Source-backed media facets: {len(report['interviews'])} interviews/statements; "+
          f"{len(report['press_clippings'])} clippings; internal only: {path}")
