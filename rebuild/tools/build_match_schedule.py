#!/usr/bin/env python3
"""Validate owner-reviewed match fixtures and build a public iCalendar snapshot.

Never imports directly from raw ICS. No unapproved, unverified or guessed
match goes to the website. The published ICS is updated with every approved
rebuild. The date source must include an explicit UTC offset.
"""
from __future__ import annotations
from datetime import datetime,timezone
from pathlib import Path
from zoneinfo import ZoneInfo
import json,re
import unicodedata

ATHENS=ZoneInfo("Europe/Athens")
SPORTS={"handball","volleyball"}
STATES={"scheduled","postponed","cancelled"}
SAFE=re.compile(r"^[^<>\x00-\x1f]{1,180}$")

def validate(data:dict)->list[dict]:
    if data.get("schema_version")!=1 or data.get("timezone")!="Europe/Athens" or data.get("approval_policy")!="owner_approved_only":
        raise ValueError("Unknown schedule schema / approval policy")
    if not isinstance(data.get("matches"),list) or len(data["matches"])>500:
        raise ValueError("Invalid match count")
    ids=set();results=[];fingerprints=set()
    for m in data["matches"]:
        ident=m.get("id","")
        if not re.fullmatch(r"fixture-[a-z0-9-]{10,90}",ident) or ident in ids:
            raise ValueError("Duplicate / invalid fixture ID")
        if m.get("sport") not in SPORTS or m.get("status") not in STATES:
            raise ValueError("Unknown sport or game status")
        if m.get("approval",{}).get("status")!="owner_approved" or not m["approval"].get("reviewed_on"):
            raise ValueError("Every match must be explicitly owner-approved")
        try:
            dt=datetime.fromisoformat(m.get("start_at",""))
            if dt.tzinfo is None or dt.utcoffset() is None:
                raise ValueError("Unconfirmed match time zone")
            dt=dt.astimezone(ATHENS)
            datetime.fromisoformat(m["approval"]["reviewed_on"])
        except (ValueError,TypeError,KeyError) as exc:
            raise ValueError("Match date or review date invalid") from exc
        if not 2020<=dt.year<=2100:raise ValueError("Implausible match date")
        for key in ("home_team","away_team"):
            if not isinstance(m.get(key),str) or not SAFE.fullmatch(m[key]) or len(m[key].strip())<2:
                raise ValueError("Missing / unsafe team name")
        if m["home_team"].strip().casefold()==m["away_team"].strip().casefold():
            raise ValueError("Same team in both sides")
        def normalized(value: str) -> str:
            return "".join(ch for ch in unicodedata.normalize("NFD",value.casefold())
                           if not unicodedata.combining(ch))
        if not any("αρχελα" in normalized(n) or "archela" in normalized(n) for n in
                   (m["home_team"],m["away_team"])):
            raise ValueError("Neither side identifies Archelaos; manual review required")
        for key in ("venue","competition"):
            val=m.get(key,"")
            if not isinstance(val,str) or (val and not SAFE.fullmatch(val)):
                raise ValueError("Invalid optional field "+key)
        src=m.get("source",{})
        if not isinstance(src,dict) or not isinstance(src.get("label"),str) or not SAFE.fullmatch(src["label"]):
            raise ValueError("Every fixture needs a real traceable program label")
        uid=m.get("source_uid_hash")
        if uid is not None and not re.fullmatch(r"fixture-[0-9a-f]{18}",uid):
            raise ValueError("Unexpected imported UID hash")
        signature=(m["sport"],dt.isoformat(),m["home_team"].casefold(),m["away_team"].casefold())
        if signature in fingerprints:raise ValueError("Duplicate fixture information")
        fingerprints.add(signature);ids.add(ident);results.append(m)
    return results

def ics_escape(value:str)->str:
    return value.replace("\\","\\\\").replace("\n","\\n").replace(",","\\,").replace(";","\\;")

def fold(line:str):
    # RFC 5545 uses 75 OCTETS per physical line, not 75 Unicode characters.
    output=[];chunk="";length=0
    for char in line:
        n=len(char.encode("utf-8"))
        if length+n>75:
            output.append(chunk);chunk=" "+char;length=1+n
        else:chunk+=char;length+=n
    if chunk:output.append(chunk)
    return output

def calendar(data:dict)->str:
    records=validate(data)
    lines=["BEGIN:VCALENDAR","VERSION:2.0",
           "PRODID:-//GAS Archelaos Katerini//Public Match Calendar//EL",
           "CALSCALE:GREGORIAN","METHOD:PUBLISH","X-WR-CALNAME:ΓΑΣ Αρχέλαος · Αγώνες",
           "X-WR-TIMEZONE:Europe/Athens"]
    for m in records:
        dt=datetime.fromisoformat(m["start_at"]).astimezone(timezone.utc)
        lines+=["BEGIN:VEVENT","UID:"+m["id"]+"@archelaos.club",
                "DTSTAMP:"+datetime.fromisoformat(m["approval"]["reviewed_on"]).astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ"),
                "DTSTART:"+dt.strftime("%Y%m%dT%H%M%SZ"),
                "SUMMARY:"+ics_escape(m["home_team"]+" - "+m["away_team"]),
                "CATEGORIES:"+("HANDBALL" if m["sport"]=="handball" else "VOLLEYBALL"),
                "STATUS:"+("CANCELLED" if m["status"]=="cancelled" else "TENTATIVE" if m["status"]=="postponed" else "CONFIRMED")]
        if m.get("venue"):lines.append("LOCATION:"+ics_escape(m["venue"]))
        if m.get("competition"):lines.append("DESCRIPTION:"+ics_escape(m["competition"]))
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return "\r\n".join(part for line in lines for part in fold(line))+"\r\n"

def main():
    root=Path(__file__).resolve().parents[1]
    path=root/"data/match-schedule.json"
    data=json.loads(path.read_text(encoding="utf-8"))
    records=validate(data)
    print("MATCH SCHEDULE QA:",len(records),"approved records; no raw calendar auto-publication.")

if __name__=="__main__":main()
