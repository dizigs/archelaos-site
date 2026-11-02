"""Missing schedule evidence must not be mistaken for a passing workflow."""
from datetime import datetime, timedelta, timezone
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("automation_health", ROOT / ".github/scripts/automation_health.py")
health = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(health)
NOW = datetime(2026, 11, 2, 12, tzinfo=timezone.utc)
PATH = ".github/workflows/example.yml"
POLICY = {"schema_version": 1, "scheduled_workflows": {
    PATH: {"cron": ["17 */6 * * *"], "max_age_hours": 9}}}


def run(age=1, conclusion="success", status="completed"):
    return {"id": 12, "created_at": (NOW - timedelta(hours=age)).isoformat(),
            "status": status, "conclusion": conclusion, "head_sha": "a" * 40,
            "event": "schedule", "html_url": "https://github.com/example/repo/actions/runs/12"}


class FakeGitHub:
    def __init__(self, scheduled=None, latest=None, state="active", missing=False):
        self.scheduled, self.latest_main, self.state, self.missing = scheduled, latest, state, missing
        self.events = []

    def get(self, path):
        return {"default_branch": "main"}

    def workflows(self):
        return [] if self.missing else [{"id": 1, "path": PATH, "name": "test", "state": self.state}]

    def latest(self, workflow_id, branch, event=None):
        self.events.append(event)
        return self.scheduled if event else self.latest_main


