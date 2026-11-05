#!/usr/bin/env python3
"""Import Google/Apple/Outlook .ics/.zip as a REVIEW-ONLY match calendar.

Never guesses opponents, home/away, teams or kickoff times. Unsupported
recurrences, changed UID records and ambiguous times need manual verification.
The output is only a gitignored local draft. Nothing is pushed or published.
"""
from __future__ import annotations
import argparse
from io import BytesIO
from datetime import datetime,timezone
from hashlib import sha256
import json
from pathlib import Path, PurePosixPath
import re
from zipfile import ZipFile, BadZipFile
from zoneinfo import ZoneInfo

try:
    from .public_snapshot import output_directory, replace_report, validate_reports
    from .secure_import_io import read_export
except ImportError:
    from public_snapshot import output_directory, replace_report, validate_reports
    from secure_import_io import read_export

REPORT_NAME="match-calendar-review.json"
REPORT_CHOICE="rebuild/test-artifacts/"+REPORT_NAME
ATHENS=ZoneInfo("Europe/Athens")
MAX_INPUT=5_000_000
MAX_EVENTS=3000

def unescape(value:str)->str:
    return re.sub(r"\\([nN,;\\])",lambda m: "\n" if m[1].lower()=="n" else m[1],value).strip()[:350]

def ics_lines(blob:bytes)->list[str]:
    if len(blob)>MAX_INPUT:raise ValueError("Calendar file exceeds 5MB")
    raw=blob.decode("utf-8-sig")
    lines=[]
    for line in raw.replace("\r\n","\n").replace("\r","\n").split("\n"):
        if line.startswith((" ","\t")):
            if not lines:raise ValueError("Unexpected folded line")
            lines[-1]+=line[1:]
        elif line:lines.append(line)
    if "BEGIN:VCALENDAR" not in lines or "END:VCALENDAR" not in lines:
        raise ValueError("Not an iCalendar export")
    return lines

def parse_property(line:str):
    left,sep,value=line.partition(":")
    if not sep:return None
    bits=left.split(";")
    attrs={}
    for bit in bits[1:]:
        k,eq,v=bit.partition("=")
        if eq:attrs[k.upper()]=v.strip('"')
    return bits[0].upper(),attrs,value

def events(blob:bytes):
    all_events=[];item=None
    for line in ics_lines(blob):
        if line=="BEGIN:VEVENT":
            if item is not None:raise ValueError("Nested VEVENT")
            item={}
        elif line=="END:VEVENT":
            if item is None:raise ValueError("Unmatched VEVENT end")
            all_events.append(item);item=None
        elif item is not None:
            prop=parse_property(line)
            if prop:
                k,attrs,val=prop
                if k not in item:item[k]=(attrs,val)
    if item is not None:raise ValueError("Unterminated VEVENT")
    if len(all_events)>MAX_EVENTS:raise ValueError("Too many calendar events")
    return all_events

def kickoff(field):
    if not field:return None,"missing_kickoff"
    params,value=field
    if params.get("VALUE")=="DATE" or re.fullmatch(r"\d{8}",value):
        return value[:4]+"-"+value[4:6]+"-"+value[6:8],"all_day_time_unknown"
    try:
        is_utc=value.endswith("Z")
        stamp=value[:-1] if is_utc else value
        if re.fullmatch(r"\d{8}T\d{6}",stamp):
            dt=datetime.strptime(stamp,"%Y%m%dT%H%M%S")
        elif re.fullmatch(r"\d{8}T\d{4}",stamp):
            dt=datetime.strptime(stamp,"%Y%m%dT%H%M")
        else:return None,"invalid_datetime"
        tz=params.get("TZID","")
        if is_utc:
            if tz:return None,"contradictory_utc_tzid"
            dt=dt.replace(tzinfo=timezone.utc).astimezone(ATHENS)
        elif tz in {"Europe/Athens",""}:
            # A floating time from an export isn't guaranteed to be Athens time.
            if not tz:return dt.isoformat(),"floating_time_needs_timezone"
            local=dt.replace(tzinfo=ATHENS)
            roundtrip=local.astimezone(timezone.utc).astimezone(ATHENS).replace(tzinfo=None)
            if roundtrip!=dt:return None,"invalid_dst_local_time"
            # Ambiguous clock times during the autumn transition MUST be reviewed.
            if local.replace(fold=1).utcoffset()!=local.utcoffset():
                return dt.isoformat(),"ambiguous_dst_local_time"
            dt=local
        else:
            return dt.isoformat(),"unsupported_timezone_"+tz[:35]
        return dt.isoformat(),"known"
    except (ValueError,OverflowError):
        return None,"invalid_datetime"

