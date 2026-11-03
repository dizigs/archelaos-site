#!/usr/bin/env python3
"""Offline verification of a downloaded GitHub public-archive-snapshot artifact.

No network, extraction, filesystem writes or private data reads. Exit code 0
means only that the supplied artifact's public JSON matches its own manifest;
it does NOT prove independent storage durability or full website recoverability.
"""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path, PurePosixPath
import stat
import zipfile

EXPECTED = frozenset({
    "people.json", "moments.json", "stories.json", "museum.json",
    "interviews.json", "match-schedule.json", "home.json", "board.json",
    "retro.json", "on-this-day.json"
})
ROOT = "dist/assets/site/data/"
MAX_ENTRY_BYTES = 12 * 1024 * 1024
MAX_ARCHIVE_BYTES = 60 * 1024 * 1024
MAX_COMPRESSION_RATIO = 150

class VerificationError(ValueError):
    pass

def _read_entry(archive, name):
    entry=archive.getinfo(name)
    if entry.is_dir() or entry.file_size > MAX_ENTRY_BYTES:
        raise VerificationError("invalid entry size/type: " + name)
    if entry.compress_size == 0 or entry.file_size > MAX_COMPRESSION_RATIO * entry.compress_size:
        raise VerificationError("suspicious compression ratio: " + name)
    payload=archive.read(entry)
    if len(payload)!=entry.file_size:
        raise VerificationError("truncated artifact entry: " + name)
    return payload

def verify_zip(archive):
    files={}
    total=0
    for info in archive.infolist():
        if info.is_dir():
            continue
        name=info.filename
        pos=PurePosixPath(name)
        if name.startswith("/") or "\\" in name or ".." in pos.parts or name != pos.as_posix():
            raise VerificationError("unsafe ZIP entry path")
        if stat.S_IFMT(info.external_attr >> 16) == stat.S_IFLNK:
            raise VerificationError("symlink ZIP entry")
        if name in files:
            raise VerificationError("duplicate ZIP entry")
        if name not in {"public-archive-manifest.json"} | {ROOT + k for k in EXPECTED}:
            raise VerificationError("unexpected file in public snapshot: " + name)
        total+=info.file_size
        if total > MAX_ARCHIVE_BYTES:
            raise VerificationError("artifact exceeds size limit")
        files[name]=info
    expected={"public-archive-manifest.json"} | {ROOT + k for k in EXPECTED}
    if set(files)!=expected:
        raise VerificationError("artifact missing or contains unexpected files")
    manifest_bytes=_read_entry(archive,"public-archive-manifest.json")
    try:
        manifest=json.loads(manifest_bytes)
    except (ValueError,UnicodeDecodeError) as exc:
        raise VerificationError("invalid manifest JSON") from exc
    if manifest.get("format")!=1 or manifest.get("source")!="public dist archive (never private Google Drive)":
        raise VerificationError("unexpected manifest format/source")
    rows=manifest.get("files")
    if not isinstance(rows,list) or len(rows)!=len(EXPECTED):
        raise VerificationError("expected exactly ten manifest rows")
    seen=set()
    result=[]
    for row in rows:
        if not isinstance(row,dict):
            raise VerificationError("invalid manifest row")
        name=row.get("file")
        if name not in EXPECTED or name in seen:
            raise VerificationError("invalid or duplicated manifest filename")
        seen.add(name)
        data=_read_entry(archive,ROOT+name)
        if row.get("bytes") != len(data) or row.get("sha256") != sha256(data).hexdigest():
            raise VerificationError("public JSON hash/size mismatch: " + name)
        try:
            obj=json.loads(data)
        except (ValueError,UnicodeDecodeError) as exc:
            raise VerificationError("invalid public JSON: " + name) from exc
        if not isinstance(obj,dict):
            raise VerificationError("unexpected public JSON object: " + name)
        lengths=[len(v) for v in obj.values() if isinstance(v,list)]
        record_count=lengths[0] if lengths else None
        if row.get("records")!=record_count:
            raise VerificationError("public JSON record count mismatch: " + name)
        result.append({"name":name,"records":record_count,"bytes":len(data),"sha256":row["sha256"]})
    return {
        "status":"PASS",
        "scope":"offline artifact-internal restore verification only",
        "commit":manifest.get("commit"),
        "datasets":result,
        "dataFilesVerified":len(result),
        "externalWritesPerformed":False,
        "productionRestorePerformed":False,
        "providerArtifactAvailabilityVerified":False,
        "fullWebsiteRestorable":False,
    }

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifact_zip",type=Path,help="previously downloaded GitHub Actions ZIP")
    args=parser.parse_args()
    try:
        if args.artifact_zip.stat().st_size > MAX_ARCHIVE_BYTES:
            raise VerificationError("ZIP too large")
        with zipfile.ZipFile(args.artifact_zip) as archive:
            report=verify_zip(archive)
    except (OSError,zipfile.BadZipFile,VerificationError) as exc:
        print(json.dumps({"status":"FAIL","reason":str(exc)[:170]},ensure_ascii=False))
        raise SystemExit(1)
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=="__main__":
    main()
