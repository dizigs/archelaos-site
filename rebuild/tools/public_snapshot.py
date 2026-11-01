#!/usr/bin/env python3
"""Manifest of PUBLISHED archival data, never private Drive, intake, or credentials."""
from __future__ import annotations
from hashlib import sha256
from pathlib import Path
import argparse
import json
import os

ROOT = Path(__file__).resolve().parents[2]
PUB = ROOT / "dist" / "assets" / "site" / "data"
FILES = ("people", "moments", "stories", "museum", "interviews",
         "match-schedule", "home", "board", "retro", "on-this-day")


def manifest() -> dict:
    items = []
    for name in FILES:
        path = PUB / (name + ".json")
        payload = path.read_bytes()
        obj = json.loads(payload)
        items.append({
            "file": name + ".json",
            "sha256": sha256(payload).hexdigest(),
            "bytes": len(payload),
            "records": next((len(v) for v in obj.values() if isinstance(v, list)), None),
        })
    return {"format": 1, "source": "public dist archive (never private Google Drive)",
            "commit": os.environ.get("GITHUB_SHA", "local"),
            "files": items}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "public-archive-manifest.json")
    args = parser.parse_args()
    args.output.write_text(json.dumps(manifest(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"PUBLIC SNAPSHOT: {len(FILES)} datasets inventoried; no private sources.")
