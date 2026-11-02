#!/usr/bin/env python3
"""Build an internal, non-published event candidate ledger from news.json.

A news publication is evidence for a *candidate* event, not automatically
an event approval or proof of a person's role. Published date is not necessarily
the date when the underlying event happened.
"""
import json
import re
import unicodedata
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
def normalize(value):
    t=unicodedata.normalize("NFD",str(value).casefold())
    t="".join(ch for ch in t if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9α-ω]+"," ",t).strip()
def event_candidates(news,people):
    persons={p["id"] for p in people}
    events={}
    for article in news:
        aid=article["id"]
        assert aid and isinstance(aid,str)
        date=article.get("date","")
        sport=article.get("sport") or "Σύλλογος"
        title=article.get("title","")
        # A stable canonical grouping key; same event can later be merged by an
        # editor via an explicit event_id on each article.
        key=article.get("eventId") or "news-"+aid
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,160}",key):
            raise ValueError("Unsafe event ID: "+str(key))
        linked=[pid for pid in article.get("personIds",[]) if pid in persons]
        missing=[pid for pid in article.get("personIds",[]) if pid not in persons]
        if missing: raise ValueError(f"{aid} references missing people: {missing}")
        url=article.get("sourceUrl") or ""
        source={"news_id":aid,"source_url":url,"source_label":article.get("source","")}
        if key not in events:
            events[key]={"id":key,"title":title,"sport":sport,
                         "published_date":date,"event_date":article.get("eventDate") or None,
                         "event_date_verified":bool(article.get("eventDate")),
                         "summary":article.get("summary",""),
                         "editorial_status":"candidate","source_news_ids":[],
                         "sources":[],"person_ids":[]}
        rec=events[key]
        if normalize(rec["sport"])!=normalize(sport):
            raise ValueError(f"Event {key} mixes sports")
        if aid not in rec["source_news_ids"]:rec["source_news_ids"].append(aid)
        rec["sources"].append(source)
        rec["person_ids"]=sorted(set(rec["person_ids"])|set(linked))
    return {"schema_version":1,"publication_scope":"internal_candidates_only",
            "note":"A linked personId is inherited from news; identity/role must be checked before public event publication.",
            "events":sorted(events.values(),key=lambda e:(e["published_date"],e["id"]),reverse=True)}
def main():
    news=json.loads((ROOT/"news.json").read_text(encoding="utf-8"))["items"]
    people=json.loads((ROOT/"hall-of-fame-people.json").read_text(encoding="utf-8"))["people"]
    output=event_candidates(news,people)
    target=ROOT/"rebuild/test-artifacts/news-event-candidates.json"
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(output,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"News articles: {len(news)}; candidate event records: {len(output['events'])}; private staging: {target}")
if __name__=="__main__": main()
