#!/usr/bin/env python3
"""Build/readback the public content-ID snapshot without inventing photo identities.

Canonical content IDs stay in their original JSON datasets. This is a derived
crosswalk, NOT a replacement registry and NOT a photo-rights clearance.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "docs" / "research" / "content-id-registry.json"
SCHEMA_VERSION = 1


def load(path: str):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def unique_ids(records, kind):
    ids = [record["id"] for record in records]
    if any(not isinstance(i, str) or not i for i in ids):
        raise ValueError(f"{kind}: non-string or empty ID")
    if len(ids) != len(set(ids)):
        raise ValueError(f"{kind}: duplicate canonical ID")
    return sorted(ids)


def build():
    people = load("hall-of-fame-people.json")
    index = load("archelaos-person-index.json")
    news = load("news.json")
    events = load("archelaos-history-events.json")
    person_ids = unique_ids(people["people"], "person")
    index_ids = unique_ids(index, "person-index")
    if person_ids != index_ids or people["count"] != len(person_ids):
        raise ValueError("Person canonical/index/count mismatch")
    news_ids = unique_ids(news["items"], "news")
    event_ids = unique_ids(events["events"], "history")
    valid = set(person_ids)
    assets = {}
    for article in news["items"]:
        unknown = set(article.get("personIds", [])) - valid
        if unknown:
            raise ValueError(f"Unknown person IDs in news {article['id']}: {sorted(unknown)}")
        for field in ("image", "imageSourceUrl", "imageCandidateUrl", "photoSourceUrl"):
            value = article.get(field)
            if not isinstance(value, str) or not value.strip():
                continue
            ref_id = "media-ref-" + hashlib.sha256(value.encode("utf-8")).hexdigest()[:20]
            entry = assets.setdefault(ref_id, {
                "mediaRefId": ref_id,
                "reference": value,
                "newsIds": [],
                "referenceFields": [],
                "archivePhotoId": None,
                "photoSha256": None,
                "rightsVerified": False,
            })
            if entry["reference"] != value:
                raise ValueError("Media reference ID collision")
            if article["id"] not in entry["newsIds"]:
                entry["newsIds"].append(article["id"])
            locator = f"{article['id']}:{field}"
            if locator not in entry["referenceFields"]:
                entry["referenceFields"].append(locator)
    for entry in assets.values():
        entry["newsIds"].sort()
        entry["referenceFields"].sort()
    return {
        "schemaVersion": SCHEMA_VERSION,
        "snapshotDate": "2026-11-07",
        "authority": {
            "personIds": "hall-of-fame-people.json",
            "personAliases": "archelaos-person-index.json",
            "newsIds": "news.json",
            "historicalEventIds": "archelaos-history-events.json",
            "futurePhotoArchive": "PR #240 / private D1-R2; not activated here",
        },
        "identityNotes": (
            "mediaRefId is SHA-256 of the exact URL/path reference (first 20 hex), "
            "NOT a SHA-256 hash of image bytes and NOT an assigned archive photo ID. "
            "No rights inference from public availability."
        ),
        "personIds": person_ids,
        "newsIds": news_ids,
        "historicalEventIds": event_ids,
        "mediaReferences": sorted(assets.values(), key=lambda x: x["mediaRefId"]),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    opts = parser.parse_args()
    out = json.dumps(build(), ensure_ascii=False, indent=2) + "\n"
    if opts.check:
        if not DEST.exists() or DEST.read_text(encoding="utf-8") != out:
            raise SystemExit("STALE_CONTENT_ID_REGISTRY: regenerate with python tools/build_content_id_registry.py")
        print("PASS: content ID snapshot matches all canonical sources")
    else:
        DEST.parent.mkdir(parents=True, exist_ok=True)
        DEST.write_text(out, encoding="utf-8")
        print(f"Wrote {DEST.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
