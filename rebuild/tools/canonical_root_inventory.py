#!/usr/bin/env python3
"""Read-only, deterministic recovery inventory of the THREE canonical public root JSONs.

Distinct from the existing weekly dist/assets/site/data snapshot. Never backs up
private Drive, tokens, attachments or site configuration. No network or writes.
"""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
REGISTRIES = (
    ("news.json", "items"),
    ("hall-of-fame-people.json", "people"),
    ("archelaos-history-events.json", "events"),
)
MAX_FILE_BYTES = 25 * 1024 * 1024

class InventoryError(ValueError):
    pass

def build_manifest(root: Path = ROOT) -> dict:
    """Return reproducible checksums, counts and ID-set hashes, without writing files."""
    entries = []
    for filename, list_key in REGISTRIES:
        path = root / filename
        if path.is_symlink() or not path.is_file():
            raise InventoryError(f"{filename}: missing or symbolic link")
        if path.stat().st_size > MAX_FILE_BYTES:
            raise InventoryError(f"{filename}: exceeds 25 MiB")
        data = path.read_bytes()
        if not data:
            raise InventoryError(f"{filename}: empty")
        try:
            obj = json.loads(data)
        except (ValueError, UnicodeError) as exc:
            raise InventoryError(f"{filename}: invalid JSON") from exc
        if not isinstance(obj, dict) or not isinstance(obj.get(list_key), list):
            raise InventoryError(f"{filename}: missing {list_key} list")
        records = obj[list_key]
        ids = [r.get("id") if isinstance(r, dict) else None for r in records]
        if any(not isinstance(v, str) or not v.strip() or len(v) > 180 for v in ids):
            raise InventoryError(f"{filename}: missing or invalid canonical ID")
        if len(set(ids)) != len(ids):
            raise InventoryError(f"{filename}: duplicate canonical ID")
        if filename == "hall-of-fame-people.json" and obj.get("count") != len(ids):
            raise InventoryError(f"{filename}: declared count differs from actual people")
        digest = sha256("\n".join(sorted(ids)).encode("utf-8")).hexdigest()
        entries.append({
            "file": filename, "key": list_key, "records": len(ids), "bytes": len(data),
            "sha256": sha256(data).hexdigest(), "sortedIdSetSha256": digest
        })
    return {"schemaVersion": 1, "scope": "public canonical root registries only",
            "entries": entries, "productionRestorePerformed": False,
            "externalWritesPerformed": False}

def compare(manifest: dict, baseline: dict) -> dict:
    """Fail closed when a baseline is malformed; compare only matching public files."""
    if not isinstance(baseline, dict) or baseline.get("schemaVersion") != 1:
        raise InventoryError("invalid baseline schema version")
    old = baseline.get("entries")
    if not isinstance(old, list) or len(old) != len(REGISTRIES):
        raise InventoryError("invalid baseline entry count")
    oldmap = {}
    for row in old:
        if not isinstance(row, dict) or row.get("file") in oldmap:
            raise InventoryError("invalid or duplicate baseline entry")
        if row.get("file") not in {name for name, _ in REGISTRIES}:
            raise InventoryError("unrecognized baseline file")
        if not isinstance(row.get("records"), int) or row["records"] < 0:
            raise InventoryError("invalid baseline record count")
        for name in ("sha256", "sortedIdSetSha256"):
            value = row.get(name)
            if not isinstance(value, str) or len(value) != 64 or any(c not in "0123456789abcdef" for c in value):
                raise InventoryError("invalid baseline checksum")
        oldmap[row["file"]] = row
    if set(oldmap) != {name for name, _ in REGISTRIES}:
        raise InventoryError("baseline missing canonical registry")
    return {
        "same": all(item["sha256"] == oldmap[item["file"]]["sha256"] for item in manifest["entries"]),
        "differences": [{
            "file": item["file"], "byteChanged": item["sha256"] != oldmap[item["file"]]["sha256"],
            "idSetChanged": item["sortedIdSetSha256"] != oldmap[item["file"]]["sortedIdSetSha256"],
            "recordCountDelta": item["records"] - oldmap[item["file"]]["records"]
        } for item in manifest["entries"]]
    }

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, help="optional previously captured PUBLIC inventory JSON, read-only")
    args = parser.parse_args()
    try:
        result = build_manifest()
        if args.baseline:
            base_data = json.loads(args.baseline.read_text(encoding="utf-8"))
            result["comparison"] = compare(result, base_data)
    except (OSError, ValueError, InventoryError) as exc:
        print("PUBLIC CANONICAL RECOVERY INVENTORY FAILED: " + str(exc)[:160], file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if result.get("comparison", {}).get("same") is False else 0

if __name__ == "__main__":
    raise SystemExit(main())
