#!/usr/bin/env python3
"""Read-only, ID-based reconciliation of the public Hall and historical snapshot."""
from __future__ import annotations

import argparse
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path

from hof_biography import normalized

ROOT = Path(__file__).resolve().parents[2]
FIELDS = ("name", "bio", "bio_en")
REVIEW_CLASSIFICATIONS = frozenset({
    "LEGACY_TEXT_RETAINED",
    "SEMANTICALLY_RETAINED",
    "QUALIFIED_CONFLICT",
    "QUALIFIED_ARCHIVE",
    "SPELLING_CORRECTION",
    "BLOCKED_SOURCE",
})
DECISIONS = ROOT / "docs/research/hof-reconciliation-decisions.json"
REPORT = ROOT / "docs/research/hof-canonical-reconciliation-20261103.json"


def digest(text: str) -> str:
    return sha256(text.encode("utf-8")).hexdigest()


def indexed(document: dict) -> dict:
    rows = document["people"]
    result = {row["id"]: row for row in rows}
    if len(result) != len(rows) or document.get("count") != len(rows):
        raise ValueError("Duplicate IDs or inconsistent count metadata")
    return result


def reconcile(canonical: dict, legacy: dict, decisions: dict) -> dict:
    master, archive = indexed(canonical), indexed(legacy)
    records = []
    counts = Counter()
    for pid in sorted(master.keys() & archive.keys()):
        fields = []
        for field in FIELDS:
            before, after = archive[pid].get(field, ""), master[pid].get(field, "")
            # Preserve spelling differences in the audit even though projection
            # uses the approved orthographic normalization.
            if before == after:
                continue
            counts[field] += 1
            review = decisions.get(pid, {}).get(field)
            if review and (review["legacy_sha256"] != digest(before)
                           or review["canonical_sha256"] != digest(after)):
                raise ValueError("Stale manual review: " + pid + "/" + field)
            classification = "LEGACY_TEXT_RETAINED" if normalized(before) in normalized(after) else "UNREVIEWED"
            if review:
                classification = review.get("classification")
                if not isinstance(classification, str) or classification not in REVIEW_CLASSIFICATIONS:
                    raise ValueError("Unknown manual classification: " + pid + "/" + field)
            fields.append({"field": field, "classification": classification,
                           "legacy_sha256": digest(before), "canonical_sha256": digest(after),
                           **({"evidence": review["evidence"]} if review else {})})
        if fields:
            records.append({"id": pid, "name": master[pid]["name"], "fields": fields})
    classifications = Counter(f["classification"] for r in records for f in r["fields"])
    return {
        "schema_version": 1,
        "canonical_source": "hall-of-fame-people.json",
        "historical_source": "rebuild/data/people.json",
        "counts": {"canonical": len(master), "historical": len(archive),
                   "shared": len(master.keys() & archive.keys()),
                   "divergent_people": len(records), "divergent_fields": sum(counts.values()),
                   "fields": dict(sorted(counts.items())),
                   "classifications": dict(sorted(classifications.items()))},
        "canonical_only_ids": sorted(master.keys() - archive.keys()),
        "historical_only_ids": sorted(archive.keys() - master.keys()),
        "records": records,
        "note": "Intentional differences are not data loss. BLOCKED_SOURCE remains unresolved; original historical records are preserved. Counts are computed, never capped at a snapshot size.",
    }


def current_report() -> dict:
    return reconcile(json.loads((ROOT / "hall-of-fame-people.json").read_text()),
                     json.loads((ROOT / "rebuild/data/people.json").read_text()),
                     json.loads(DECISIONS.read_text())["decisions"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check the committed audit without writing")
    args = parser.parse_args()
    report = current_report()
    if report["historical_only_ids"] or report["counts"]["classifications"].get("UNREVIEWED"):
        raise SystemExit("Unreconciled identities or unreviewed fields")
    if args.check:
        if json.loads(REPORT.read_text()) != report:
            raise SystemExit("Reconciliation report is stale; rerun hof_reconcile.py and review it")
    else:
        REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report["counts"], ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
