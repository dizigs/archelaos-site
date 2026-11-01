#!/usr/bin/env python3
"""Produce stable, revisable weekly training subscriptions from one public schedule.

Every deploy regenerates the *same* URLs. Subscribe using webcal:// or the HTTPS
feed URL; downloading an ICS once does not subscribe to future changes.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import re
from build_match_schedule import ics_escape, fold

DAYS = ("MO", "TU", "WE", "TH", "FR", "SA", "SU")
TOKEN = re.compile(r"^[a-z][a-z0-9-]{1,49}$")
CLOCK = re.compile(r"^(?:[01]\\d|2[0-3]):[0-5]\\d$")


def validate(data: dict) -> dict:
    if data.get("schema_version") != 1 or data.get("timezone") != "Europe/Athens":
        raise ValueError("Unknown training calendar schema or timezone")
    groups = data.get("departments")
    if not isinstance(groups, dict) or len(groups) > 25:
        raise ValueError("Invalid training departments")
    stamp = datetime.fromisoformat(data["updated_at"].replace("Z", "+00:00"))
    if not stamp.tzinfo or stamp.utcoffset() != timedelta(0):
        raise ValueError("Training calendar updated_at must be UTC")
    for department, details in groups.items():
        if not TOKEN.fullmatch(department) or not isinstance(details, dict):
            raise ValueError("Invalid department key")
        if not isinstance(details.get("name"), str) or not details["name"].strip():
            raise ValueError("Missing department name")
        sessions = details.get("sessions")
        if not isinstance(sessions, list) or len(sessions) > 25:
            raise ValueError("Invalid weekly training sessions")
        seen = set()
        for session in sessions:
            ident = session.get("id", "")
            if not isinstance(ident, str) or not TOKEN.fullmatch(ident) or ident in seen:
                raise ValueError("Missing, repeated or unsafe training session ID")
            seen.add(ident)
            if not isinstance(session.get("label"), str) or not session["label"].strip():
                raise ValueError("Missing training session label")
            days = session.get("days")
            if not isinstance(days, list) or not days or len(set(days)) != len(days) or any(d not in DAYS for d in days):
                raise ValueError("Training days must be unique weekdays")
            for k in ("starts", "ends"):
                if not isinstance(session.get(k), str) or not CLOCK.fullmatch(session[k]):
                    raise ValueError("Invalid training time")
            if session["starts"] >= session["ends"]:
                raise ValueError("Training end time must follow start time, same day")
            start = date.fromisoformat(session["valid_from"])
            if not 2020 <= start.year <= 2100:
                raise ValueError("Implausible first training date")
            if type(session.get("revision")) is not int or not 1 <= session["revision"] < 1000000:
                raise ValueError("Training revision must be a positive integer")
            if not isinstance(session.get("location", ""), str):
                raise ValueError("Invalid training location")
    return groups


def calendar(data: dict, department: str | None = None) -> str:
    groups = validate(data)
    if department is not None and department not in groups:
        raise ValueError("No published training calendar for department " + department)
    selection = {department: groups[department]} if department else groups
    stamp = datetime.fromisoformat(data["updated_at"].replace("Z", "+00:00"))
    updated = stamp.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    title = ("ΓΑΣ Αρχέλαος · " + selection[department]["name"] + " · Προπονήσεις"
             if department else "ΓΑΣ Αρχέλαος · Προπονήσεις")
    lines = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH", "PRODID:-//GAS Archelaos Katerini//Live Trainings//EL",
        "X-WR-CALNAME:" + ics_escape(title), "X-WR-TIMEZONE:Europe/Athens",
        "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
        "BEGIN:VTIMEZONE", "TZID:Europe/Athens", "X-LIC-LOCATION:Europe/Athens",
        "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0300",
        "TZNAME:EEST", "DTSTART:19700329T030000",
        "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
        "BEGIN:STANDARD", "TZOFFSETFROM:+0300", "TZOFFSETTO:+0200",
        "TZNAME:EET", "DTSTART:19701025T040000",
        "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
        "END:VTIMEZONE"
    ]
    for key, group in selection.items():
        for session in group["sessions"]:
            first = date.fromisoformat(session["valid_from"])
            delta = min((DAYS.index(day) - first.weekday()) % 7 for day in session["days"])
            first += timedelta(days=delta)
            daystr = first.strftime("%Y%m%d")
            begin = daystr + "T" + session["starts"].replace(":", "") + "00"
            end = daystr + "T" + session["ends"].replace(":", "") + "00"
            summary = "ΓΑΣ Αρχέλαος · " + group["name"] + " · " + session["label"]
            lines.extend([
                "BEGIN:VEVENT",
                "UID:training-" + key + "-" + session["id"] + "@archelaos.club",
                "DTSTAMP:" + updated, "LAST-MODIFIED:" + updated,
                "SEQUENCE:" + str(session["revision"]),
                "DTSTART;TZID=Europe/Athens:" + begin,
                "DTEND;TZID=Europe/Athens:" + end,
                "RRULE:FREQ=WEEKLY;BYDAY=" + ",".join(sorted(session["days"], key=DAYS.index)),
                "SUMMARY:" + ics_escape(summary),
                "STATUS:CONFIRMED",
                "TRANSP:OPAQUE",
                "URL:https://archelaos.club/tmimata.html#sport-" + key
            ])
            if session.get("location"):
                lines.append("LOCATION:" + ics_escape(session["location"]))
            lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return "\\r\\n".join(part for line in lines for part in fold(line)) + "\\r\\n"
