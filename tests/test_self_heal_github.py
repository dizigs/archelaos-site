"""Offline tests of the real API adapter, trusted journal and scoped Git publisher."""
import base64
import copy
import json
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import self_heal_github as gh
import self_heal_control_plane as core
from test_self_heal_control_plane import observation


class ApiBoundary(unittest.TestCase):
    def test_merge_delete_permissions_and_main_ref_mutations_are_not_exposed(self):
        client = gh.GitHub()
        for path, method, data in ((gh.API + "/merges", "POST", {}),
                (gh.API + "/git/refs/heads/main", "PATCH", {"sha": "a" * 40}),
                (gh.API + "/git/refs", "POST", {"ref": "refs/heads/main", "sha": "a" * 40}),
                (gh.API + "/actions/secrets", "GET", None),
                (gh.API + "/pulls", "POST", {"base": "main", "draft": False})):
            with self.subTest(path=path, method=method), patch.object(gh.subprocess, "run") as command, self.assertRaises(ValueError):
                client.request(path, method, data)
            command.assert_not_called()

    def test_permission_failure_retains_exact_endpoint_without_mutation_or_retry(self):
        response = SimpleNamespace(returncode=1, stdout="", stderr="gh: Resource not accessible by integration (HTTP 403)")
        client = gh.GitHub()
        with patch.object(gh.subprocess, "run", return_value=response) as command, self.assertRaises(gh.AccessFailure) as caught:
            client.request(gh.API + "/issues?state=all")
        self.assertEqual(command.call_count, 1)
        self.assertEqual(client.writes, 0)
        self.assertEqual(caught.exception.evidence["httpStatus"], 403)
        self.assertEqual(caught.exception.evidence["endpoint"], "https://api.github.com/" + gh.API + "/issues?state=all")

    def test_missing_branch_is_distinct_from_forbidden_lookup(self):
        client = gh.GitHub()
        with patch.object(gh.subprocess, "run", return_value=SimpleNamespace(returncode=1, stdout="", stderr="gh: Not Found (HTTP 404)")):
            self.assertIsNone(client.request(gh.API + "/git/ref/heads/missing", missing_ok=True))
        with patch.object(gh.subprocess, "run", return_value=SimpleNamespace(returncode=1, stdout="", stderr="gh: Forbidden (HTTP 403)")), self.assertRaises(gh.AccessFailure):
            client.request(gh.API + "/git/ref/heads/missing", missing_ok=True)

    def test_timeout_is_reported_as_unknown_outcome_and_not_repeated(self):
        client = gh.GitHub()
        with patch.object(gh.subprocess, "run", side_effect=subprocess.TimeoutExpired("synthetic", 30)) as command, self.assertRaises(gh.AccessFailure):
            client.request(gh.API + "/issues", "POST", {"title": "synthetic fixture", "body": "public fixture"})
        self.assertEqual(command.call_count, 1)
        self.assertEqual((client.write_attempts, client.writes), (1, 0))

    def test_pagination_budget_cannot_hide_a_possible_existing_issue(self):
        class FullPages(gh.GitHub):
            def request(self, *args, **kwargs): return [{"number": index} for index in range(100)]
        with self.assertRaises(RuntimeError): FullPages().pages(gh.API + "/issues?state=all", max_pages=2)


class JournalClient:
    def __init__(self): self.issues = []; self.comments = []; self.calls = []; self.owner = {"login": "dizigs", "id": 7}
    def pages(self, path, max_pages=5):
        self.calls.append(("GET", path))
        return copy.deepcopy(self.comments if "/comments" in path else self.issues)
    def request(self, path, method="GET", data=None, **kwargs):
        self.calls.append((method, path))
        if method == "GET" and path == gh.API: return {"full_name": gh.REPO, "owner": self.owner}
        if method == "POST" and path.endswith("/issues"):
            row = {"number": 110, **copy.deepcopy(data), "user": self.owner}; self.issues.append(row); return row
        if method == "POST" and path.endswith("/comments"):
            row = {"body": data["body"], "user": self.owner}; self.comments.append(row); return row
        raise AssertionError((path, method))