class AutomationHealthTests(unittest.TestCase):
    def report(self, api, cron="17 */6 * * *"):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            p = root / PATH
            p.parent.mkdir(parents=True)
            p.write_text(f"on:\n  schedule:\n    - cron: '{cron}'\n")
            return health.build_report(api, root, POLICY, NOW)

    def test_recent_manual_success_does_not_hide_missing_schedule(self):
        api = FakeGitHub(latest=run())
        report = self.report(api)
        self.assertFalse(report["ok"])
        self.assertEqual(report["workflows"][0]["state"], "missing")
        self.assertEqual(api.events, [None, "schedule"])

    def test_recent_manual_success_does_not_hide_stale_schedule(self):
        report = self.report(FakeGitHub(scheduled=run(age=10), latest=run()))
        self.assertEqual(report["workflows"][0]["state"], "stale")
        self.assertFalse(report["ok"])

    def test_successful_schedule_does_not_hide_new_main_failure(self):
        report = self.report(FakeGitHub(scheduled=run(), latest=run(conclusion="failure")))
        self.assertEqual(report["workflows"][0]["state"], "failed")

    def test_running_main_is_not_a_completed_pass(self):
        report = self.report(FakeGitHub(scheduled=run(), latest=run(status="in_progress", conclusion=None)))
        self.assertEqual(report["workflows"][0]["state"], "running")
        self.assertEqual(report["assessment"], "incomplete")

    def test_api_failure_is_unknown_and_keeps_inventory_without_retry(self):
        api = FakeGitHub()
        with patch.object(api, "latest", side_effect=health.EvidenceError("GET actions/workflows/1/runs: HTTP 403")) as request:
            report = self.report(api)
        self.assertFalse(report["ok"])
        self.assertEqual(report["workflows"][0]["state"], "unknown")
        self.assertEqual(request.call_count, 1)
        self.assertIn("HTTP 403", health.markdown(report))

    def test_disabled_workflow_is_not_assumed_healthy(self):
        api = FakeGitHub(scheduled=run(), state="disabled_inactivity")
        report = self.report(api)
        self.assertEqual(report["workflows"][0]["state"], "disabled")
        self.assertFalse(report["ok"])
        self.assertEqual(api.events, [])

    def test_missing_workflow_is_reported(self):
        report = self.report(FakeGitHub(missing=True))
        self.assertEqual(report["workflows"][0]["state"], "missing_workflow")
        self.assertFalse(report["ok"])

    def test_skipped_cancelled_and_running_are_not_success(self):
        for conclusion in ("skipped", "cancelled", "neutral"):
            with self.subTest(conclusion=conclusion):
                report = self.report(FakeGitHub(scheduled=run(conclusion=conclusion)))
                self.assertEqual(report["workflows"][0]["state"], conclusion)
                self.assertFalse(report["ok"])
        pending = self.report(FakeGitHub(scheduled=run(status="in_progress", conclusion=None)))
        self.assertEqual(pending["assessment"], "incomplete")
        self.assertEqual(pending["workflows"][0]["state"], "running")

    def test_fresh_success_has_specific_evidence(self):
        report = self.report(FakeGitHub(scheduled=run(), latest=run()))
        self.assertTrue(report["ok"])
        self.assertEqual(report["assessment"], "verified")
        self.assertEqual(report["workflows"][0]["latest_scheduled"]["id"], 12)

    def test_bad_timestamps_and_unknown_conclusions_fail_closed(self):
        for bad in ({"created_at": "invalid"}, run(age=-1), run(conclusion=None)):
            with self.subTest(run=bad), self.assertRaises(health.EvidenceError):
                health.scheduled_state(bad, NOW, 9)

    def test_schedule_drift_requires_deliberate_policy_update(self):
        with self.assertRaisesRegex(health.EvidenceError, "drifted"):
            self.report(FakeGitHub(), cron="17 */12 * * *")

    def test_current_repository_policy_covers_all_existing_schedules(self):
        policy = json.loads((ROOT / ".github/automation-health-policy.json").read_text())
        health.validate_policy(ROOT, policy)

    def test_permission_failure_is_not_retried_or_leaked(self):
        api = health.GitHub("example/repo", "secret-fixture")
        exc = HTTPError("https://api.github.com/", 403, "private-body", {}, None)
        with patch.object(health, "urlopen", side_effect=exc) as request:
            with self.assertRaises(health.EvidenceError) as caught:
                api.get("actions/workflows")
        self.assertEqual(request.call_count, 1)
        self.assertEqual(str(caught.exception), "GET actions/workflows: HTTP 403")
        self.assertNotIn("secret-fixture", str(caught.exception))

    def test_repository_metadata_uses_exact_rest_endpoint(self):
        api = health.GitHub("example/repo", "")
        with patch.object(health, "urlopen", return_value=io.StringIO('{"default_branch":"main"}')) as request:
            self.assertEqual(api.get("")["default_branch"], "main")
        self.assertEqual(request.call_args.args[0].full_url, "https://api.github.com/repos/example/repo")

    def test_malformed_api_and_policy_are_unknown_not_success(self):
        api = health.GitHub("example/repo", "")
        with patch.object(health, "urlopen", return_value=io.StringIO('[]')):
            with self.assertRaisesRegex(health.EvidenceError, "unexpected JSON shape"):
                api.get("")
        with patch.object(api, "get", return_value={"workflow_runs": ["invalid"]}):
            with self.assertRaises(health.EvidenceError):
                api.latest(1, "main")
        with self.assertRaises(health.EvidenceError):
            health.validate_policy(ROOT, [])

    def test_inventory_pagination_cannot_silently_truncate(self):
        api = health.GitHub("example/repo", "")
        with patch.object(api, "get", side_effect=[
            {"total_count": 2, "workflows": [{"id": 1}]},
            {"total_count": 2, "workflows": [{"id": 2}]},
        ]) as request:
            self.assertEqual(len(api.workflows()), 2)
            self.assertEqual(request.call_count, 2)
        with patch.object(api, "get", return_value={"total_count": 1, "workflows": []}):
            with self.assertRaisesRegex(health.EvidenceError, "incomplete"):
                api.workflows()

    def test_cli_cannot_choose_arbitrary_write_paths(self):
        for option in ("--output", "--summary"):
            with self.subTest(option=option), patch("sys.argv", ["automation_health", option, "../../target"]):
                with self.assertRaises(SystemExit) as caught:
                    health.main()
                self.assertEqual(caught.exception.code, 2)

    def test_report_directory_symlink_cannot_escape_repository(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "repo"
            outside = Path(tmp) / "outside"
            root.mkdir()
            outside.mkdir()
            (root / "rebuild").symlink_to(outside, target_is_directory=True)
            with patch.object(health, "ROOT", root), self.assertRaises(OSError):
                health.write_report("automation-health-report.json", "safe")
            self.assertEqual(list(outside.iterdir()), [])

    def test_report_symlinks_and_hardlinks_do_not_overwrite_other_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            target = root / "important.txt"
            target.write_text("unchanged")
            report = root.joinpath(*health.REPORT_PARTS, "automation-health-report.json")
            report.parent.mkdir(parents=True)
            for link_type in ("symlink", "hardlink"):
                with self.subTest(link_type=link_type):
                    if report.exists():
                        report.unlink()
                    if link_type == "symlink":
                        report.symlink_to(target)
                    else:
                        report.hardlink_to(target)
                    with patch.object(health, "ROOT", root):
                        health.write_report("automation-health-report.json", "new report")
                    self.assertEqual(target.read_text(), "unchanged")
                    self.assertEqual(report.read_text(), "new report")
                    self.assertFalse(report.is_symlink())


if __name__ == "__main__":
    unittest.main()
