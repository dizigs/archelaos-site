#!/usr/bin/env python3
"""Build a private, reciprocal cross-reference proposal from explicit public IDs.

Reads existing public catalogs only. Does NOT infer identities, verify source
claims, fetch Drive materials, alter website data, or publish links.
Output is restricted to gitignored rebuild/test-artifacts.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT = ROOT / "test-artifacts/archive-link-candidates.json"


def link_proposals(people, catalogs):
    ids = [person["id"] for person in people.get("people", []) if isinstance(person, dict) and person.get("id")]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate canonical Hall of Fame person IDs")
    canonical = set(ids)
    by_person = {}
    by_record = {}
    unresolved = []
    counts = {}

    for kind, field in (("news", "items"), ("interview", "items"),
                        ("story", "stories"), ("moment", "moments"),
                        ("museum", "articles")):
        entries = catalogs.get(kind, {}).get(field, [])
        if not isinstance(entries, list):
            raise ValueError("Invalid catalog: " + kind)
        for index, item in enumerate(entries):
            if not isinstance(item, dict):
                continue
            if kind == "interview" and item.get("needsReview") is True:
                # Interview text or identity remains under editorial review.
                continue
            title = str(item.get("title") or item.get("name") or "")
            record_id = item.get("id")
            provisional = record_id is None
            if provisional:
                # Stories have no canonical IDs yet: no generated public URL.
                record_id = "story-title-" + hashlib.sha256(
                    title.encode("utf-8")).hexdigest()[:12]
            if not title:
                continue
            reference = kind + ":" + str(record_id)
            if reference in by_record:
                raise ValueError("Duplicate archive record ID: " + reference)
            linked_ids = set()
            for field_name in ("personIds", "relatedPeople"):
                refs = item.get(field_name, [])
                if not isinstance(refs, list):
                    continue
                for value in refs:
                    pid = value.get("id") if isinstance(value, dict) else value
                    if not isinstance(pid, str) or not pid:
                        continue
                    if pid not in canonical:
                        unresolved.append({"record": reference, "unknown_person_id": pid})
                        continue
                    linked_ids.add(pid)
            if not linked_ids:
                continue
            by_record[reference] = {
                "kind": kind, "id": record_id, "title": title,
                "person_ids": sorted(linked_ids),
                "provisional_record_id": provisional,
                "review_required": True,
                "publishable": False,
            }
            counts[kind] = counts.get(kind, 0) + 1
            for pid in sorted(linked_ids):
                by_person.setdefault(pid, []).append(reference)

    return {
        "schema_version": 1,
        "privacy": "internal_only",
        "publication_scope": "none",
        "note": "Existing explicit IDs only; reciprocal suggestions require review before any UI links.",
        "records_by_person": {pid: sorted(links) for pid, links in sorted(by_person.items())},
        "people_by_record": {ref: by_record[ref] for ref in sorted(by_record)},
        "missing_canonical_ids": sorted(unresolved, key=lambda x: (x["record"], x["unknown_person_id"])),
        "record_counts": dict(sorted(counts.items())),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", type=Path, default=DEFAULT)
    args = parser.parse_args()
    output = args.json.resolve()
    if not output.is_relative_to((ROOT / "test-artifacts").resolve()) or output.suffix != ".json":
        raise SystemExit("Export restricted to gitignored rebuild/test-artifacts/*.json")
    def load(path):
        return json.loads(path.read_text(encoding="utf-8"))
    catalogs = {
        "news": load(ROOT.parent / "news.json"),
        "interview": load(ROOT / "data/interviews.json"),
        "story": load(ROOT / "data/stories.json"),
        "moment": load(ROOT / "data/moments.json"),
        "museum": load(ROOT / "data/museum.json"),
    }
    result = link_proposals(load(ROOT.parent / "hall-of-fame-people.json"), catalogs)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("ARCHIVE LINK CANDIDATES:", len(result["people_by_record"]), "records,",
          len(result["records_by_person"]), "people,",
          len(result["missing_canonical_ids"]), "unresolved IDs; NO PUBLICATION")


if __name__ == "__main__":
    main()
