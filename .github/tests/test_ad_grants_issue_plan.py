"""Offline publication safety and complete-inventory dedup regression checks."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("ads_issue_plan", Path(__file__).resolve().parents[1] / "scripts/ad_grants_issue_plan.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def report():
    return {"schema_version":1, "mode":"dry-run", "source_kind":"synthetic-fixture",
            "policy_status":"current-policy-review-required", "findings":[{"code":"URL_BROKEN", "count":1}]}


def issue(number=1, state="open", author="github-actions[bot]"):
    return {"number":number, "state":state, "user":{"login":author},
            "body":"<!-- archelaos-ad-grants:v1:URL_BROKEN -->"}


class IssueSafety(unittest.TestCase):
    def test_synthetic_plan_is_never_publishable(self):
        result = mod.plan(report(), [])
        self.assertFalse(result["can_publish"])
        self.assertEqual(result["actions"][0]["action"], "would_create")
        self.assertIn("synthetic-fixture", result["actions"][0]["body"])

    def test_live_source_still_cannot_publish(self):
        data = report()
        data["source_kind"] = "google-ads-readonly"
        self.assertFalse(mod.plan(data, [])["can_publish"])

    def test_open_issue_is_idempotent(self):
        expected = [{"code":"URL_BROKEN", "action":"already_open", "number":1}]
        self.assertEqual(mod.plan(report(), [issue()])["actions"], expected)
        self.assertEqual(mod.plan(report(), [issue(), issue(2)])["actions"], expected)

    def test_closed_issue_reopens_instead_of_duplicate(self):
        self.assertEqual(mod.plan(report(), [issue(state="closed")])["actions"][0]["action"], "would_reopen")

    def test_malformed_issue_metadata_cannot_copy_raw_values_into_public_plan(self):
        for item in (issue(number="synthetic-private-value"), issue(number=True), issue(number=0), issue(state="unknown")):
            with self.subTest(item=item), self.assertRaises(ValueError):
                mod.plan(report(), [item])

    def test_foreign_markers_and_pull_requests_do_not_spoof_owned_issue(self):
        existing = [issue(author="untrusted-fixture"), {**issue(), "pull_request":{"url":"unused"}}]
        self.assertEqual(mod.plan(report(), existing)["actions"][0]["action"], "would_create")

    def test_no_raw_values_or_unrecognized_findings_enter_public_payload(self):
        data = report()
        data["raw"] = "must-never-appear"
        self.assertNotIn("must-never-appear", str(mod.plan(data, [])))
        for findings in ([{"code":"SECRET-PAYLOAD", "count":1}],
                         [{"code":"URL_BROKEN", "count":True}],
                         [{"code":"URL_BROKEN", "count":1, "url":"private"}],
                         [{"code":"URL_BROKEN", "count":1}] * 2):
            with self.subTest(findings=findings), self.assertRaises(ValueError):
                mod.plan({**data, "findings":findings}, [])

    def test_complete_pagination_uses_all_states(self):
        pages = []
        def fetch(**kwargs):
            pages.append(kwargs)
            return [issue()] * 100 if kwargs["page"] == 1 else [issue(101)]
        self.assertEqual(len(mod.inventory(fetch)), 101)
        self.assertEqual(pages, [{"state":"all", "page":1, "per_page":100}, {"state":"all", "page":2, "per_page":100}])

    def test_inventory_failure_or_truncation_cannot_create_partial_plan(self):
        with self.assertRaises(ValueError):
            mod.inventory(lambda **kwargs: [issue()] * 100)
        def unavailable(**kwargs):
            raise RuntimeError("synthetic unavailable API")
        with self.assertRaises(RuntimeError):
            mod.inventory(unavailable)

    def test_synthetic_pipeline_second_run_creates_no_duplicates(self):
        data = mod.read_json(mod.ROOT / "rebuild/ads/fixtures/audit-report.json")
        first = mod.plan(data, [])
        self.assertEqual(len(first["actions"]), 6)
        existing = [{"number":i + 1, "state":"open", "body":action["body"],
                     "user":{"login":"github-actions[bot]"}} for i, action in enumerate(first["actions"])]
        second = mod.plan(data, existing)
        self.assertTrue(all(action["action"] == "already_open" for action in second["actions"]))
        self.assertFalse(second["can_publish"])


if __name__ == "__main__":
    unittest.main()
