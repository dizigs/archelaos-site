"""Exercise report confinement with real CLI calls and synthetic public data."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

TOOLS = Path(__file__).resolve().parents[1] / "tools"
JSON_REPORT = "rebuild/test-artifacts/event-review-queue.json"
MARKDOWN_REPORT = "rebuild/test-artifacts/event-review-queue.md"


class TriageSecurity(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / "repo"
        tools = self.root / "rebuild/tools"
        tools.mkdir(parents=True)
        for name in ("event_triage.py", "public_snapshot.py"):
            shutil.copyfile(TOOLS / name, tools / name)
        self.script = tools / "event_triage.py"
        source = self.root / "rebuild/research/historical-events.json"
        source.parent.mkdir()
        source.write_text(json.dumps({"source_registry": [], "events": []}))
        self.reports = self.root / "rebuild/test-artifacts"
        self.reports.mkdir()
        self.outside = self.root.parent / "outside.txt"
        self.original = "synthetic public sentinel"
        self.outside.write_text(self.original)

    def run_cli(self, *args):
        # A separate cwd proves defaults/choices are anchored to the checkout.
        return subprocess.run([sys.executable, str(self.script), *args],
                              cwd=self.root.parent, text=True, capture_output=True,
                              timeout=5)

    def test_default_reports_remain_advisory(self):
        result = self.run_cli()
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads((self.root / JSON_REPORT).read_text())
        self.assertTrue(report["advisory_only"])
        self.assertTrue(report["owner_decides"])
        self.assertEqual(report["rows"], [])
        self.assertIn(report["dataset_fingerprint"][:16], (self.root / MARKDOWN_REPORT).read_text())

    def test_explicit_fixed_choices_match_default_output(self):
        self.assertEqual(self.run_cli().returncode, 0)
        before = [(self.root / p).read_bytes() for p in (JSON_REPORT, MARKDOWN_REPORT)]
        result = self.run_cli("--json", JSON_REPORT, "--markdown", MARKDOWN_REPORT)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(before, [(self.root / p).read_bytes() for p in (JSON_REPORT, MARKDOWN_REPORT)])

    def test_arbitrary_and_traversal_paths_are_rejected(self):
        for flag in ("--json", "--markdown"):
            for value in (str(self.outside), "../outside.txt", str(self.reports / "unrelated.txt")):
                with self.subTest(flag=flag, value=value):
                    (self.reports / "unrelated.txt").unlink(missing_ok=True)
                    result = self.run_cli(flag, value)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertEqual(self.outside.read_text(), self.original)
                    self.assertFalse((self.reports / "unrelated.txt").exists())

    def test_symlinked_report_root_cannot_redirect_both_outputs(self):
        self.reports.rmdir()
        other = self.root.parent / "foreign-reports"
        other.mkdir()
        sentinels = [other / Path(p).name for p in (JSON_REPORT, MARKDOWN_REPORT)]
        for p in sentinels:
            p.write_text(self.original)
        self.reports.symlink_to(other, target_is_directory=True)
        result = self.run_cli()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual([p.read_text() for p in sentinels], [self.original] * 2)

    def test_hardlink_destinations_cannot_overwrite_outside(self):
        for report in (JSON_REPORT, MARKDOWN_REPORT):
            with self.subTest(report=report):
                target = self.root / report
                target.unlink(missing_ok=True)
                self.outside.write_text(self.original)
                os.link(self.outside, target)
                result = self.run_cli()
                target.unlink()
                self.assertEqual(self.outside.read_text(), self.original)
                self.assertNotEqual(result.returncode, 0)

    def test_destination_symlinks_are_rejected_inside_and_outside(self):
        inside = self.reports / "unrelated.txt"
        for report in (JSON_REPORT, MARKDOWN_REPORT):
            for destination in (inside, self.outside):
                with self.subTest(report=report, destination=destination):
                    destination.write_text(self.original)
                    target = self.root / report
                    target.unlink(missing_ok=True)
                    target.symlink_to(destination)
                    result = self.run_cli()
                    target.unlink()
                    self.assertEqual(destination.read_text(), self.original)
                    self.assertNotEqual(result.returncode, 0)

    def test_rejected_second_destination_leaves_first_report_unchanged(self):
        first = self.root / JSON_REPORT
        first.write_text(self.original)
        os.link(self.outside, self.root / MARKDOWN_REPORT)
        result = self.run_cli()
        self.assertEqual(first.read_text(), self.original)
        self.assertEqual(self.outside.read_text(), self.original)
        self.assertNotEqual(result.returncode, 0)

    def test_directory_destination_is_rejected(self):
        (self.root / MARKDOWN_REPORT).mkdir()
        result = self.run_cli()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / JSON_REPORT).exists())


if __name__ == "__main__":
    unittest.main()
