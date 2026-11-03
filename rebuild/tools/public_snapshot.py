#!/usr/bin/env python3
"""Manifest of PUBLISHED archival data, never private Drive, intake, or credentials."""
from __future__ import annotations
from hashlib import sha256
from pathlib import Path
from contextlib import contextmanager
import argparse
import json
import os
import secrets
import stat

ROOT = Path(__file__).resolve().parents[2]
PUB = ROOT / "dist" / "assets" / "site" / "data"
FILES = ("people", "moments", "stories", "museum", "interviews",
         "match-schedule", "home", "board", "retro", "on-this-day")
OUTPUT_NAME = "public-archive-manifest.json"
# Values, never user paths, determine the directory opened beneath this checkout.
OUTPUTS = {OUTPUT_NAME: (), "rebuild/test-artifacts/" + OUTPUT_NAME: ("rebuild", "test-artifacts")}
APPROVED_REPORT_NAMES = (OUTPUT_NAME, "public-mentions.json", "public-mentions-report.json",
                         "event-review-queue.json", "event-review-queue.md")


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


@contextmanager
def output_directory(parts):
    """Hold directory descriptors so a parent symlink cannot redirect a write."""
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    directory = os.open(ROOT, flags)
    try:
        for part in parts:
            try:
                os.mkdir(part, mode=0o700, dir_fd=directory)
            except FileExistsError:
                pass
            child = os.open(part, flags, dir_fd=directory)
            os.close(directory)
            directory = child
        yield directory
    finally:
        os.close(directory)


def validate_reports(directory, names):
    """Validate static public report slots before any report in a group is written."""
    for name in names:
        if name not in APPROVED_REPORT_NAMES:
            raise ValueError("Public report filename is not allowlisted")
        try:
            existing = os.stat(name, dir_fd=directory, follow_symlinks=False)
        except FileNotFoundError:
            continue
        if not stat.S_ISREG(existing.st_mode) or existing.st_nlink != 1:
            raise ValueError("Public reports must be ordinary, non-linked files")


def replace_report(directory, name, payload):
    """Atomically replace one approved filename through its already anchored parent."""
    validate_reports(directory, (name,))
    temporary = ".public-report-" + secrets.token_hex(12) + ".tmp"
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                         0o600, dir_fd=directory)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        # Replace the directory entry itself, never follow a swapped link.
        os.replace(temporary, name, src_dir_fd=directory, dst_dir_fd=directory)
        os.fsync(directory)
    finally:
        try:
            os.unlink(temporary, dir_fd=directory)
        except FileNotFoundError:
            pass


def write_snapshot(output=OUTPUT_NAME):
    if output not in OUTPUTS:
        raise ValueError("Snapshot destination is not allowlisted")
    with output_directory(OUTPUTS[output]) as directory:
        validate_reports(directory, (OUTPUT_NAME,))
        payload = json.dumps(manifest(), ensure_ascii=False, indent=2) + "\n"
        replace_report(directory, OUTPUT_NAME, payload)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", choices=tuple(OUTPUTS), default=OUTPUT_NAME,
                        help="Fixed public manifest location relative to the checkout; arbitrary paths are rejected")
    args = parser.parse_args()
    try:
        write_snapshot(args.output)
    except (OSError, ValueError) as error:
        parser.exit(2, "PUBLIC SNAPSHOT failed (" + type(error).__name__ +
                    "): check the public build and the allowlisted output location.\n")
    print(f"PUBLIC SNAPSHOT: {len(FILES)} datasets inventoried; no private sources.")


if __name__ == "__main__":
    main()
