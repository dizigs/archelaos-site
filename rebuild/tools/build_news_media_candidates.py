#!/usr/bin/env python3
"""Internal, non-published media facets generated from canonical news records.

One news ID may describe an interview and a press clipping, but no second
copy of the underlying report is created. This file is a review artifact,
not a public archive, a claim of copyright, or a transcription.
"""
from pathlib import Path
import json
import re
import unicodedata
from news_pipeline_self_heal import ARCHIVE_KINDS, check

ROOT=Path(__file__).resolve().parents[2]


def _fold(text):
    """Accent/case-insensitive Greek/English matching on *article titles*."""
    return "".join(ch for ch in unicodedata.normalize("NFD", str(text or ""))
                   if unicodedata.category(ch)!="Mn").casefold().strip()[:300]


def suggest_archive_kinds(row):
    """Conservative, non-publishing suggestions; never change archiveKinds.

    Explicit editorial headings count as clues, not historical proof.
    Generic newspaper articles, quoted words in bodies and descriptions of
    someone else's interview are *not* enough to classify an article.
    """
    if (row.get("unverified") or not isinstance(row.get("id"), str) or
        not isinstance(row.get("title"), str) or
        not str(row.get("sourceUrl") or "").startswith("https://")):
        return []
    title=_fold(row["title"])
    current=set(row.get("archiveKinds") or [])
    suggestions=[]
    if re.match(r"^(?:(?:αποκλειστικη|exclusive)\s+)?συνεντευξη\b",title):
        if not re.match(r"^(?:αποκλειστικη\s+)?συνεντευξη\s+τυπου\b",title):
            if "interview" not in current:
                suggestions.append(("interview","explicit_interview_title"))
    elif re.match(r"^interview\s*(?:[:\-–—]|with\b)",title):
        if "interview" not in current:
            suggestions.append(("interview","explicit_interview_title"))
    if re.match(r"^(?:αποκομμα(?:\s+τυπου)?|press\s+clipping)\s*(?:[:\-–—]|απο\b|from\b)",title):
        if "press_clipping" not in current:
            suggestions.append(("press_clipping","explicit_clipping_title"))
    if re.match(r"^(?:δηλωση|statement)\s*[:\-–—]",title) and "statement" not in current:
        suggestions.append(("statement","explicit_statement_title"))
    return suggestions


def candidates(news,people):
    blockers=[f for f in check(news,people) if f["level"] in ("error","repairable")]
    if blockers:
        raise ValueError("Cannot derive archive candidates with unresolved source/identity faults: "+
                         ", ".join(sorted({f["code"] for f in blockers})))
    interviews=[]; press=[]; suggestions=[]
    for row in news:
        aid=row["id"]
        for kind,reason in suggest_archive_kinds(row):
            suggestions.append({
                "id":"review-"+kind+"-"+aid,
                "news_article_id":aid,
                "proposed_kind":kind,
                "reason":reason,
                "source_url":row["sourceUrl"],
                "title":row["title"],
                "speaker_needs_verification":kind in ("interview","statement"),
                "editorial_status":"needs_review",
                "auto_publish":False,
            })
        kinds=set(row.get("archiveKinds") or [])
        if not kinds:continue
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
    return {"schema_version":2,"publication_scope":"internal_candidates_only",
            "note":"Explicit, validated labels create facets. Title-only suggestions require source review; never auto-publish or infer speaker identity.",
            "interviews":interviews,"press_clippings":press,
            "classification_suggestions":suggestions}


if __name__=="__main__":
    news=json.loads((ROOT/"news.json").read_text("utf-8"))["items"]
    people=json.loads((ROOT/"hall-of-fame-people.json").read_text("utf-8"))["people"]
    report=candidates(news,people)
    path=ROOT/"rebuild/test-artifacts/news-media-candidates.json"
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n","utf-8")
    print(f"Source-backed media facets: {len(report['interviews'])} interviews/statements; "+
          f"{len(report['press_clippings'])} clippings; "+
          f"{len(report['classification_suggestions'])} review suggestions; internal only: {path}")
