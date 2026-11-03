"""Offline tests for GitHub -> issue #71 task handoff mirror."""
import importlib.util
from pathlib import Path
from unittest import TestCase, mock

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "tracker_handoff_event.py"
spec = importlib.util.spec_from_file_location("tracker_handoff_event", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def sample_pr(number=82, state="open", merged=False, draft=False):
    return {
        "action": "edited",
        "number": number,
        "pull_request": {
            "number": number, "state": state, "merged": merged, "draft": draft,
            "title": " Fix stories \n archive    note ",
            "html_url": f"https://github.com/dizigs/archelaos-site/pull/{number}",
            "updated_at": "2026-11-03T12:00:00Z",
            "head": {"sha": "abc123"},
        },
    }


class TrackerEventTests(TestCase):
    def test_public_pr_record(self):
        record = module.build_record("pull_request", sample_pr())
        self.assertEqual(record["task_id"], "PR-82")
        self.assertIn("[TRACKER-EVENT]", record["body"])
        self.assertIn("Fix stories archive note", record["body"])
        self.assertNotIn("completed task", record["body"].split("Reconciliation: ")[0])
        self.assertIn("pending", record["body"])

    def test_pr_states(self):
        self.assertIn("— merged", module.build_record(
            "pull_request", sample_pr(state="closed", merged=True))["body"])
        self.assertIn("— draft", module.build_record(
            "pull_request", sample_pr(draft=True))["body"])

    def test_issue_record_and_no_self_loop(self):
        event = {"action": "closed", "issue": {"number": 67, "state": "closed",
            "html_url": "https://github.com/dizigs/archelaos-site/issues/67",
            "title": "Fix warning", "updated_at": "2026-11-03T12:00:00Z"}}
        self.assertEqual(module.build_record("issues", event)["task_id"], "ISS-67")
        event["issue"]["number"] = 71
        self.assertIsNone(module.build_record("issues", event))

    def test_pr_misclassified_as_issue_is_ignored(self):
        event = {"issue": {"number": 82, "pull_request": {"url": "x"}}}
        self.assertIsNone(module.build_record("issues", event))

    def test_disallows_other_repo_urls(self):
        payload = sample_pr()
        payload["pull_request"]["html_url"] = "https://example.org/foo"
        with self.assertRaises(ValueError):
            module.build_record("pull_request", payload)

    def test_comment_creation_and_idempotent_update(self):
        record = module.build_record("pull_request", sample_pr())
        with mock.patch.object(module, "api_request", side_effect=[
            [], {"id": 123}]) as call:
            self.assertEqual(module.upsert_comment("token", record), "created")
            self.assertEqual(call.call_count, 2)
            self.assertEqual(call.call_args.kwargs["method"], "POST")
        with mock.patch.object(module, "api_request", return_value=[
            {"id": 123, "body": record["body"]}]) as call:
            self.assertEqual(module.upsert_comment("token", record), "unchanged")
            self.assertEqual(call.call_count, 1)
        with mock.patch.object(module, "api_request", side_effect=[
            [{"id": 123, "body": record["marker"]}], {"id": 123}]) as call:
            self.assertEqual(module.upsert_comment("token", record), "updated")
            self.assertEqual(call.call_args.kwargs["method"], "PATCH")

    def test_title_is_one_line(self):
        name = "hello\nsecret    spaced"
        self.assertEqual(module.compact_title(name), "hello secret spaced")
        self.assertEqual(len(module.compact_title("A"*1000)), 160)


if __name__ == "__main__":
    import unittest
    unittest.main()
