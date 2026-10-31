#!/usr/bin/env python3
"""Safe optional ingestion of independently verified PUBLIC sports archive facts.

Input is an editor-prepared, public-safe review package. Never reads Google Drive,
never uses API tokens, and NEVER publishes automatically.
Default mode is dry-run. Only --apply writes validated output to staged JSON.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import html
import json
import re
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA = ROOT / "data"
TYPES = ("stories", "people", "moments", "museum")
PRIVATE_FIELDS = {
    "drive_id", "file_id", "raw_document", "pdf_bytes", "scan",
    "attachment", "private_notes", "source_private_url", "token",
    "email_address", "phone_number", "private_url",
}
PRIVATE_URL = re.compile(r"https?://(?:drive|docs)\.google\.com|file://|(?:api[_-]?key|access[_-]?token)\s*[:=]", re.I)
OPS = {"append_story", "biography_note", "moment_addendum", "add_event"}
MAX_ITEMS = 50


def text(value: object, field: str, minimum: int = 2, maximum: int = 5000) -> str:
    if not isinstance(value, str) or not minimum <= len(value.strip()) <= maximum:
        raise ValueError(f"Invalid {field}: expected {minimum}-{maximum} characters")
    result = value.strip()
    if PRIVATE_URL.search(result):
        raise ValueError(f"Potential private document link in public {field}")
    return result


def reject_private(obj: object) -> None:
    if isinstance(obj, dict):
        for key, value in obj.items():
            if str(key).lower() in PRIVATE_FIELDS:
                raise ValueError(f"Private field not allowed in reviewed package: {key}")
            reject_private(value)
    elif isinstance(obj, list):
        for value in obj:
            reject_private(value)
    elif isinstance(obj, str) and PRIVATE_URL.search(obj):
        raise ValueError("Private document URL or credential-like content")


def read(data_dir: Path) -> dict:
    data = {}
    for name in TYPES:
        data[name] = json.loads((data_dir / (name + ".json")).read_text(encoding="utf-8"))
    ledger = data_dir / "import-ledger.json"
    data["ledger"] = (json.loads(ledger.read_text(encoding="utf-8"))
                      if ledger.exists() else {"hashes": []})
    additions = data_dir / "people-addenda.json"
    data["addenda"] = (json.loads(additions.read_text(encoding="utf-8"))
                       if additions.exists() else {"entries": {}})
    return data


def signature(item: dict) -> str:
    return hashlib.sha256(
        json.dumps(item, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
        .encode("utf-8")
    ).hexdigest()


def merge(package: dict, original: dict) -> tuple[dict, list[str]]:
    """Return new data only after all changes validate; no partial writes."""
    reject_private(package)
    if package.get("schema_version") != 1:
        raise ValueError("Unsupported reviewed package version")
    approval = package.get("approval") or {}
    if approval.get("status") != "approved":
        raise ValueError("An editor must approve the public-safe copy first")
    text(approval.get("reviewed_by"), "reviewed_by", 3, 120)
    entries = package.get("entries")
    if not isinstance(entries, list) or not 1 <= len(entries) <= MAX_ITEMS:
        raise ValueError("Reviewed package needs 1-50 entries")
    result = copy.deepcopy(original)
    seen = set(result["ledger"].get("hashes", []))
    messages = []
    persons = {p["id"]: p for p in result["people"]["people"]}
    moments = {m["id"]: m for m in result["moments"]["moments"]}
    for item in entries:
        if item.get("operation") not in OPS:
            raise ValueError("Unsupported sports archive operation")
        if item.get("verified") is not True or item.get("safe_for_publication") is not True:
            raise ValueError("Every entry needs documented verification and public-safe review")
        source = text(item.get("source_label"), "public bibliographic source label", 8, 240)
        digest = signature(item)
        if digest in seen:
            messages.append("ALREADY IMPORTED: " + item["operation"])
            continue
        op = item["operation"]
        if op == "append_story":
            story = item.get("story") or {}
            title = text(story.get("title"), "story title", 5, 180)
            if any(p["title"].casefold() == title.casefold() for p in result["stories"]["stories"]):
                raise ValueError("Duplicate story title: " + title)
            people_ids = story.get("relatedPeople", [])
            if not isinstance(people_ids, list) or len(people_ids) > 25:
                raise ValueError("relatedPeople must be a list of at most 25 verified IDs")
            if any(pid not in persons for pid in people_ids):
                raise ValueError("A related person is not in the canonical Hall of Fame")
            record = {
                "sport": text(story.get("sport"), "sport", 3, 120),
                "year": text(story.get("year"), "year", 4, 36),
                "title": title,
                "lead": text(story.get("lead"), "lead", 15, 500),
                "text": text(story.get("text"), "story body", 80, 10000),
                "sources": [source],
                "relatedPeople": people_ids,
                "relatedEvents": [],
                "dialogueNote": False,
            }
            result["stories"]["stories"].append(record)
            result["stories"]["count"] = len(result["stories"]["stories"])
            messages.append("NEW STORY: " + title)
        elif op == "biography_note":
            person_id = text(item.get("person_id"), "person_id", 10, 100)
            if person_id not in persons:
                raise ValueError("Unknown Hall of Fame person: " + person_id)
            paragraph_el = text(item.get("paragraph_el"), "Greek biography", 20, 3000)
            paragraph_en = text(item.get("paragraph_en"), "English biography", 20, 3000)
            person = persons[person_id]
            if paragraph_el in person["bio"] or paragraph_en in person["bio_en"]:
                raise ValueError("This biography already contains the supplied paragraph")
            person["bio"] = person["bio"].rstrip() + "\n\n" + paragraph_el
            person["bio_en"] = person["bio_en"].rstrip() + "\n\n" + paragraph_en
            result["addenda"]["entries"].setdefault(person_id, []).append({
                "el": paragraph_el,
                "en": paragraph_en,
                "source_label": source
            })
            messages.append("BIOGRAPHY UPDATE: " + person_id)
        elif op == "moment_addendum":
            moment_id = item.get("moment_id")
            if type(moment_id) is not int or moment_id not in moments:
                raise ValueError("Unknown original 70 Moments ID")
            greek = text(item.get("paragraph_el"), "moment Greek text", 20, 3000)
            english = text(item.get("paragraph_en"), "moment English text", 20, 3000)
            record = moments[moment_id]
            if greek in record["body"] or english in record["body_en"]:
                raise ValueError("Duplicate 70 Moments paragraph")
            record["body"].append(greek)
            record["body_en"].append(english)
            messages.append("MOMENT UPDATE: " + str(moment_id))
        elif op == "add_event":
            event = item.get("event") or {}
            title = text(event.get("title"), "event title", 5, 180)
            period = text(event.get("period"), "event period", 4, 60)
            body = text(event.get("body"), "event body", 30, 9000)
            if any(x["title"].casefold() == title.casefold()
                   for x in result["museum"]["articles"]):
                raise ValueError("Museum event title already exists")
            event_id = "archive-" + digest[:12]
            paragraphs = [s for s in re.split(r"\n\s*\n", body) if s.strip()]
            safe_html = "".join("<p>" + html.escape(part.strip()) + "</p>" for part in paragraphs)
            result["museum"]["articles"].append({
                "id": event_id, "title": title, "period": period,
                "html": '<article class="arch-archive-content">'
                        + safe_html + "</article>",
            })
            messages.append("MUSEUM EVENT: " + title)
        seen.add(digest)
    result["ledger"]["hashes"] = sorted(seen)
    return result, messages


def run(package_path: Path, data_dir: Path, apply: bool) -> list[str]:
    package = json.loads(package_path.read_text(encoding="utf-8"))
    original = read(data_dir)
    updated, messages = merge(package, original)
    if apply:
        # Original files are not touched until *every* proposed change passes validation.
        for key in (*TYPES, "ledger", "addenda"):
            filename = {"ledger": "import-ledger.json", "addenda": "people-addenda.json"}.get(key, key + ".json")
            destination = data_dir / filename
            with tempfile.NamedTemporaryFile(
                mode="w", encoding="utf-8", dir=data_dir, prefix=".archive-",
                suffix=".tmp", delete=False
            ) as tmp:
                json.dump(updated[key], tmp, ensure_ascii=False, indent=2)
                tmp.write("\n")
                temp_path = Path(tmp.name)
            temp_path.replace(destination)
    return messages


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--apply", action="store_true", help="Modify only staged public JSON; no deployment")
    args = parser.parse_args()
    for line in run(args.input, args.data_dir, args.apply):
        print(line)
    print("APPLIED TO STAGED DATA" if args.apply else "DRY RUN — NOTHING MODIFIED")
