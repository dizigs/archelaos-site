"""Real CLI calendar-report confinement with synthetic, no-network fixtures."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from zipfile import ZipFile, ZIP_DEFLATED
from unittest.mock import patch

TOOLS = Path(__file__).resolve().parents[1] / "tools"
NAME = "match-calendar-review.json"
CHOICE = "rebuild/test-artifacts/" + NAME
ICS = """BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:synthetic-public-fixture
SUMMARY:Example A - Example B
DTSTART;TZID=Europe/Athens:20270101T180000
END:VEVENT
END:VCALENDAR
"""


class CalendarOutputSecurity(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.workspace = Path(temporary.name)
        self.root = self.workspace / "repo"
        self.tools = self.root / "rebuild/tools"
        self.tools.mkdir(parents=True)
        for name in ("import_match_calendar.py", "public_snapshot.py"):
            shutil.copyfile(TOOLS / name, self.tools / name)
        self.script = self.tools / "import_match_calendar.py"
        self.parent = self.root / "rebuild/test-artifacts"
        self.parent.mkdir()
        self.report = self.parent / NAME
        self.source = self.root / ".archive-intake/calendars/synthetic.ics"
        self.source.parent.mkdir(parents=True)
        self.source.write_text(ICS)
        self.outside = self.workspace / "outside.json"
        self.sentinel = '{"sentinel":"synthetic public fixture only"}'
        self.outside.write_text(self.sentinel)

    def run_cli(self, *args, cwd=None):
        return subprocess.run([sys.executable, str(self.script), "--handball", str(self.source), *args],
                              cwd=cwd or self.root, capture_output=True, text=True, timeout=5)

    def test_default_report_preserves_review_only_contract(self):
        result = self.run_cli()
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(self.report.read_text())
        self.assertEqual(data["publication"], "never_without_owner_review")
        self.assertEqual(len(data["candidates"]), 1)
        self.assertTrue(data["candidates"][0]["review_required"])
        self.assertFalse((self.root / "rebuild/data/match-schedule.json").exists())

    def test_external_and_linked_calendar_inputs_are_rejected(self):
        outside = self.workspace / "outside.ics"
        outside.write_text(ICS)
        invalid = self.run_cli("--volleyball", str(outside))
        self.assertNotEqual(invalid.returncode, 0)
        self.assertFalse(self.report.exists())
        linked = self.source.parent / "linked.ics"
        linked.symlink_to(outside)
        invalid_link = self.run_cli("--volleyball", str(linked))
        self.assertNotEqual(invalid_link.returncode, 0)
        self.assertFalse(self.report.exists())

    def test_zip_expansion_total_is_bounded(self):
        # Aggregate ZIP inflation is limited even if every member is below 5MB.
        bundle = self.source.parent / "oversized.zip"
        with ZipFile(bundle, "w", compression=ZIP_DEFLATED) as z:
            z.writestr("a.ics", "A" * 3_000_000)
            z.writestr("b.ics", "B" * 3_000_000)
        result = self.run_cli("--volleyball", str(bundle))
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.report.exists())

    def test_existing_schedule_file_is_not_modified(self):
        schedule = self.root / "rebuild/data/match-schedule.json"
        schedule.parent.mkdir(parents=True)
        schedule.write_text(self.sentinel)
        result = self.run_cli()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(schedule.read_text(), self.sentinel)

    def test_explicit_fixed_choice_is_anchored_from_another_cwd(self):
        result = self.run_cli("--out", CHOICE, cwd=self.workspace)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(self.report.is_file())
        self.assertFalse((self.workspace / CHOICE).exists())

    def test_traversal_absolute_and_custom_output_names_are_rejected(self):
        for value in ("../outside.json", str(self.outside), str(self.report),
                      "rebuild/test-artifacts/other.json", "rebuild/test-artifacts/../other.json"):
            with self.subTest(value=value):
                result = self.run_cli("--out", value)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self.outside.read_text(), self.sentinel)
        self.assertFalse(self.report.exists())
        self.assertFalse((self.parent / "other.json").exists())

    def test_symlinked_report_root_cannot_redirect_write(self):
        self.parent.rmdir()
        destination = self.workspace / "redirected"
        destination.mkdir()
        sentinel = destination / NAME
        sentinel.write_text(self.sentinel)
        self.parent.symlink_to(destination, target_is_directory=True)
        result = self.run_cli()
        self.assertEqual(sentinel.read_text(), self.sentinel)
        self.assertNotEqual(result.returncode, 0)

    def test_symlinked_rebuild_ancestor_is_rejected(self):
        spec = importlib.util.spec_from_file_location("calendar_snapshot_ancestor", TOOLS / "public_snapshot.py")
        snapshot = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(snapshot)
        alternate_root = self.workspace / "alternate-repo"
        decoy = self.workspace / "outside-decoy"
        alternate_root.mkdir()
        decoy.mkdir()
        (alternate_root / "rebuild").symlink_to(decoy, target_is_directory=True)
        with patch.object(snapshot, "ROOT", alternate_root):
            with self.assertRaises(OSError):
                with snapshot.output_directory(("rebuild", "test-artifacts")):
                    pass
        self.assertFalse((decoy / "test-artifacts").exists())

    def test_hardlinked_report_cannot_overwrite_an_outside_inode(self):
        os.link(self.outside, self.report)
        result = self.run_cli()
        self.assertEqual(self.outside.read_text(), self.sentinel)
        self.assertEqual(self.report.read_text(), self.sentinel)
        self.assertNotEqual(result.returncode, 0)

    def test_destination_symlink_inside_report_root_is_rejected(self):
        other = self.parent / "other.json"
        other.write_text(self.sentinel)
        self.report.symlink_to(other)
        result = self.run_cli()
        self.assertEqual(other.read_text(), self.sentinel)
        self.assertNotEqual(result.returncode, 0)

    def test_destination_symlink_outside_report_root_is_rejected(self):
        self.report.symlink_to(self.outside)
        self.assertNotEqual(self.run_cli().returncode, 0)
        self.assertEqual(self.outside.read_text(), self.sentinel)

    def test_missing_report_directory_is_safely_created(self):
        self.parent.rmdir()
        result = self.run_cli()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(self.report.is_file())
        self.assertEqual(self.report.stat().st_mode & 0o777, 0o600)

    def test_invalid_calendar_keeps_existing_report_and_fails_bounded(self):
        self.report.write_text(self.sentinel)
        self.source.write_text("not a calendar")
        result = self.run_cli()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.report.read_text(), self.sentinel)
        self.assertNotIn("Traceback", result.stderr)
        self.assertEqual(list(self.parent.glob(".public-report-*.tmp")), [])

    def test_directory_destination_is_rejected_without_traceback(self):
        self.report.mkdir()
        result = self.run_cli()
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(self.report.is_dir())
        self.assertNotIn("Traceback", result.stderr)

    def subject(self):
        spec = importlib.util.spec_from_file_location("calendar_snapshot_fixture", self.tools / "public_snapshot.py")
        helper = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(helper)
        spec = importlib.util.spec_from_file_location("calendar_subject", self.script)
        subject = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"public_snapshot": helper}):
            spec.loader.exec_module(subject)
        return subject

    def test_parent_swap_during_import_stays_on_the_held_directory(self):
        subject = self.subject()
        original = subject.import_sources
        moved = self.root / "held-original"
        destination = self.workspace / "swapped-outside"
        destination.mkdir()
        sentinel = destination / NAME
        sentinel.write_text(self.sentinel)

        def swap(paths):
            result = original(paths)
            self.parent.rename(moved)
            self.parent.symlink_to(destination, target_is_directory=True)
            return result

        with patch.object(subject, "import_sources", side_effect=swap), patch.object(
                sys, "argv", [str(self.script), "--handball", str(self.source)]):
            subject.main()
        self.assertEqual(sentinel.read_text(), self.sentinel)
        self.assertTrue((moved / NAME).is_file())
        self.assertEqual(list(moved.glob(".public-report-*.tmp")), [])


if __name__ == "__main__":
    unittest.main()
