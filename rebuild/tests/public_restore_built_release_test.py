"""Check a genuine local release build packaged as the weekly public snapshot layout.

Run only after build_release.py and public_snapshot.py. Makes a temporary ZIP
in the isolated GitHub runner, never modifies the release or uploads private files.
This is NOT proof that any historical remote artifact was retrievable.
"""
from __future__ import annotations

from io import BytesIO
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location("public_restore_audit",ROOT/"rebuild/tools/public_restore_audit.py")
audit=importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
DATA=ROOT/"dist/assets/site/data"
MANIFEST=ROOT/"public-archive-manifest.json"

class BuiltArtifactRehearsal(unittest.TestCase):
    def test_real_built_public_archive_is_recoverable_in_isolation(self):
        self.assertTrue(MANIFEST.is_file(),"Build public snapshot manifest first")
        manifest=json.loads(MANIFEST.read_text(encoding="utf-8"))
        names={row["file"] for row in manifest["files"]}
        self.assertEqual(names,audit.EXPECTED)
        with tempfile.TemporaryDirectory(prefix="archelaos-restore-rehearsal-") as directory:
            zip_path=Path(directory)/"public-archive-snapshot.zip"
            with zipfile.ZipFile(zip_path,"w",compression=zipfile.ZIP_DEFLATED) as z:
                z.write(MANIFEST,arcname="public-archive-manifest.json")
                for name in sorted(audit.EXPECTED):
                    path=DATA/name
                    self.assertTrue(path.is_file(),name)
                    self.assertFalse(path.is_symlink(),name)
                    z.write(path,arcname=audit.ROOT+name)
            with zipfile.ZipFile(zip_path) as z:
                result=audit.verify_zip(z)
            self.assertEqual(result["dataFilesVerified"],10)
            self.assertEqual(result["status"],"PASS")
            self.assertFalse(result["productionRestorePerformed"])
            self.assertFalse(result["providerArtifactAvailabilityVerified"])
            print("BUILT RELEASE RESTORE: verified 10 public JSON files from generated dist (not historical remote artifact)")

if __name__=="__main__":
    unittest.main()
