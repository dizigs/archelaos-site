#!/usr/bin/env python3
"""Read-only, bounded import of public VEL​​OS results for GAS Archelaos.

This is NOT an all-matches crawler. IDs must be supplied explicitly in
data/archery/velos-match-ids.json until a documented catalogue API is verified.
"""
import datetime as dt
import json
import os
import pathlib
import re
import time
import unicodedata
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
CONFIG = ROOT / "data/archery/velos-match-ids.json"
OUTPUT = ROOT / "data/archery/velos-results.json"
API = "https://api.archery.org.gr/matches/{}/results?include=matchPlayers,matchLeagues"
MAX_MATCHES = 20  # one bounded run; do not enumerate IDs
DELAY_SECONDS = 2

def normalize(value):
    t = unicodedata.normalize("NFD", str(value or "").upper())
    return re.sub(r"[^A-ZΑ-Ω0-9]", "", "".join(c for c in t if not unicodedata.combining(c)))

def is_archelaos(team):
    t = normalize(team)
    return "ΑΡΧΕΛΑΟΣ" in t or "ARCHELAOS" in t

def read_json(path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default

def fetch_match(mid):
    request = urllib.request.Request(API.format(mid), headers={
        "User-Agent": "archelaos.club-history-archive/1.0 (read-only; public competition results)",
        "Accept": "application/json"
    })
    with urllib.request.urlopen(request, timeout=20) as response:
        if response.status != 200:
            raise ValueError("Unexpected response HTTP {}".format(response.status))
        data = json.load(response)
    record = data.get("data")
    if not isinstance(record, dict) or record.get("match_id") != mid:
        raise ValueError("Unexpected API schema or match_id")
    return record

def extract(record):
    leagues = {v.get("league_id"): v.get("league", {}).get("league_name")
               for v in record.get("matchLeagues", []) if isinstance(v, dict)}
    results = []
    for p in record.get("matchPlayers", []):
        if not isinstance(p, dict) or not is_archelaos(p.get("teamName")):
            continue
        player = p.get("player") or {}
        results.append({
            "matchPlayerId": p.get("match_player_id"),
            "externalPlayerId": player.get("player_id"),
            "name": p.get("playerName"),
            "team": p.get("teamName"),
            "leagueId": p.get("league_id"),
            "leagueName": leagues.get(p.get("league_id")),
            "rank": p.get("total_rank"),
            "score": p.get("total_score")
        })
    if not results:
        return None
    return {
        "matchId": record["match_id"], "name": record.get("match_name"),
        "date": record.get("match_date"), "location": record.get("match_location"),
        "type": record.get("match_type"), "results": sorted(
            results, key=lambda x: (str(x["leagueId"]), str(x["rank"]), str(x["name"]))
        ),
        "sourceUrl": API.format(record["match_id"]),
    }

def main():
    config = read_json(CONFIG, {})
    ids = config.get("matchIds", [])
    if not isinstance(ids, list) or len(ids) > MAX_MATCHES or any(type(v) is not int or v < 1 for v in ids):
        raise SystemExit("Config must supply at most 20 positive integer match IDs")
    ids = sorted(set(ids))
    old = read_json(OUTPUT, {"version": 1, "matches": []})
    by_id = {v["matchId"]: v for v in old.get("matches", []) if isinstance(v, dict) and "matchId" in v}
    failures = []
    for i, mid in enumerate(ids):
        try:
            record = extract(fetch_match(mid))
            if record is None:
                by_id.pop(mid, None)
            else:
                by_id[mid] = record
            print("match={} status=ok archelaos_players={}".format(mid, len(record["results"]) if record else 0))
        except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
            failures.append(mid)
            print("match={} status=error reason={}".format(mid, type(exc).__name__))
        if i != len(ids) - 1:
            time.sleep(DELAY_SECONDS)
    if failures:
        raise SystemExit("Sync aborted; failed match IDs: {}".format(failures))
    payload = {"version": 1, "source": "VEL​​OS / Ελληνική Ομοσπονδία Τοξοβολίας",
               "scope": "Only explicitly configured matches and GAS Archelaos results",
               "matches": sorted(by_id.values(), key=lambda x: (str(x.get("date") or ""), x["matchId"]))}
    new_text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != new_text:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(new_text, encoding="utf-8")
        print("status=updated total_matches={}".format(len(payload["matches"])))
    else:
        print("status=unchanged total_matches={}".format(len(payload["matches"])))

if __name__ == "__main__":
    main()
