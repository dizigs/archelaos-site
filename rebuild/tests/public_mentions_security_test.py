"""No-network CLI confinement tests using synthetic public registries only."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

TOOLS = Path(__file__).resolve().parents[1] / "tools"
CONFIG = "rebuild/research/public-mentions-sources.json"
REPORT = "rebuild/test-artifacts/public-mentions.json"


class MentionsSecurity(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.workspace = Path(self.tmp.name)
        self.root = self.workspace / "repo"
        tools = self.root / "rebuild/tools"
        tools.mkdir(parents=True)
        for filename in ("public_mentions.py", "public_snapshot.py"):
            shutil.copyfile(TOOLS / filename, tools / filename)
        self.script = tools / "public_mentions.py"
        self.config = self.root / CONFIG
        self.config.parent.mkdir(parents=True)
        self.registry = {"schema_version":1, "publishing_disabled":True, "feeds":[], "accounts":[]}
        self.config.write_text(json.dumps(self.registry))
        (self.root / "rebuild/test-artifacts").mkdir()
        self.outside = self.workspace / "outside.json"
        self.original = '{"sentinel":"synthetic public fixture"}'
        self.outside.write_text(self.original)
        self.foreign_config = self.workspace / "foreign-config.json"
        self.foreign_config.write_text(json.dumps({**self.registry, "accounts":[{"platform":"foreign-fixture", "active":False}]}))

    def run_cli(self, *args):
        return subprocess.run([sys.executable, str(self.script), *args], cwd=self.root,
                              text=True, capture_output=True, timeout=5)

    def test_default_registry_and_report(self):
        result = self.run_cli()
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads((self.root / REPORT).read_text())
        self.assertEqual(report["candidate_count"], 0)
        self.assertEqual(report["accounts_waiting_for_authorized_access"], [])

    def test_existing_workflow_root_report_is_preserved(self):
        result = self.run_cli("--output", "public-mentions-report.json")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads((self.root / "public-mentions-report.json").read_text())["candidate_count"], 0)

    def test_arbitrary_config_cannot_be_read(self):
        result = self.run_cli("--config", str(self.foreign_config))
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / REPORT).exists())

    def test_symlink_config_is_rejected(self):
        self.config.unlink(); self.config.symlink_to(self.foreign_config)
        self.assertNotEqual(self.run_cli().returncode, 0)
        self.assertFalse((self.root / REPORT).exists())

    def test_hardlink_config_is_rejected(self):
        self.config.unlink(); os.link(self.foreign_config, self.config)
        self.assertNotEqual(self.run_cli().returncode, 0)
        self.assertFalse((self.root / REPORT).exists())

    def test_symlink_registry_parent_is_rejected(self):
        self.config.unlink(); self.config.parent.rmdir()
        outside = self.workspace / "outside-registry"; outside.mkdir()
        shutil.copyfile(self.foreign_config, outside / self.config.name)
        self.config.parent.symlink_to(outside, target_is_directory=True)
        self.assertNotEqual(self.run_cli().returncode, 0)
        self.assertFalse((self.root / REPORT).exists())

    def test_arbitrary_output_cannot_overwrite_outside(self):
        result = self.run_cli("--output", "../outside.json")
        self.assertEqual(self.outside.read_text(), self.original)
        self.assertNotEqual(result.returncode, 0)

    def test_symlink_and_hardlink_reports_are_rejected(self):
        destination = self.root / REPORT
        for kind in ("symlink", "hardlink"):
            with self.subTest(kind=kind):
                self.outside.write_text(self.original)
                if kind == "symlink": destination.symlink_to(self.outside)
                else: os.link(self.outside, destination)
                result = self.run_cli()
                self.assertEqual(self.outside.read_text(), self.original)
                self.assertNotEqual(result.returncode, 0)
            destination.unlink()

    def test_report_parent_cannot_redirect_write(self):
        parent = self.root / "rebuild/test-artifacts"; parent.rmdir()
        outside = self.workspace / "outside-reports"; outside.mkdir()
        sentinel = outside / "public-mentions.json"; sentinel.write_text(self.original)
        parent.symlink_to(outside, target_is_directory=True)
        result = self.run_cli()
        self.assertEqual(sentinel.read_text(), self.original)
        self.assertNotEqual(result.returncode, 0)

    def test_registry_byte_limit_is_enforced(self):
        self.config.write_text(json.dumps({**self.registry, "padding":"x" * 1_000_001}))
        self.assertNotEqual(self.run_cli().returncode, 0)
        self.assertFalse((self.root / REPORT).exists())


if __name__ == "__main__":
    unittest.main()
