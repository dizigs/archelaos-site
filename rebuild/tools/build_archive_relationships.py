#!/usr/bin/env python3
"""Generate reciprocal public archive relationships from existing canonical IDs.

This never creates facts, people, articles, publication approvals or duplicates.
Only explicit references already present in public datasets become edges.
Private Drive records and unpublished research queues never enter this graph.
"""
from __future__ import annotations
import json
import re
from pathlib import Path
from urllib.parse import quote

ROOT=Path(__file__).resolve().parents[2]
SPORTS={
    "χαντμπολ":"handball","χειροσφαιριση":"handball","handball":"handball",
    "τοξοβολια":"archery","archery":"archery",
    "στιβος":"track","κλασικος αθλητισμος":"track","track":"track",
    "σκοποβολια":"shooting","shooting":"shooting",
    "παλη":"wrestling","wrestling":"wrestling",
    "ενοργανη":"gymnastics","ενοργανη γυμναστικη":"gymnastics","gymnastics":"gymnastics",
    "βολει":"volleyball","πετοσφαιριση":"volleyball","volleyball":"volleyball",
    "κολυμβηση":"swimming","swimming":"swimming",
}
def norm(value):
    import unicodedata
    return "".join(ch for ch in unicodedata.normalize("NFD",str(value or "").lower())
                   if not unicodedata.combining(ch)).replace("ς","σ").strip()

def sport_id(label):
    return SPORTS.get(norm(label))

def uri(value):
    return quote(str(value),safe="")

