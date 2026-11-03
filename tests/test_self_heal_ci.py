"""CI dispatch reservations prevent duplicate runs and never claim check success."""
import copy
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import self_heal_ci as ci
import self_heal_github as gh
from test_self_heal_control_plane import JsonStore, observation
from self_heal_control_plane import initial_state, repair_branch
from self_heal_fixture import BASELINE
from hashlib import sha256


class Client:
    def __init__(self, proposal, fail=False, existing=False):
        self.proposal = proposal; self.fail = fail; self.existing = existing; self.posts = []
    def request(self, path, method="GET", data=None):
        if method == "POST":
            self.posts.append(path)
            if self.fail: raise gh.AccessFailure(method, path, 403, "Resource not accessible by integration")
            return None
        if "/pulls/" in path:
            return {"state": "open", "draft": True,
                    "head": {"sha": self.proposal["commit"], "ref": self.proposal["branch"]}}
        if "/actions/runs?" in path:
            return {"total_count": 4 if self.existing else 0, "workflow_runs": [
                {"path": ".github/workflows/" + name, "event": "workflow_dispatch",
                 "head_sha": self.proposal["commit"], "head_branch": self.proposal["branch"]}
                for name in gh.CI_WORKFLOWS] if self.existing else []}
        raise AssertionError(path)


class Dispatch(unittest.TestCase):
    def setUp(self):
        item = observation(); self.key = item.fingerprint
        state = initial_state(item)
        self.proposal = {"number": 107, "url": "https://github.com/dizigs/archelaos-site/pull/107",
                         "branch": repair_branch(self.key, item.source_signature), "draft": True, "commit": "c" * 40}
        state.update(phase="DRAFT_PR_PROPOSED", attempts=1, attemptSignatures=[item.source_signature],
                     pr=self.proposal, path="self-heal-fixtures/news-head.html",
                     afterSha256=sha256(BASELINE.encode()).hexdigest())
        self.store = JsonStore(); self.store.create(state)

    def run_dispatch(self, client):
        with patch.object(ci, "branch_head", return_value=self.proposal["commit"]), \
                patch.object(ci, "tree_file", return_value={"content": BASELINE}):
            return ci.dispatch_checks(client, self.store, self.key)

    def test_four_existing_workflows_dispatch_once_and_replay_has_zero_writes(self):
        client = Client(self.proposal)
        first = self.run_dispatch(client); saved = self.store.writes
        second = self.run_dispatch(client)
        self.assertEqual(len(client.posts), 4)
        self.assertEqual(len(first["dispatched"]), 4)
        self.assertEqual(second["dispatched"], [])
        self.assertEqual(self.store.writes, saved)
        self.assertFalse(first["checksPassed"])

    def test_permission_failure_stops_all_dispatches_and_no_retries_on_replay(self):
        client = Client(self.proposal, fail=True)
        first = self.run_dispatch(client); second = self.run_dispatch(client)
        self.assertEqual(len(client.posts), 1)
        self.assertEqual(first["failure"]["httpStatus"], 403)
        self.assertEqual(second["reason"], "reconcile_interrupted_or_blocked_dispatch")

    def test_actual_matching_run_is_adopted_without_duplicate_dispatch(self):
        client = Client(self.proposal, existing=True)
        result = self.run_dispatch(client)
        self.assertEqual(client.posts, [])
        self.assertEqual(set(result["journal"].values()), {"EXISTING_RUN"})

    def test_dispatch_api_cannot_target_main_or_an_unapproved_workflow(self):
        client = gh.GitHub()
        for name, ref in (("rebuild-check.yml", "main"), ("cloudflare-pages-status.yml", self.proposal["branch"])):
            with self.subTest(workflow=name), self.assertRaises(ValueError):
                client.request(gh.API + "/actions/workflows/" + name + "/dispatches", "POST", {"ref": ref})
        self.assertEqual(client.requests, 0)


if __name__ == "__main__": unittest.main()
