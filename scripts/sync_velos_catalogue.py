#!/usr/bin/env python3
"""Import the *public match catalogue* from the federation; no ID scanning.

Never imports private player profiles, passwords, registration data, or images.
This script reads one catalogue endpoint and stores only public competition metadata.
"""
import json
import pathlib
import urllib.request
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parents[1]
URL = "https://api.archery.org.gr/matches"
OUT = ROOT / "data/archery/velos-matches.json"

def extract(data):
    if not isinstance(data, dict) or not isinstance(data.get("data"), list):
        raise ValueError("Unexpected competition catalogue schema")
    by_id = {}
    for item in data["data"]:
        if not isinstance(item, dict):
            continue
        mid = item.get("match_id")
        if type(mid) is not int or mid < 1:
            continue
        raw_date = item.get("match_date")
        try:
            date.fromisoformat(raw_date)
            when = raw_date
        except (ValueError, TypeError):
            when = None
        by_id[mid] = {
            "matchId": mid,
            "name": item.get("match_name"),
            "date": when,
            "location": item.get("match_location"),
            "type": item.get("match_type"),
            "sourceUrl": "https://velos.archery.org.gr/results/" + str(mid)
        }
    return {"version": 1, "source": URL,
            "scope": "Public competition metadata only; not an exhaustive historical record",
            "matches": sorted(by_id.values(), key=lambda x: (x["date"] or "", x["matchId"]))}

def main():
    request = urllib.request.Request(URL, headers={
        "Accept": "application/json",
        "User-Agent": "archelaos.club-history-archive/1.0 (read-only public catalogue)"
    })
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status != 200:
            raise ValueError("Unexpected HTTP status")
        data = json.load(response)
    payload = extract(data)
    if not payload["matches"]:
        raise ValueError("Catalogue unexpectedly empty: not replacing previous snapshot")
    result = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    if not OUT.exists() or OUT.read_text(encoding="utf-8") != result:
        OUT.write_text(result, encoding="utf-8")
        print("catalogue=updated matches={}".format(len(payload["matches"])))
    else:
        print("catalogue=unchanged matches={}".format(len(payload["matches"])))

if __name__ == "__main__":
    main()
