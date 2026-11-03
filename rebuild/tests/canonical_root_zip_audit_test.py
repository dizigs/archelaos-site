"""Tamper-resistant, extraction-free ZIP readback of public root archive."""
from __future__ import annotations
from io import BytesIO
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from zipfile import ZipFile, ZIP_DEFLATED, ZipInfo
import stat
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "rebuild/tools"))
import canonical_root_snapshot as snapshot
import canonical_root_zip_audit as zipaudit

SHA = "c" * 40

def staged():
    with TemporaryDirectory() as temp:
        root=Path(temp)
        src=root/"src"
        src.mkdir()
        for name, key in snapshot.REGISTRIES:
            obj={key:[{"id":"first"},{"id":"second"}]}
            if key=="people":
                obj["count"]=2
            (src/name).write_text(json.dumps(obj),encoding="utf-8")
        dest=root/"dest"
        snapshot.stage(src,dest,SHA)
        yield {name:(dest/name).read_bytes() for name in snapshot.REQUIRED_NAMES}

def pack(files, extra=None):
    mem=BytesIO()
    with ZipFile(mem,"w",ZIP_DEFLATED) as z:
        for name,data in files.items():
            z.writestr(name,data)
        if extra:
            z.writestr(extra[0],extra[1])
    mem.seek(0)
    return mem

class ZipAuditTests(unittest.TestCase):
    def test_valid_archive_passes_without_extract(self):
        files=next(staged())
        with ZipFile(pack(files)) as z:
            result=zipaudit.verify_zip(z,SHA)
        self.assertEqual(result["fileCount"],3)
        self.assertFalse(result["productionRestorePerformed"])
        self.assertFalse(result["remoteProviderVerified"])

    def test_tamper_json_fails(self):
        files=next(staged())
        obj=json.loads(files["news.json"])
        obj["items"][0]["id"]="changed"
        files["news.json"]=json.dumps(obj).encode()
        with ZipFile(pack(files)) as z:
            with self.assertRaisesRegex(snapshot.SnapshotError,"mismatch"):
                zipaudit.verify_zip(z,SHA)

    def test_wrong_commit_fails(self):
        with ZipFile(pack(next(staged()))) as z:
            with self.assertRaisesRegex(snapshot.SnapshotError,"source SHA"):
                zipaudit.verify_zip(z,"d"*40)

    def test_extra_private_file_fails(self):
        with ZipFile(pack(next(staged()),("private/records.csv",b"secret")) as z:
            with self.assertRaisesRegex(snapshot.SnapshotError,"unexpected"):
                zipaudit.verify_zip(z,SHA)

    def test_traversal_fails(self):
        with ZipFile(pack(next(staged()),("../unexpected",b"secret")) as z:
            with self.assertRaisesRegex(snapshot.SnapshotError,"unsafe ZIP path"):
                zipaudit.verify_zip(z,SHA)

    def test_duplicate_entry_fails(self):
        raw=pack(next(staged()))
        with ZipFile(raw,"a",ZIP_DEFLATED) as z:
            z.writestr("news.json",b"duplicate")
        raw.seek(0)
        with ZipFile(raw) as z:
            with self.assertRaisesRegex(snapshot.SnapshotError,"duplicate ZIP"):
                zipaudit.verify_zip(z,SHA)

    def test_symlink_fails(self):
        raw=pack(next(staged()))
        with ZipFile(raw,"a",ZIP_DEFLATED) as z:
            entry=ZipInfo("private-link")
            entry.create_system=3
            entry.external_attr=(stat.S_IFLNK|0o777)<<16
            z.writestr(entry,b"/tmp/private")
        raw.seek(0)
        with ZipFile(raw) as z:
            with self.assertRaises(snapshot.SnapshotError):
                zipaudit.verify_zip(z,SHA)

if __name__=="__main__":
    unittest.main()
