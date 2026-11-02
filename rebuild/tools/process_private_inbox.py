#!/usr/bin/env python3
"""Privately reconcile extracted contribution leads against existing archives.

Does not access the network, rewrite public JSON, or publish anything.
Run after private intake on a trusted machine with persistent .archive-intake/.
A failed receipt is counted and skipped; other receipts continue processing.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from intake_contributions import PRIVATE_DIR, ROOT, _atomic_private_write, intake_lock, read_json
from match_contribution_records import reconcile

PUBLIC_CATALOG_PATHS = {
    "news": "news.json",
    "events": "rebuild/research/historical-events.json",
    "people": "hall-of-fame-people.json",
    "interview": "rebuild/data/interviews.json",
    "story": "rebuild/data/stories.json",
    "moment": "rebuild/data/moments.json",
    "museum": "rebuild/data/museum.json",
}


def load_catalogs(base: Path = ROOT):
    return {key: read_json(base / relative) for key, relative in PUBLIC_CATALOG_PATHS.items()}


def canonical_digest(catalogs: dict) -> str:
    return hashlib.sha256(json.dumps(
        catalogs, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")).hexdigest()


def run_queue(workspace: Path, catalogs: dict):
    """Match already-private extracted leads. Idempotent per catalog version."""
    workspace = workspace.resolve()
    stamp = canonical_digest(catalogs)
    counts = {"processed": 0, "unchanged": 0, "skipped": 0, "failed": 0}
    with intake_lock(workspace):
        for file in sorted((workspace / "receipts").glob("*.json")):
            try:
                receipt = read_json(file)
                receipt_id = receipt["receipt_id"]
                if (receipt.get("privacy") != "internal_only"
                        or receipt.get("publishable") is not False
                        or receipt.get("ingestion_status") != "queued"
                        or receipt.get("extraction_status") != "extracted"
                        or file.stem != receipt_id
                        or not isinstance(receipt_id, str)
                        or len(receipt_id) != 64
                        or not all(c in "0123456789abcdef" for c in receipt_id)):
                    counts["skipped"] += 1
                    continue
                source = workspace / "research" / (receipt_id + ".json")
                lead_data = read_json(source)
                if lead_data.get("privacy") != "internal_only":
                    raise ValueError("Not a private lead document")
                # Reconcile again if either contribution leads OR public archives change.
                lead_sha = hashlib.sha256(source.read_bytes()).hexdigest()
                target = workspace / "matches" / (receipt_id + ".json")
                if target.exists():
                    previous = read_json(target)
                    if (previous.get("catalog_sha256") == stamp
                            and previous.get("leads_sha256") == lead_sha
                            and previous.get("privacy") == "internal_only"
                            and previous.get("publishable") is False):
                        counts["unchanged"] += 1
                        continue
                proposed = reconcile(
                    lead_data, catalogs["news"], catalogs["events"], catalogs["people"],
                    {kind: catalogs[kind] for kind in ("interview", "story", "moment", "museum")}
                )
                if proposed.get("privacy") != "internal_only":
                    raise ValueError("Unexpected matcher output")
                private_result = {
                    "schema_version": 1,
                    "receipt_id": receipt_id,
                    "catalog_sha256": stamp,
                    "leads_sha256": lead_sha,
                    "privacy": "internal_only",
                    "publishable": False,
                    "verification_status": "pending",
                    "matches": proposed.get("matches", []),
                }
                _atomic_private_write(target, (
                    json.dumps(private_result, ensure_ascii=False, indent=2) + "\n"
                ).encode("utf-8"))
                counts["processed"] += 1
            except (OSError, KeyError, ValueError, TypeError, json.JSONDecodeError):
                # No excerpts, identifiers, filenames or personal data in CLI output.
                counts["failed"] += 1
                continue
    return {"privacy": "internal_only", "publication": "none", **counts}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    args = parser.parse_args()
    result = run_queue(PRIVATE_DIR, load_catalogs())
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
