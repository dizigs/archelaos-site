"""Existing main monitor integration must fail closed without duplicating repairs."""
from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import self_heal_monitor as monitor
import self_heal_fixture as fixture
import self_heal_github as gh
from test_self_heal_control_plane import JsonStore, foundation
from self_heal_control_plane import Policy


class Monitor(unittest.TestCase):
    def test_incomplete_monitor_results_cannot_be_reported_as_healthy(self):
        for value in ("skipped", "cancelled", "", "unknown"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                monitor.observe(None, "a" * 40, "123", value, "success")

    def test_healthy_monitor_does_not_open_issue_or_publish(self):
        with patch.object(monitor, "validate_main_run", return_value="trusted-run"), \
                patch.object(monitor, "IncidentStore") as store, patch.object(monitor, "DraftPublisher") as publisher:
            result = monitor.observe(None, "a" * 40, "123", "success", "success")
        self.assertEqual(result["status"], "HEALTHY_OBSERVATION")
        store.assert_not_called(); publisher.assert_not_called()

    def test_live_failure_is_diagnosed_without_any_repair(self):
        store = JsonStore()
        with patch.object(monitor, "validate_main_run", return_value="https://github.com/dizigs/archelaos-site/actions/runs/123"), \
                patch.object(monitor, "load_policy", return_value=(Policy.from_foundation(foundation()), {}, "a" * 40)), \
                patch.object(monitor, "IncidentStore", return_value=store), patch.object(monitor, "DraftPublisher") as publisher:
            result = monitor.observe(None, "a" * 40, "123", "failure", "success")
        self.assertEqual(result["status"], "ISSUES_REMAIN_OPEN")
        self.assertEqual(result["results"][0]["phase"], "DIAGNOSED")
        self.assertEqual(result["results"][0]["attempts"], 0)
        publisher.assert_not_called()

    def test_conflicting_owner_blocks_known_fix_without_using_repair(self):
        store = JsonStore()
        with patch.object(monitor, "validate_main_run", return_value="https://github.com/dizigs/archelaos-site/actions/runs/123"), \
                patch.object(monitor, "load_policy", return_value=(Policy.from_foundation(foundation()), {}, "a" * 40)), \
                patch.object(monitor, "IncidentStore", return_value=store), \
                patch.object(monitor, "tree_file", return_value={"sha": "b" * 40, "content": fixture.FAULT}), \
                patch.object(monitor, "assert_no_other_pr_owner", side_effect=RuntimeError("PR already owns news.html")), \
                patch.object(monitor, "tested_patch") as repair:
            result = monitor.observe(None, "a" * 40, "123", "success", "failure")
        self.assertEqual(result["results"][0]["phase"], "DIAGNOSED")
        self.assertEqual(result["results"][0]["ownership"], "blocked_or_incomplete")
        repair.assert_not_called()

    def test_fork_event_is_rejected_before_mutation(self):
        class Client:
            def request(self, path):
                return {"repository": {"full_name": gh.REPO}, "head_repository": {"full_name": "foreign/repo"}}
        with self.assertRaises(ValueError): monitor.validate_main_run(Client(), "123", "a" * 40)


if __name__ == "__main__": unittest.main()