def compile_graph(*,people,news,moments,stories,interviews,museum,home,history):
    nodes={}
    edges={}
    def put(kind,id_,title,href=None):
        key=f"{kind}:{id_}"
        if key in nodes:
            raise ValueError("Duplicate node "+key)
        nodes[key]={"type":kind,"id":str(id_),"title":str(title),"url":href}
        return key
    def connect(a,b,relation):
        if a not in nodes or b not in nodes:
            raise ValueError(f"Unknown relationship {a} ↔ {b}")
        if a==b:return
        ends=tuple(sorted([a,b]))
        # One canonical relation per pair; retain first direct provenance.
        if ends not in edges:
            edges[ends]={"a":a,"b":b,"relation":relation}
    def link_person(source,pid,relation):
        target="person:"+str(pid)
        if target not in nodes: raise ValueError("Unknown person ID: "+str(pid))
        connect(source,target,relation)
    for p in people:
        put("person",p["id"],p["name"],"/hall-of-fame.html?person="+uri(p["id"]))
    for sport in home:
        put("department",sport["key"],sport["name"],"/tmimata.html#sport-"+uri(sport["key"]))
    for m in moments:
        put("moment",m["id"],m["title"],"/70-stigmes.html#moment-"+uri(m["id"]))
    for i,s in enumerate(stories,1):
        put("story",i,s["title"],"/stories.html#story-"+uri(i))
    for v in interviews:
        put("interview",v["id"],v["name"],"/interviews.html?record="+uri(v["id"]))
    for x in [*museum.get("articles",[]),*museum.get("press",[])]:
        put("exhibit",x["id"],x["title"],"/history.html#archive-"+uri(x["id"]))
    # Legacy event records have no dedicated public event route yet. Retain only
    # explicit relationships. A link is displayed only when the node has a route.
    for x in history:
        put("event",x["id"],x["title"])
    # A canonical event can have several articles. The first publication link is
    # chosen deterministically; no second event is created for multiple sources.
    items=sorted((x for x in news if not x.get("unverified") and x.get("id")),
                 key=lambda x:(str(x.get("date","")),str(x["id"])))
    for x in items:
        put("news",x["id"],x["title"],"/news.html?article="+uri(x["id"]))
    for x in items:
        art="news:"+x["id"]
        for pid in sorted(set(x.get("personIds") or [])):
            link_person(art,pid,"named_in_news")
        sport=sport_id(x.get("sport"))
        if sport and "department:"+sport in nodes:
            connect(art,"department:"+sport,"department_news")
        event=x.get("eventId")
        if event and x.get("eventDate") and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,160}",str(event)):
            eid="event:"+str(event)
            if eid not in nodes:
                put("event",event,x["title"],"/news.html?article="+uri(x["id"]))
            elif not nodes[eid]["url"]:
                # An archival event without a direct page may be opened through
                # the exact published news article, when that event ID matches.
                nodes[eid]["url"]="/news.html?article="+uri(x["id"])
            connect(art,eid,"news_evidence")
    for i,s in enumerate(stories,1):
        node="story:"+str(i)
        for pid in sorted(set(s.get("relatedPeople") or [])):
            link_person(node,pid,"story_person")
        for eid in sorted(set(s.get("relatedEvents") or [])):
            if "event:"+eid not in nodes:
                raise ValueError("Story references unknown event "+eid)
            connect(node,"event:"+eid,"story_event")
        sport=sport_id(s.get("sport"))
        if sport and "department:"+sport in nodes:
            connect(node,"department:"+sport,"department_story")
    for v in interviews:
        node="interview:"+str(v["id"])
        for pid in sorted(set([*(v.get("personIds") or []),
                               *(p.get("id") for p in (v.get("relatedPeople") or []) if p.get("id"))])):
            link_person(node,pid,"interview_person")
        if v.get("newsArticleId") and "news:"+str(v["newsArticleId"]) in nodes:
            connect(node,"news:"+str(v["newsArticleId"]),"interview_article")
        sport=sport_id(v.get("sport"))
        if sport and "department:"+sport in nodes:
            connect(node,"department:"+sport,"department_interview")
        for entry in v.get("eventLinks") or []:
            href=str(entry.get("href") or "")
            m=re.fullmatch(r"(?:/)?70-stigmes\.html#moment-(\d+)",href)
            if m and "moment:"+m.group(1) in nodes:
                connect(node,"moment:"+m.group(1),"interview_moment")
            m=re.fullmatch(r"(?:/)?history\.html#sport-([a-z]+)",href)
            if m and "department:"+m.group(1) in nodes:
                connect(node,"department:"+m.group(1),"interview_department")
    for x in history:
        event="event:"+x["id"]
        for pid in sorted(set(x.get("people") or [])):
            link_person(event,pid,"historical_person")
    for a in museum.get("articles",[]):
        if "department:"+str(a["id"]) in nodes:
            connect("exhibit:"+a["id"],"department:"+a["id"],"department_exhibit")
    by_node={key:[] for key in nodes}
    for edge in edges.values():
        a,b=edge["a"],edge["b"]
        by_node[a].append({"key":b,"relation":edge["relation"]})
        by_node[b].append({"key":a,"relation":edge["relation"]})
    for refs in by_node.values():
        refs.sort(key=lambda item:(item["key"],item["relation"]))
    return {"schema_version":1,"policy":"explicit_public_references_only",
            "nodes":{k:nodes[k] for k in sorted(nodes)},
            "edges":sorted(edges.values(),key=lambda e:(e["a"],e["b"],e["relation"])),
            "by_node":{k:by_node[k] for k in sorted(by_node)},
            "counts":{"nodes":len(nodes),"edges":len(edges)}}

def read(path):
    return json.loads((ROOT/path).read_text(encoding="utf-8"))

def generate():
    graph=compile_graph(
        people=read("hall-of-fame-people.json")["people"],
        news=read("news.json")["items"],
        moments=read("rebuild/data/moments.json")["moments"],
        stories=read("rebuild/data/stories.json")["stories"],
        interviews=read("rebuild/data/interviews.json")["items"],
        museum=read("rebuild/data/museum.json"),
        home=read("rebuild/data/home.json")["sports"],
        history=read("archelaos-history-events.json")["events"])
    if graph["counts"]["nodes"]<1000:
        raise ValueError("Incomplete public archive relationship graph")
    return graph

if __name__=="__main__":
    g=generate()
    print("PUBLIC ARCHIVE LINKS:",g["counts"]["nodes"],"nodes,",g["counts"]["edges"],"provenance-backed edges")
