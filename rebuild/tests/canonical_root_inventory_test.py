"""Synthetic canary tests for public root registry recovery inventory."""
from __future__ import annotations
from hashlib import sha256
import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("canonical_root_inventory", ROOT/"rebuild/tools/canonical_root_inventory.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def fixture(root, corrupted=None):
    for filename, key in mod.REGISTRIES:
        ids = ["arch-example-1", "arch-example-2"] if key == "people" else ["event-one", "event-two"]
        obj = {key: [{"id": x, "title": "Public test"} for x in ids]}
        if filename == "hall-of-fame-people.json":
            obj["count"] = len(ids)
        if corrupted == filename:
            obj[key][1]["id"] = obj[key][0]["id"]
        (root/filename).write_text(json.dumps(obj), encoding="utf-8")

class InventoryTests(unittest.TestCase):
    def test_valid_fixture_is_deterministic(self):
        with TemporaryDirectory() as d:
            root = Path(d)
            fixture(root)
            a = mod.build_manifest(root)
            b = mod.build_manifest(root)
            self.assertEqual(a, b)
            self.assertEqual([x["records"] for x in a["entries"]], [2, 2, 2])
            self.assertFalse(a["externalWritesPerformed"])
            self.assertFalse(a["productionRestorePerformed"])
    def test_duplicate_id_fails_closed(self):
        with TemporaryDirectory() as d:
            root = Path(d)
            fixture(root, corrupted="news.json")
            with self.assertRaisesRegex(mod.InventoryError, "duplicate"):
                mod.build_manifest(root)
    def test_symlink_is_rejected(self):
        with TemporaryDirectory() as d:
            root = Path(d)
            fixture(root)
            (root/"news.json").unlink()
            (root/"news.json").symlink_to(root/"hall-of-fame-people.json")
            with self.assertRaisesRegex(mod.InventoryError, "symbolic"):
                mod.build_manifest(root)
    def test_count_mismatch_fails_closed(self):
        with TemporaryDirectory() as d:
            root = Path(d)
            fixture(root)
            p = root/"hall-of-fame-people.json"
            obj = json.loads(p.read_text())
            obj["count"] = 900
            p.write_text(json.dumps(obj))
            with self.assertRaisesRegex(mod.InventoryError, "declared count"):
                mod.build_manifest(root)
    def test_same_baseline_passes_and_id_deletion_is_reported(self):
        with TemporaryDirectory() as d:
            root = Path(d)
            fixture(root)
            old = mod.build_manifest(root)
            self.assertTrue(mod.compare(old, old)["same"])
            news = root/"news.json"
            data = json.loads(news.read_text())
            data["items"].pop()
            news.write_text(json.dumps(data))
            result = mod.compare(mod.build_manifest(root), old)
            self.assertFalse(result["same"])
            self.assertTrue(result["differences"][0]["idSetChanged"])
            self.assertEqual(result["differences"][0]["recordCountDelta"], -1)
    def test_unknown_baseline_file_is_rejected(self):
        with TemporaryDirectory() as d:
            root = Path(d)
            fixture(root)
            base = mod.build_manifest(root)
            base["entries"][0]["file"] = "private-archive.json"
            with self.assertRaisesRegex(mod.InventoryError, "unrecognized"):
                mod.compare(mod.build_manifest(root), base)

if __name__ == "__main__":
    unittest.main()