def load_sources(path:Path):
    blob=read_export(path,{".ics",".zip"},MAX_INPUT)
    suffix=path.suffix.lower()
    if suffix==".ics":
        return [(path.name,blob)]
    if suffix!=".zip":raise ValueError("Only .ics and .zip exports are supported")
    result=[]
    with ZipFile(BytesIO(blob)) as archive:
        infos=[x for x in archive.infolist() if not x.is_dir()]
        if len(infos)>30:raise ValueError("Too many files in calendar ZIP")
        expanded=0
        for member in infos:
            pp=PurePosixPath(member.filename)
            if pp.is_absolute() or ".." in pp.parts or "\\" in member.filename:
                raise ValueError("Unsafe ZIP member path")
            if member.file_size>MAX_INPUT:raise ValueError("Oversized ZIP member")
            if member.filename.lower().endswith(".ics"):
                expanded+=member.file_size
                if expanded>MAX_INPUT:raise ValueError("Calendar ZIP expanded content exceeds 5MB")
                with archive.open(member) as stream:
                    content=stream.read(MAX_INPUT+1)
                if len(content)>MAX_INPUT:raise ValueError("Oversized expanded calendar")
                result.append((member.filename,content))
    if not result:raise ValueError("ZIP contains no .ics calendars")
    return result

def import_sources(paths:dict[str,list[Path]])->dict:
    candidates=[];warnings=[];ids={}
    for sport in ("handball","volleyball"):
        for file in paths.get(sport,[]):
            for subfile,blob in load_sources(file):
                for n,item in enumerate(events(blob),1):
                    text=lambda k: unescape(item.get(k,({},''))[1])
                    uid=text("UID")
                    if not uid:
                        warnings.append({"sport":sport,"file":subfile,"row":n,"reason":"missing_uid"});continue
                    identifier="fixture-"+sha256((sport+"|"+uid).encode()).hexdigest()[:18]
                    if any(k in item for k in ("RRULE","RDATE","EXDATE","RECURRENCE-ID")):
                        warnings.append({"sport":sport,"file":subfile,"row":n,"id":identifier,"reason":"recurrence_needs_expansion_review"});continue
                    start,time_status=kickoff(item.get("DTSTART"))
                    status=text("STATUS").upper() or "CONFIRMED"
                    summary=text("SUMMARY")
                    if not summary or not start:
                        warnings.append({"sport":sport,"file":subfile,"row":n,"reason":"missing_title_or_date"});continue
                    candidate={
                        "id":identifier,"sport":sport,"title_from_calendar":summary,
                        "kickoff_candidate":start,"kickoff_status":time_status,
                        "location_from_calendar":text("LOCATION"),
                        "calendar_status":status,
                        "source_calendar":file.name,"source_member":subfile,
                        "review_required":True
                    }
                    if identifier in ids:
                        warnings.append({"sport":sport,"file":subfile,"id":identifier,
                            "reason":"duplicate_uid_requires_manual_comparison",
                            "same_content":ids[identifier]==candidate})
                        continue
                    ids[identifier]=candidate;candidates.append(candidate)
    candidates.sort(key=lambda x:(x["kickoff_candidate"],x["sport"],x["id"]))
    return {"schema_version":1,"publication":"never_without_owner_review",
            "timezone":"Europe/Athens","candidates":candidates,"warnings":warnings,
            "note":"ICS titles/venues/dates are UNVERIFIED source values; no match is public automatically."}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--handball",action="append",type=Path,default=[],metavar="CALENDAR.ICS/ZIP")
    parser.add_argument("--volleyball",action="append",type=Path,default=[],metavar="CALENDAR.ICS/ZIP")
    parser.add_argument("--out",choices=(REPORT_CHOICE,),default=REPORT_CHOICE,
                        help="Fixed checkout-relative review report; arbitrary paths are rejected")
    args=parser.parse_args()
    if not args.handball and not args.volleyball:
        parser.error("Provide at least one --handball or --volleyball calendar")
    try:
        with output_directory(("rebuild","test-artifacts")) as directory:
            validate_reports(directory,(REPORT_NAME,))
            report=import_sources({"handball":args.handball,"volleyball":args.volleyball})
            replace_report(directory,REPORT_NAME,json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    except (OSError,ValueError,BadZipFile) as error:
        parser.exit(2,"CALENDAR IMPORT failed ("+type(error).__name__+
                    "): check the calendar export and fixed review-report location.\n")
    print("CALENDAR IMPORT:",len(report["candidates"]),"events for review;",
          len(report["warnings"]),"potential problems; no matches published.")
    for warning in report["warnings"][:12]:
        print("REVIEW:",warning)

if __name__=="__main__":main()
