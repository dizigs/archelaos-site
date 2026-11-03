"""Real CLI security checks against public-only disposable snapshot fixtures."""
import json
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from contextlib import contextmanager
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / "tools/public_snapshot.py"
DATASETS = ("people", "moments", "stories", "museum", "interviews", "match-schedule", "home", "board", "retro", "on-this-day")
NAME = "public-archive-manifest.json"
ARTIFACT = "rebuild/test-artifacts/" + NAME


class SnapshotSecurity(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.workspace = Path(self.tmp.name)
        self.root = self.workspace / "repo"
        tools = self.root / "rebuild/tools"
        tools.mkdir(parents=True)
        self.script = tools / "public_snapshot.py"
        shutil.copyfile(SOURCE, self.script)
        data = self.root / "dist/assets/site/data"
        data.mkdir(parents=True)
        for name in DATASETS:
            (data / (name + ".json")).write_text(json.dumps({"items":[{"id":"public-fixture"}]}))
        (self.root / "rebuild/test-artifacts").mkdir()
        self.outside = self.workspace / "outside.json"
        self.original = '{"sentinel":"public fixture, never real private data"}'
        self.outside.write_text(self.original)

    def run_cli(self, *args):
        return subprocess.run([sys.executable, str(self.script), *args], cwd=self.root,
                              text=True, capture_output=True, timeout=5)

    def test_default_output_preserves_public_manifest_contract(self):
        result = self.run_cli()
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads((self.root / NAME).read_text())
        self.assertEqual(report["format"], 1)
        self.assertEqual(len(report["files"]), 10)
        self.assertTrue(all(len(item["sha256"]) == 64 and item["records"] == 1 for item in report["files"]))

    def test_allowlisted_artifact_output(self):
        result = self.run_cli("--output", ARTIFACT)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(json.loads((self.root / ARTIFACT).read_text())["files"]), 10)

    def test_traversal_and_unapproved_outputs_cannot_write(self):
        for target in ("../outside.json", str(self.workspace / "absolute.json"), "other.json"):
            with self.subTest(target=target):
                result = self.run_cli("--output", target)
                self.assertEqual(self.outside.read_text(), self.original)
                self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.workspace / "absolute.json").exists())
        self.assertFalse((self.root / "other.json").exists())

    def test_destination_symlink_cannot_overwrite_outside_file(self):
        (self.root / NAME).symlink_to(self.outside)
        result = self.run_cli()
        self.assertEqual(self.outside.read_text(), self.original)
        self.assertNotEqual(result.returncode, 0)

    def test_destination_hardlink_cannot_overwrite_outside_inode(self):
        os.link(self.outside, self.root / NAME)
        result = self.run_cli()
        self.assertEqual(self.outside.read_text(), self.original)
        self.assertNotEqual(result.returncode, 0)

    def test_parent_symlink_cannot_redirect_artifact_write(self):
        parent = self.root / "rebuild/test-artifacts"
        parent.rmdir()
        outside_dir = self.workspace / "outside-dir"
        outside_dir.mkdir()
        sentinel = outside_dir / NAME
        sentinel.write_text(self.original)
        parent.symlink_to(outside_dir, target_is_directory=True)
        result = self.run_cli("--output", ARTIFACT)
        self.assertEqual(sentinel.read_text(), self.original)
        self.assertNotEqual(result.returncode, 0)

    def test_directory_destination_is_rejected(self):
        (self.root / NAME).mkdir()
        self.assertNotEqual(self.run_cli().returncode, 0)
        self.assertTrue((self.root / NAME).is_dir())

    def subject(self):
        spec = importlib.util.spec_from_file_location("snapshot_subject", self.script)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_missing_artifact_directory_is_created_within_checkout(self):
        (self.root / "rebuild/test-artifacts").rmdir()
        result = self.run_cli("--output", ARTIFACT)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.root / ARTIFACT).is_file())

    def test_partial_write_preserves_previous_manifest_and_removes_temporary(self):
        destination = self.root / NAME
        destination.write_text(self.original)
        module = self.subject()
        original_fdopen = os.fdopen

        @contextmanager
        def failing_stream(*args, **kwargs):
            with original_fdopen(*args, **kwargs) as stream:
                class PartialWrite:
                    def write(self, value):
                        stream.write(value[:8])
                        stream.flush()
                        raise OSError("Synthetic interrupted write")
                yield PartialWrite()

        with patch.object(module.os, "fdopen", failing_stream), self.assertRaises(OSError):
            module.write_snapshot()
        self.assertEqual(destination.read_text(), self.original)
        self.assertEqual(list(self.root.glob(".public-report-*.tmp")), [])

    def test_shared_writer_rejects_unapproved_and_traversal_names(self):
        module = self.subject()
        with module.output_directory(()) as directory:
            for name in ("../outside.json", str(self.outside), "unrelated.json"):
                with self.subTest(name=name), self.assertRaises(ValueError):
                    module.replace_report(directory, name, "must not be written")
        self.assertEqual(self.outside.read_text(), self.original)
        self.assertFalse((self.root / "unrelated.json").exists())

    def test_shared_writer_supports_each_reviewed_report_slot(self):
        module = self.subject()
        with module.output_directory(()) as directory:
            for name in module.APPROVED_REPORT_NAMES:
                with self.subTest(name=name):
                    module.replace_report(directory, name, "synthetic public report\n")
                    self.assertEqual((self.root / name).read_text(), "synthetic public report\n")

    def test_parent_swap_during_write_cannot_redirect_replace(self):
        module = self.subject()
        parent = self.root / "rebuild/test-artifacts"
        held = self.root / "rebuild/held-artifacts"
        outside = self.workspace / "outside-directory"
        outside.mkdir()
        sentinel = outside / NAME
        sentinel.write_text(self.original)
        original_replace = os.replace

        def swap_then_replace(*args, **kwargs):
            parent.rename(held)
            parent.symlink_to(outside, target_is_directory=True)
            return original_replace(*args, **kwargs)

        with patch.object(module.os, "replace", swap_then_replace):
            module.write_snapshot(ARTIFACT)
        self.assertEqual(sentinel.read_text(), self.original)
        self.assertEqual(len(json.loads((held / NAME).read_text())["files"]), 10)


if __name__ == "__main__":
    unittest.main()
