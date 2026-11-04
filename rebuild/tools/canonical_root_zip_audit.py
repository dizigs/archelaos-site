#!/usr/bin/env python3
"""Strict, extraction-free validation of GitHub canonical-root-public-snapshot ZIP.

The ZIP is untrusted, even if it came from a workflow. This checks the archive
allowlist, manifest/source SHA, exact public JSON counts, IDs and hashes. It
does not contact GitHub or restore a website.
"""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path, PurePosixPath
import re
import stat
import sys
from zipfile import ZipFile, BadZipFile

from canonical_root_inventory import REGISTRIES, MAX_FILE_BYTES
from canonical_root_snapshot import MANIFEST_NAME, SOURCE_LABEL, REQUIRED_NAMES, SnapshotError

MAX_TOTAL_BYTES = 80 * 1024 * 1024
MAX_RATIO = 180

def _json_no_duplicate_keys(payload: bytes):
    def check_pairs(pairs):
        d = {}
        for key, value in pairs:
            if key in d:
                raise SnapshotError("duplicate JSON object key")
            d[key] = value
        return d
    try:
        return json.loads(payload, object_pairs_hook=check_pairs)
    except (ValueError, UnicodeError) as exc:
        raise SnapshotError("invalid UTF-8 JSON entry") from exc

def verify_zip(archive: ZipFile, expected_commit: str | None = None) -> dict:
    info_by_name = {}
    total = 0
    for info in archive.infolist():
        name = info.filename
        normalized = PurePosixPath(name)
        if (not name or name.startswith("/") or "\\" in name or ".." in normalized.parts or
                normalized.as_posix() != name):
            raise SnapshotError("unsafe ZIP path")
        if info.is_dir() or stat.S_IFMT(info.external_attr >> 16) == stat.S_IFLNK:
            raise SnapshotError("unsafe ZIP entry type")
        if name in info_by_name:
            raise SnapshotError("duplicate ZIP entry name")
        if name not in REQUIRED_NAMES:
            raise SnapshotError("unexpected ZIP entry")
        if info.file_size <= 0 or info.file_size > MAX_FILE_BYTES:
            raise SnapshotError("unexpected ZIP entry size")
        if info.compress_size <= 0 or info.file_size > MAX_RATIO * info.compress_size:
            raise SnapshotError("suspicious ZIP compression ratio")
        total += info.file_size
        if total > MAX_TOTAL_BYTES:
            raise SnapshotError("ZIP total uncompressed size exceeded")
        info_by_name[name] = info
    if set(info_by_name) != REQUIRED_NAMES:
        raise SnapshotError("ZIP missing canonical registry or manifest")

    def read(name):
        data = archive.read(info_by_name[name])
        if len(data) != info_by_name[name].file_size:
            raise SnapshotError("truncated ZIP entry")
        return data

    raw_manifest = read(MANIFEST_NAME)
    if len(raw_manifest) > 65536:
        raise SnapshotError("oversized ZIP manifest")
    m = _json_no_duplicate_keys(raw_manifest)
    if not isinstance(m, dict) or set(m) != {"format", "source", "commit", "entries"}:
        raise SnapshotError("unexpected ZIP manifest schema")
    if m["format"] != 1 or m["source"] != SOURCE_LABEL or not isinstance(m["commit"], str):
        raise SnapshotError("invalid ZIP manifest identity")
    if not re.fullmatch(r"[0-9a-f]{40}", m["commit"]):
        raise SnapshotError("invalid ZIP source commit")
    if expected_commit is not None and (not re.fullmatch(r"[0-9a-f]{40}", expected_commit) or
                                       m["commit"] != expected_commit):
        raise SnapshotError("ZIP source SHA differs from expected GitHub workflow run")
    entries = m["entries"]
    if not isinstance(entries, list) or len(entries) != len(REGISTRIES):
        raise SnapshotError("unexpected ZIP manifest entries")

    rows = {}
    for row in entries:
        if not isinstance(row, dict) or set(row) != {
                "file", "key", "records", "bytes", "sha256", "sortedIdSetSha256"}:
            raise SnapshotError("invalid ZIP manifest row schema")
        if row["file"] in rows or row["file"] not in {x[0] for x in REGISTRIES}:
            raise SnapshotError("duplicate/unknown ZIP manifest filename")
        rows[row["file"]] = row

    counts = {}
    for name, key in REGISTRIES:
        row = rows.get(name)
        if row is None or row["key"] != key:
            raise SnapshotError("missing ZIP canonical registry")
        data = read(name)
        obj = _json_no_duplicate_keys(data)
        if not isinstance(obj, dict) or not isinstance(obj.get(key), list):
            raise SnapshotError("invalid ZIP public registry shape")
        records = obj[key]
        ids = [item.get("id") if isinstance(item, dict) else None for item in records]
        if any(not isinstance(v, str) or not v.strip() or len(v) > 180 for v in ids):
            raise SnapshotError("invalid ZIP canonical ID")
        if len(set(ids)) != len(ids):
            raise SnapshotError("duplicate ZIP canonical ID")
        if name == "hall-of-fame-people.json" and obj.get("count") != len(ids):
            raise SnapshotError("invalid ZIP declared Hall count")
        identity_hash = sha256("\n".join(sorted(ids)).encode("utf-8")).hexdigest()
        if (row["bytes"] != len(data) or row["sha256"] != sha256(data).hexdigest() or
                row["records"] != len(ids) or row["sortedIdSetSha256"] != identity_hash):
            raise SnapshotError("ZIP archive checksum/count/ID-set mismatch")
        counts[name] = len(ids)

    return {"status": "PASS", "scope": "archive bytes verified only; no production restore",
            "sourceCommit": m["commit"], "fileCount": len(REGISTRIES), "recordCounts": counts,
            "remoteProviderVerified": False, "productionRestorePerformed": False}

def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("archive", type=Path)
    p.add_argument("--source-commit", help="trusted SHA from originating successful GitHub run")
    args = p.parse_args()
    try:
        if args.archive.stat().st_size > MAX_TOTAL_BYTES:
            raise SnapshotError("ZIP download exceeds maximum file size")
        with ZipFile(args.archive) as archive:
            result = verify_zip(archive, args.source_commit)
    except (SnapshotError, OSError, BadZipFile) as exc:
        print("CANONICAL ZIP AUDIT FAIL: " + str(exc)[:160], file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=2))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
