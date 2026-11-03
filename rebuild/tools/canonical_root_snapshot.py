#!/usr/bin/env python3
"""Stage and verify an isolated GitHub Actions artifact of THREE public root registries.

No network, external storage, production restore or access to private Drive.
The CLI can only create/read one fixed directory below RUNNER_TEMP. It never
modifies the checked-out canonical source files.
"""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import stat
import sys

from canonical_root_inventory import ROOT, REGISTRIES, build_manifest, InventoryError

STAGING_NAME = "archelaos-public-canonical"
MANIFEST_NAME = "canonical-root-snapshot-manifest.json"
SOURCE_LABEL = "public canonical source registries (never private Drive)"
REQUIRED_NAMES = frozenset({MANIFEST_NAME, *(name for name, _ in REGISTRIES)})

class SnapshotError(ValueError):
    pass

def valid_sha(commit: str) -> bool:
    return isinstance(commit, str) and re.fullmatch(r"[0-9a-f]{40}", commit) is not None

def stage(root: Path, dest: Path, commit: str) -> dict:
    """Stage only three audited source files; fail rather than overwrite any destination."""
    if not valid_sha(commit):
        raise SnapshotError("invalid source commit SHA")
    if dest.exists() or dest.is_symlink():
        raise SnapshotError("staging directory already exists")
    metadata = build_manifest(root)  # fail closed on malformed/duplicate canonical IDs
    dest.mkdir(mode=0o700)
    try:
        for entry in metadata["entries"]:
            path = root / entry["file"]
            if path.is_symlink() or not path.is_file():
                raise SnapshotError("source file changed during staging")
            payload = path.read_bytes()
            if len(payload) != entry["bytes"] or sha256(payload).hexdigest() != entry["sha256"]:
                raise SnapshotError("source file changed during staging")
            dest.joinpath(entry["file"]).write_bytes(payload)
        manifest = {
            "format": 1, "source": SOURCE_LABEL, "commit": commit,
            "entries": metadata["entries"]
        }
        dest.joinpath(MANIFEST_NAME).write_text(
            json.dumps(manifest, sort_keys=True, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8"
        )
        verify(dest, expected_commit=commit)
        return manifest
    except Exception:
        # Never return a partially staged directory for upload. No symlinks are
        # created here; only remove the fixed allowlist of our newly-created files.
        for name in REQUIRED_NAMES:
            (dest / name).unlink(missing_ok=True)
        dest.rmdir()
        raise

def verify(dest: Path, expected_commit: str | None = None) -> dict:
    """Verify precise allowlist, source SHA, byte hashes and canonical IDs."""
    if not dest.is_dir() or dest.is_symlink():
        raise SnapshotError("missing or symbolic link snapshot directory")
    names = set()
    for child in dest.iterdir():
        if child.is_symlink() or not child.is_file() or not stat.S_ISREG(child.stat().st_mode):
            raise SnapshotError("unexpected file type in snapshot")
        names.add(child.name)
    if names != REQUIRED_NAMES:
        raise SnapshotError("snapshot missing or contains unexpected files")
    manifest_path = dest / MANIFEST_NAME
    if manifest_path.stat().st_size > 65536:
        raise SnapshotError("snapshot manifest oversized")
    try:
        obj = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (ValueError, UnicodeError) as exc:
        raise SnapshotError("snapshot manifest invalid JSON") from exc
    if not isinstance(obj, dict) or set(obj) != {"format", "source", "commit", "entries"}:
        raise SnapshotError("unexpected manifest schema")
    if obj["format"] != 1 or obj["source"] != SOURCE_LABEL or not valid_sha(obj["commit"]):
        raise SnapshotError("invalid snapshot source identity")
    if expected_commit is not None and obj["commit"] != expected_commit:
        raise SnapshotError("snapshot commit does not match originating workflow")
    recomputed = build_manifest(dest)
    if obj["entries"] != recomputed["entries"]:
        raise SnapshotError("snapshot checksum/count/ID-set mismatch")
    return {
        "status": "PASS", "commit": obj["commit"], "files": len(REGISTRIES),
        "records": {row["file"]: row["records"] for row in recomputed["entries"]},
        "productionRestorePerformed": False,
        "remoteArtifactRetrievalVerified": False,
    }

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    g = parser.add_mutually_exclusive_group(required=True)
    g.add_argument("--stage", action="store_true")
    g.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    runtime_temp = os.environ.get("RUNNER_TEMP")
    if not runtime_temp:
        parser.error("RUNNER_TEMP is required; no arbitrary output path allowed")
    base = Path(runtime_temp)
    if not base.is_dir() or base.is_symlink():
        parser.error("RUNNER_TEMP must be a real directory")
    target = base / STAGING_NAME
    try:
        if args.stage:
            result = stage(ROOT, target, os.environ.get("GITHUB_SHA", ""))
            print("STAGED canonical root public JSONs for GitHub upload; not a production restore.")
        else:
            result = verify(target, expected_commit=os.environ.get("GITHUB_SHA"))
            print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    except (OSError, InventoryError, SnapshotError, ValueError) as exc:
        print("CANONICAL PUBLIC SNAPSHOT FAILED: " + str(exc)[:160], file=sys.stderr)
        return 1
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