class Journal(unittest.TestCase):
    def test_state_survives_a_new_adapter_instance_and_untrusted_comments(self):
        client = JournalClient(); state = core.initial_state(observation())
        store = gh.IncidentStore(client)
        self.assertIsNone(store.load(state["fingerprint"]))
        store.create(state)
        fake = copy.deepcopy(client.comments[-1]); fake["user"] = {"login": "stranger", "id": 99}
        fake["body"] = fake["body"].replace('"attempts": 0', '"attempts": 999')
        client.comments.append(fake)
        reloaded = gh.IncidentStore(client).load(state["fingerprint"])
        self.assertEqual(reloaded, state)
        self.assertEqual(len(client.issues), 1)

    def test_closed_incident_is_still_found_in_all_state_lookup(self):
        client = JournalClient(); state = core.initial_state(observation())
        store = gh.IncidentStore(client); store.load(state["fingerprint"]); store.create(state)
        client.issues[0]["state"] = "closed"
        self.assertEqual(gh.IncidentStore(client).load(state["fingerprint"]), state)
        self.assertTrue(any("state=all" in path for method, path in client.calls))

    def test_duplicate_containers_fail_closed_before_any_new_comment(self):
        client = JournalClient(); state = core.initial_state(observation())
        store = gh.IncidentStore(client); store.load(state["fingerprint"]); store.create(state)
        client.issues.append(copy.deepcopy(client.issues[0])); before = len(client.comments)
        with self.assertRaises(RuntimeError): gh.IncidentStore(client).load(state["fingerprint"])
        self.assertEqual(len(client.comments), before)

    def test_existing_legacy_aggregate_is_reused_without_creating_second_alert(self):
        client = JournalClient()
        client.issues.append({"number": 111, "title": "Site QA: automated monitor alert", "body": "Existing technical alert", "user": client.owner})
        state = core.initial_state(observation())
        store = gh.IncidentStore(client, aggregate=True)
        self.assertIsNone(store.load(state["fingerprint"]))
        store.create(state)
        self.assertEqual(len(client.issues), 1)
        self.assertIn(("POST", gh.API + "/issues/111/comments"), client.calls)


class TreeAndRef(unittest.TestCase):
    def test_symlink_target_or_parent_is_never_read_as_an_ordinary_source(self):
        for rows in ([{"path": "news.html", "mode": "120000", "type": "blob", "sha": "b" * 40}],
                     [{"path": "self-heal-fixtures", "mode": "120000", "type": "blob", "sha": "b" * 40}]):
            class Client:
                def request(self, path): return {"truncated": False, "tree": rows}
            target = "news.html" if rows[0]["path"] == "news.html" else "self-heal-fixtures/news-head.html"
            with self.subTest(target=target), self.assertRaises(ValueError): gh.tree_file(Client(), "a" * 40, target)

    def test_truncated_tree_cannot_be_treated_as_an_absent_file(self):
        class Client:
            def request(self, path): return {"truncated": True, "tree": []}
        with self.assertRaises(ValueError): gh.tree_file(Client(), "a" * 40, "news.html", optional=True)

    def test_staging_seed_cannot_target_the_real_news_or_main_branch(self):
        client = gh.GitHub()
        for branch, path in (("main", "self-heal-fixtures/news-head.html"), ("codex/self-heal-staging-unit", "news.html")):
            with self.subTest(branch=branch, path=path), self.assertRaises(ValueError):
                gh.create_changed_ref(client, "a" * 40, path, "fixture", branch, "synthetic fixture")
        self.assertEqual(client.requests, 0)

    def test_active_pr_file_ownership_stops_publication(self):
        class Client:
            def pages(self, path):
                if "/files" in path: return [{"filename": "news.html"}]
                return [{"number": 90, "head": {"ref": "other-owner"}}]
        with self.assertRaises(RuntimeError): gh.assert_no_other_pr_owner(Client(), "news.html")


if __name__ == "__main__": unittest.main()
