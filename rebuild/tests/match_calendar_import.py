#!/usr/bin/env python3
"""Calendar import must never invent dates, treat recurrence as a single match,
or automatically publish user-provided events.
"""
import importlib.util,json
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("match_import",ROOT/"tools/import_match_calendar.py")
assert spec and spec.loader
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
ics="""BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:first@example.com
SUMMARY:Αρχέλαος - Αντίπαλος
DTSTART;TZID=Europe/Athens:20270328T200000
LOCATION:Κλειστό Κατερίνης
END:VEVENT
BEGIN:VEVENT
UID:allday@example.com
SUMMARY:Χωρίς ώρα
DTSTART;VALUE=DATE:20270403
END:VEVENT
BEGIN:VEVENT
UID:repeat@example.com
SUMMARY:Επαναλαμβανόμενο
DTSTART;TZID=Europe/Athens:20270407T190000
RRULE:FREQ=WEEKLY;COUNT=5
END:VEVENT
BEGIN:VEVENT
UID:cancel@example.com
SUMMARY:Ακυρωμένο
DTSTART:20270411T160000Z
STATUS:CANCELLED
END:VEVENT
END:VCALENDAR
"""
def main():
    with TemporaryDirectory() as tmp:
        folder=Path(tmp)
        one=folder/"handball.ics";one.write_bytes(ics.encode())
        z=folder/"volleyball.zip"
        with ZipFile(z,"w") as archive:archive.writestr("calendar/export.ics",ics)
        imported=mod.import_sources({"handball":[one],"volleyball":[z]})
        assert len(imported["candidates"])==6,imported
        assert len(imported["warnings"])==2
        dates=[x for x in imported["candidates"] if x["sport"]=="handball"]
        assert any(x["kickoff_candidate"]=="2027-03-28T20:00:00+03:00" for x in dates)
        assert any(x["kickoff_status"]=="all_day_time_unknown" for x in dates)
        assert any(x["calendar_status"]=="CANCELLED" for x in dates)
        assert all(x["review_required"] is True for x in imported["candidates"])
        assert imported["publication"]=="never_without_owner_review"
        assert mod.kickoff(({"TZID":"Europe/Athens"},"20270328T033000"))[1]=="invalid_dst_local_time"
        assert mod.kickoff(({},"20271031T033000"))[1]=="floating_time_needs_timezone"
        assert mod.kickoff(({"TZID":"Europe/Athens"},"20271031T033000"))[1]=="ambiguous_dst_local_time"
        assert mod.kickoff(({"TZID":"Europe/London"},"20270505T200000"))[1].startswith("unsupported_timezone")
        duplicates=mod.import_sources({"handball":[one,one]})
        assert any(x["reason"]=="duplicate_uid_requires_manual_comparison" for x in duplicates["warnings"])
    print("MATCH CALENDAR IMPORT QA OK: ICS/ZIP, folding, UTC/DST, all-day, cancellation, recurrence, duplicates.")
if __name__=="__main__":main()
