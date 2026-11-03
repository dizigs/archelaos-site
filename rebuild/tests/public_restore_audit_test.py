"""Closed-fixture regression tests for read-only public archive restore rehearsal."""
from hashlib import sha256
import importlib.util
from io import BytesIO
import json
from pathlib import Path
import stat
import unittest
from zipfile import ZipFile, ZIP_DEFLATED, ZipInfo

ROOT = Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location("public_restore_audit",ROOT/"rebuild/tools/public_restore_audit.py")
audit=importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

def make_zip(tamper=None, extra=None):
    buffer=BytesIO()
    blobs={name:json.dumps({"items":[{"id":name,"value":"example"}]},separators=(",",":")).encode()
           for name in sorted(audit.EXPECTED)}
    rows=[{"file":name,"sha256":sha256(payload).hexdigest(),"bytes":len(payload),"records":1}
          for name,payload in blobs.items()]
    manifest={"format":1,"source":"public dist archive (never private Google Drive)",
              "commit":"offline-test-not-a-real-deploy","files":rows}
    with ZipFile(buffer,"w",ZIP_DEFLATED) as z:
        z.writestr("public-archive-manifest.json",json.dumps(manifest))
        for name,payload in blobs.items():
            z.writestr(audit.ROOT+name,b"changed" if tamper==name else payload)
        if extra:z.writestr(extra,b"oops")
    buffer.seek(0)
    return buffer

class RestoreAuditTests(unittest.TestCase):
    def test_complete_fixture_passes_without_writes(self):
        with ZipFile(make_zip()) as z:
            report=audit.verify_zip(z)
        self.assertEqual(report["dataFilesVerified"],10)
        self.assertEqual(report["status"],"PASS")
        self.assertFalse(report["productionRestorePerformed"])
        self.assertFalse(report["providerArtifactAvailabilityVerified"])
        self.assertFalse(report["fullWebsiteRestorable"])

    def test_changed_data_fails_checksum(self):
        with ZipFile(make_zip(tamper="people.json")) as z:
            with self.assertRaisesRegex(audit.VerificationError,"hash/size mismatch"):
                audit.verify_zip(z)

    def test_reject_extra_private_file(self):
        with ZipFile(make_zip(extra="private/people.csv")) as z:
            with self.assertRaisesRegex(audit.VerificationError,"unexpected"):
                audit.verify_zip(z)

    def test_reject_path_traversal(self):
        with ZipFile(make_zip(extra="../secret.json")) as z:
            with self.assertRaisesRegex(audit.VerificationError,"unsafe"):
                audit.verify_zip(z)

    def test_reject_symlink(self):
        b=make_zip()
        with ZipFile(b,"a",ZIP_DEFLATED) as z:
            info=ZipInfo("outside")
            info.create_system=3
            info.external_attr=(stat.S_IFLNK | 0o777) << 16
            z.writestr(info,"/tmp/private")
        b.seek(0)
        with ZipFile(b) as z:
            with self.assertRaises(audit.VerificationError):
                audit.verify_zip(z)

    def test_missing_file_fails(self):
        b=BytesIO()
        with ZipFile(b,"w",ZIP_DEFLATED) as z:
            z.writestr("public-archive-manifest.json","{}")
        b.seek(0)
        with ZipFile(b) as z:
            with self.assertRaisesRegex(audit.VerificationError,"missing"):
                audit.verify_zip(z)


    def test_reject_missing_manifest_commit(self):
        b=make_zip()
        clean=BytesIO()
        with ZipFile(b) as src, ZipFile(clean,"w",ZIP_DEFLATED) as dst:
            for info in src.infolist():
                contents=src.read(info.filename)
                if info.filename=="public-archive-manifest.json":
                    manifest=json.loads(contents)
                    manifest.pop("commit")
                    contents=json.dumps(manifest).encode()
                dst.writestr(info.filename,contents)
        clean.seek(0)
        with ZipFile(clean) as z:
            with self.assertRaisesRegex(audit.VerificationError,"manifest commit"):
                audit.verify_zip(z)

    def test_reject_extra_manifest_fields(self):
        b=make_zip()
        clean=BytesIO()
        with ZipFile(b) as src, ZipFile(clean,"w",ZIP_DEFLATED) as dst:
            for info in src.infolist():
                contents=src.read(info.filename)
                if info.filename=="public-archive-manifest.json":
                    manifest=json.loads(contents)
                    manifest["files"][0]["external_path"]="private/archive"
                    contents=json.dumps(manifest).encode()
                dst.writestr(info.filename,contents)
        clean.seek(0)
        with ZipFile(clean) as z:
            with self.assertRaisesRegex(audit.VerificationError,"manifest row fields"):
                audit.verify_zip(z)

if __name__=="__main__":
    unittest.main()
