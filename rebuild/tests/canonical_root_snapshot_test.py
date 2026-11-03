"""Fail-closed canonical root backup staging/verification tests (no remote provider)."""
import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

ROOT = Path(__file__).resolve().parents[2]
import sys
sys.path.insert(0, str(ROOT / "rebuild/tools"))
import canonical_root_snapshot as snapshot

SHA = "a" * 40

def fixture(root):
    for filename, field in snapshot.REGISTRIES:
        obj = {field: [{"id": "public-1"}, {"id": "public-2"}]}
        if field == "people":
            obj["count"] = 2
        (root / filename).write_text(json.dumps(obj), encoding="utf-8")

class SnapshotTests(unittest.TestCase):
    def test_can_stage_and_reverify_three_public_sources(self):
        with TemporaryDirectory() as d:
            p = Path(d)
            source, dest = p / "source", p / "staged"
            source.mkdir()
            fixture(source)
            original = (source / "news.json").read_bytes()
            staged = snapshot.stage(source, dest, SHA)
            self.assertEqual(set(p.name for p in dest.iterdir()), snapshot.REQUIRED_NAMES)
            self.assertEqual(staged["commit"], SHA)
            verified = snapshot.verify(dest, SHA)
            self.assertEqual(verified["records"]["hall-of-fame-people.json"], 2)
            self.assertFalse(verified["productionRestorePerformed"])
            self.assertFalse(verified["remoteArtifactRetrievalVerified"])
            self.assertEqual((source / "news.json").read_bytes(), original)

    def test_tampering_detected(self):
        with TemporaryDirectory() as d:
            p = Path(d)
            (p / "source").mkdir()
            fixture(p / "source")
            snapshot.stage(p / "source", p / "staged", SHA)
            (p / "staged/news.json").write_text('{"items":[]}', encoding="utf-8")
            with self.assertRaisesRegex(snapshot.SnapshotError, "mismatch"):
                snapshot.verify(p / "staged", SHA)

    def test_unexpected_file_rejected(self):
        with TemporaryDirectory() as d:
            p=Path(d)
            (p/"source").mkdir()
            fixture(p/"source")
            snapshot.stage(p/"source",p/"staged",SHA)
            (p/"staged/private.txt").write_text("never upload this")
            with self.assertRaisesRegex(snapshot.SnapshotError,"unexpected"):
                snapshot.verify(p/"staged",SHA)

    def test_source_commit_must_match(self):
        with TemporaryDirectory() as d:
            p=Path(d)
            (p/"source").mkdir()
            fixture(p/"source")
            snapshot.stage(p/"source",p/"staged",SHA)
            with self.assertRaisesRegex(snapshot.SnapshotError,"commit does not match"):
                snapshot.verify(p/"staged","b"*40)

    def test_refuse_invalid_source_or_duplicate_ids(self):
        with TemporaryDirectory() as d:
            p=Path(d)
            (p/"source").mkdir()
            fixture(p/"source")
            f=p/"source/news.json"
            f.write_text('{"items":[{"id":"x"},{"id":"x"}]}')
            with self.assertRaisesRegex(snapshot.InventoryError,"duplicate"):
                snapshot.stage(p/"source",p/"staged",SHA)
            self.assertFalse((p/"staged").exists())

    def test_refuse_existing_staging_dir(self):
        with TemporaryDirectory() as d:
            p=Path(d)
            (p/"source").mkdir()
            fixture(p/"source")
            (p/"staged").mkdir()
            with self.assertRaisesRegex(snapshot.SnapshotError,"already exists"):
                snapshot.stage(p/"source",p/"staged",SHA)

    def test_refuse_symlinked_source(self):
        with TemporaryDirectory() as d:
            p=Path(d)
            (p/"source").mkdir()
            fixture(p/"source")
            (p/"source/news.json").unlink()
            (p/"source/news.json").symlink_to(p/"source/hall-of-fame-people.json")
            with self.assertRaisesRegex(snapshot.InventoryError,"symbolic link"):
                snapshot.stage(p/"source",p/"staged",SHA)

if __name__ == "__main__":
    unittest.main()
