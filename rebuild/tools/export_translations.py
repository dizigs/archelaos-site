#!/usr/bin/env python3
"""Export existing repository-authored English text; never synthesize translations."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data"
OUT=ROOT/"i18n"/"content"/"en"

def load(name):
    return json.loads((DATA/(name+".json")).read_text(encoding="utf-8"))

def write(name,source):
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/name).write_text(json.dumps(source,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

def run():
    p=load("people")["people"]
    m=load("moments")["moments"]
    s=load("stories")["stories"]
    museum=load("museum")
    board=load("board")
    people={"schema_version":1,"language":"en","review_status":"needs_editorial_comparison",
        "source":"rebuild/data/people.json","people":[
            {"id":x["id"],"name":x["name_en"],"role":x["role_en"],"biography":x["bio_en"]} for x in p]}
    moments={"schema_version":1,"language":"en","review_status":"needs_editorial_comparison",
        "source":"rebuild/data/moments.json","moments":[
            {"id":x["id"],"year":x["year"],"title":x["title_en"],
             "paragraphs":x["body_en"],"source":x.get("source_en","")} for x in m]}
    short=[x["id"] for x in p if len(x["bio_en"]) < len(x["bio"])*.7]
    report={"schema_version":1,"language":"en","verified_as_complete":False,"published":False,
      "generated_from_existing_verified_repository_text":True,
      "counts":{"biography_texts":len(p),"moments":len(m),"untranslated_stories":len(s),
        "embedded_bilingual_museum_articles":sum('data-lang="en"' in a["html"] for a in museum["articles"]),
        "embedded_bilingual_museum_press":sum('data-lang="en"' in a["html"] for a in museum["press"]),
        "embedded_bilingual_board_eras":sum('data-lang="en"' in a["html"] for a in board["eras"]),
        "shorter_biographies_for_comparison":len(short)},
      "review_queue":{"abridged_or_short_biography_ids":short,
        "stories":[{"id":i+1,"title_el":x["title"],"status":"translation_needed"} for i,x in enumerate(s)],
        "museum":"English text is mixed into source HTML. Separate extraction and editorial review required.",
        "other_languages":"German, French, Spanish and Italian have navigation/interface-only drafts; no full content."}}
    write("people.json",people)
    write("moments.json",moments)
    write("coverage.json",report)
    print("English archive texts exported to offline i18n folder, not published.")

if __name__=="__main__":
    run()
