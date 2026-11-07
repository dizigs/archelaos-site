#!/usr/bin/env python3
"""Build read-only index of *observed* GAS Archelaos participants, not Hall of Fame."""
import json
import pathlib
ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "data/archery/velos-results.json"
OUT = ROOT / "data/archery/velos-athletes.json"

def build(source):
    athletes = {}
    for match in source.get("matches", []):
        for entry in match.get("results", []):
            pid = entry.get("externalPlayerId")
            if not isinstance(pid, int) or pid < 1:
                continue
            key = str(pid)
            record = athletes.setdefault(key, {
                "velosPlayerId": pid, "namesObserved": [],
                "matches": [], "hallPersonId": None, "reviewStatus": "unmatched"
            })
            if entry.get("name") and entry["name"] not in record["namesObserved"]:
                record["namesObserved"].append(entry["name"])
            event = {
                "matchId": match["matchId"],
                "matchPlayerId": entry.get("matchPlayerId"),
                "date": match.get("date"), "league": entry.get("leagueName"),
                "rank": entry.get("rank"), "score": entry.get("score"),
                "sourceUrl": match.get("sourceUrl")
            }
            if event not in record["matches"]:
                record["matches"].append(event)
    for athlete in athletes.values():
        athlete["namesObserved"].sort()
        athlete["matches"].sort(key=lambda v: (v["date"] or "", v["matchId"]))
    return {"version": 1, "scope": "Observed Archelaos results only; not a complete athlete roster",
            "athletes": sorted(athletes.values(), key=lambda v: v["velosPlayerId"])}

def main():
    data = json.loads(SRC.read_text(encoding="utf-8"))
    result = json.dumps(build(data), indent=2, ensure_ascii=False) + "\n"
    if not OUT.exists() or OUT.read_text(encoding="utf-8") != result:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(result, encoding="utf-8")
        print("athletes=updated")
    else:
        print("athletes=unchanged")

if __name__ == "__main__":
    main()
