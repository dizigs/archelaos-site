"""Offline provider fault injection: evidence is not a deployment operation."""
import copy
import importlib.util
import json
import io
import os
from pathlib import Path
import sys
import shutil
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from contextlib import ExitStack
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from urllib.request import Request

SOURCE = Path(__file__).resolve().parents[1] / "tools/cloudflare_deployment_evidence.py"
spec = importlib.util.spec_from_file_location("deployment_evidence", SOURCE)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
sys.path.insert(0, str(SOURCE.parent))
status_spec = importlib.util.spec_from_file_location("cloudflare_status_subject", SOURCE.with_name("cloudflare_pages_status.py"))
status = importlib.util.module_from_spec(status_spec)
status_spec.loader.exec_module(status)
COMMIT = "a" * 40
ACCOUNT = "b" * 32
IDENTIFIER = "12345678-1234-1234-1234-123456789abc"


def deployment():
    return {"id": IDENTIFIER, "environment": "production", "created_on": "2026-11-03T10:00:00Z",
            "deployment_trigger": {"metadata": {"commit_hash": COMMIT, "branch": "main"}},
            "stages": [{"name": name, "status": "success"} for name in sorted(m.STAGES)]}


class DeploymentEvidence(unittest.TestCase):
    def setUp(self):
        self.detail = deployment()
        self.logs = {"data": [{"line": "Assets published!", "ts": "2026-11-03T10:01:00Z"},
                              {"line": "Success: Your site was deployed!", "ts": 1793700061000}]}
        self.calls = []
        self.http_calls = 0
        self.health = {"healthy": True, "status": 200, "url": "https://www.archelaos.club/",
                       "bytes": 4096, "htmlSha256": "c" * 64}

    def api(self, path):
        self.calls.append(path)
        return copy.deepcopy(self.logs if path.endswith("/history/logs") else self.detail)

    def http(self):
        self.http_calls += 1
        return self.health

    def verify(self, items=None):
        return m.verify_deployment([deployment()] if items is None else items, self.api,
                                   ACCOUNT, "archelaos-site", COMMIT, self.http)

    def test_exact_commit_real_terminal_logs_and_http_are_all_required(self):
        result = self.verify()
        self.assertEqual(result["status"], "VERIFIED")
        self.assertEqual(result["deploymentId"], IDENTIFIER)
        self.assertEqual(result["observedCommit"], COMMIT)
        self.assertFalse(result["productionMutationPerformed"])
        self.assertEqual(self.calls, [f"/accounts/{ACCOUNT}/pages/projects/archelaos-site/deployments/{IDENTIFIER}",
                                      f"/accounts/{ACCOUNT}/pages/projects/archelaos-site/deployments/{IDENTIFIER}/history/logs"])
        self.assertEqual(self.http_calls, 1)

    def test_preview_success_cannot_verify_production(self):
        item = deployment(); item["environment"] = "preview"
        self.assertEqual(self.verify([item])["status"], "NOT_VERIFIED")
        self.assertEqual(self.calls, [])

    def test_preview_newer_than_matching_production_does_not_replace_it(self):
        preview = deployment(); preview.update(environment="preview", created_on="2026-11-03T11:00:00Z")
        self.assertEqual(self.verify([preview, deployment()])["status"], "VERIFIED")

    def test_newer_wrong_commit_cannot_fall_back_to_old_success(self):
        latest = deployment(); latest["created_on"] = "2026-11-03T11:00:00Z"
        latest["deployment_trigger"]["metadata"]["commit_hash"] = "d" * 40
        self.assertEqual(self.verify([deployment(), latest])["reason"], "latest_production_commit_mismatch")
        self.assertEqual(self.calls, [])

    def test_deployment_detail_cannot_change_commit_or_environment(self):
        for field in ("commit", "environment", "branch"):
            with self.subTest(field=field):
                self.detail = deployment()
                if field == "commit": self.detail["deployment_trigger"]["metadata"]["commit_hash"] = "e" * 40
                elif field == "branch": self.detail["deployment_trigger"]["metadata"]["branch"] = "unreviewed"
                else: self.detail["environment"] = "preview"
                self.assertEqual(self.verify()["reason"], "deployment_detail_mismatch")
        self.assertEqual(self.http_calls, 0)

    def test_failed_or_missing_stage_is_not_success(self):
        for mode in ("failure", "missing", "duplicate"):
            with self.subTest(mode=mode):
                self.detail = deployment()
                if mode == "failure": self.detail["stages"][0]["status"] = "failure"
                elif mode == "missing": self.detail["stages"].pop()
                else: self.detail["stages"][-1] = self.detail["stages"][0]
                self.assertEqual(self.verify()["status"], "NOT_VERIFIED")
        self.assertTrue(all(not path.endswith("/history/logs") for path in self.calls))

    def test_metadata_and_assets_published_do_not_substitute_for_terminal_log(self):
        self.logs["data"] = self.logs["data"][:1]
        self.assertEqual(self.verify()["reason"], "terminal_provider_log_missing")
        self.assertEqual(self.http_calls, 0)

    def test_failure_after_success_message_blocks_verification(self):
        self.logs["data"].append({"line": "Error: final deployment failed"})
        with self.assertRaises(ValueError): self.verify()
        self.assertEqual(self.http_calls, 0)

    def test_arbitrary_log_lines_and_secret_like_text_are_never_published(self):
        self.logs["data"].insert(0, {"line": "Authorization: Bearer synthetic-secret-fixture"})
        result = self.verify()
        encoded = json.dumps(result)
        self.assertNotIn("synthetic-secret-fixture", encoded)
        self.assertNotIn("Authorization", encoded)
        self.assertIn("Your site was deployed!", encoded)
        self.assertEqual(len(result["buildLogs"]["normalizedLogSha256"]), 64)

    def test_invalid_log_schema_and_missing_data_fail_closed(self):
        for bad in ({}, {"data": []}, {"data": [{"line": None}]}):
            with self.subTest(logs=bad), self.assertRaises(ValueError): m.log_evidence(bad)

    def test_error_message_containing_success_words_is_not_terminal_proof(self):
        self.logs = {"data": [{"line": "Error: Your site was deployed!"}]}
        self.assertEqual(self.verify()["reason"], "terminal_provider_log_missing")

    def test_public_http_failure_or_untrusted_url_blocks_verification(self):
        healthy = copy.deepcopy(self.health)
        for update in ({"healthy": False}, {"status": 503}, {"url": "https://example.org/"},
                       {"htmlSha256": None}, {"bytes": 0}):
            with self.subTest(update=update):
                self.health = {**healthy, **update}
                self.assertEqual(self.verify()["reason"], "post_deployment_http_failed")

    def test_api_failure_is_not_retried(self):
        def unavailable(path):
            self.calls.append(path)
            raise OSError("Synthetic provider unavailable")
        with self.assertRaises(OSError):
            m.verify_deployment([deployment()], unavailable, ACCOUNT, "archelaos-site", COMMIT, self.http)
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.http_calls, 0)

    def test_unsafe_identifiers_and_short_sha_cause_no_requests(self):
        for account, project, sha in (("../other", "archelaos-site", COMMIT),
                                      (ACCOUNT, "../other", COMMIT), (ACCOUNT, "archelaos-site", "abc")):
            with self.subTest(account=account, project=project, sha=sha), self.assertRaises(ValueError):
                m.verify_deployment([deployment()], self.api, account, project, sha, self.http)
        self.assertEqual(self.calls, [])

    def test_bad_provider_id_and_timestamp_cause_no_requests(self):
        for update in ({"id": "../../other"}, {"created_on": "not-a-date"}):
            item = deployment(); item.update(update)
            with self.subTest(update=update), self.assertRaises(ValueError): self.verify([item])
        self.assertEqual(self.calls, [])

    def test_public_redirects_are_limited_to_the_known_canonical_hosts(self):
        for url in ("https://evil.example/", "http://archelaos.club/", "https://user@archelaos.club/",
                    "https://www.archelaos.club/?token=fixture", "https://archelaos.club:bad/",
                    "https://archelaos.club:443/", "https://archelaos.club/private"):
            with self.subTest(url=url): self.assertFalse(m.official_url(url))
        self.assertTrue(m.official_url("https://www.archelaos.club/"))

    def test_legacy_metadata_fields_remain_available_and_signed_urls_are_omitted(self):
        item = deployment(); item.update(url="https://abcd.archelaos-site.pages.dev/", latest_stage={"name": "deploy", "status": "success"})
        result = m.deployment_metadata(item, "archelaos-site")
        self.assertEqual(set(result), {"id", "created_on", "environment", "latest_stage", "status", "url", "commit_hash"})
        self.assertEqual(result["url"], item["url"])
        item["latest_stage"]["status"] = "active"
        self.assertEqual(m.deployment_metadata(item, "archelaos-site")["status"], "active")
        item["url"] += "?token=synthetic-private-query"
        self.assertIsNone(m.deployment_metadata(item, "archelaos-site")["url"])
        self.assertNotIn("synthetic-private-query", json.dumps(m.deployment_metadata(item, "archelaos-site")))


class CollectorBoundary(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack(); self.addCleanup(self.stack.close)
        self.saved = []
        self.stack.enter_context(patch.object(status, "TOKEN", "unused-offline-fixture"))
        self.stack.enter_context(patch.object(status, "ACCOUNT", ACCOUNT))
        self.stack.enter_context(patch.object(status, "PROJECT", "archelaos-site"))
        self.stack.enter_context(patch.object(status, "write_report", side_effect=lambda report: self.saved.append(copy.deepcopy(report))))
        self.main_ref = self.stack.enter_context(patch.object(status, "current_main", return_value=COMMIT))
        self.api_calls = self.stack.enter_context(patch.object(status, "api", side_effect=self.api))
        real_verify = status.verify_deployment
        healthy = {"healthy": True, "status": 200, "url": "https://archelaos.club/",
                   "bytes": 100, "htmlSha256": "c" * 64}
        self.stack.enter_context(patch.object(status, "verify_deployment",
            side_effect=lambda *args: real_verify(*args, http_check=lambda: healthy)))
        self.stack.enter_context(patch("builtins.print"))

    def api(self, path):
        if path.endswith("?per_page=10"): return [deployment()]
        if path.endswith("/history/logs"): return {"data": [{"line": "Success: Your site was deployed!"}]}
        return deployment()

    def test_collector_requires_complete_evidence_and_writes_sanitized_report(self):
        self.assertEqual(status.main(), 0)
        self.assertEqual(self.saved[0]["verification"]["status"], "VERIFIED")
        self.assertEqual(self.main_ref.call_count, 2)
        self.assertEqual(self.api_calls.call_count, 3)

    def test_main_advance_invalidates_previously_valid_evidence(self):
        self.main_ref.side_effect = [COMMIT, "d" * 40]
        self.assertEqual(status.main(), 1)
        self.assertEqual(self.saved[0]["verification"]["reason"], "main_advanced_during_verification")

    def test_missing_runtime_credential_causes_no_api_requests(self):
        with patch.object(status, "TOKEN", ""):
            self.assertEqual(status.main(), 1)
        self.main_ref.assert_not_called(); self.api_calls.assert_not_called()
        self.assertEqual(self.saved[0]["verification"]["reason"], "missing_runtime_credential")

    def test_provider_permission_failure_retains_exact_endpoint_without_retry(self):
        path = f"/accounts/{ACCOUNT}/pages/projects/archelaos-site/deployments?per_page=10"
        self.api_calls.side_effect = status.ProviderFailure(path, 403, [10000], "provider_http")
        self.assertEqual(status.main(), 1)
        self.assertEqual(self.api_calls.call_count, 1)
        access = self.saved[0]["verification"]["access"]
        self.assertEqual(access["endpoint"], "GET https://api.cloudflare.com/client/v4" + path)
        self.assertEqual(access["httpStatus"], 403)

    def test_github_permissions_failure_is_distinct_from_cloudflare_access(self):
        self.main_ref.side_effect = status.GitHubAccessFailure("GET https://api.github.com/" + status.MAIN_ENDPOINT + ": Resource not accessible by integration HTTP 403")
        self.assertEqual(status.main(), 1)
        self.api_calls.assert_not_called()
        evidence = self.saved[0]["verification"]
        self.assertEqual(evidence["reason"], "github_evidence_unavailable")
        self.assertIn("Resource not accessible by integration", evidence["githubAccess"])

    def test_unexpected_runtime_error_cannot_dump_arbitrary_secret_like_text(self):
        self.api_calls.side_effect = RuntimeError("synthetic-private-error-body")
        self.assertEqual(status.main(), 1)
        self.assertNotIn("synthetic-private-error-body", json.dumps(self.saved))


class ProviderTransport(unittest.TestCase):
    def test_public_http_403_retains_site_endpoint_and_does_not_become_api_permissions(self):
        failure = HTTPError(m.SITE, 403, "Forbidden", {"Server": "cloudflare"}, io.BytesIO(b"synthetic-private-body"))
        with patch.object(m, "build_opener") as opener:
            opener.return_value.open.side_effect = failure
            result = m.public_http_health()
        self.assertFalse(result["healthy"])
        self.assertEqual(result["endpoint"], "GET " + m.SITE)
        self.assertEqual(result["status"], 403)
        self.assertEqual(result["responseLayer"], "site_http")
        self.assertNotIn("synthetic-private-body", json.dumps(result))

    def test_github_error_preserves_endpoint_and_known_permissions_message(self):
        response = SimpleNamespace(returncode=1, stdout="", stderr="gh: Resource not accessible by integration (HTTP 403)")
        with patch.object(status.subprocess, "run", return_value=response) as run, self.assertRaises(status.GitHubAccessFailure) as caught:
            status.current_main()
        self.assertEqual(run.call_count, 1)
        self.assertIn(status.MAIN_ENDPOINT, str(caught.exception))
        self.assertIn("Resource not accessible by integration HTTP 403", str(caught.exception))

    def test_http_error_codes_and_layer_are_recorded_without_response_message(self):
        body = io.BytesIO(b'{"errors":[{"code":10000,"message":"synthetic-private-message"}]}')
        failure = HTTPError(status.API + "/accounts/test", 403, "Forbidden", {"Server": "cloudflare"}, body)
        with patch.object(status, "provider_open", side_effect=failure), self.assertRaises(status.ProviderFailure) as caught:
            status.api("/accounts/test")
        self.assertEqual(caught.exception.evidence["responseLayer"], "provider_http")
        self.assertEqual(caught.exception.evidence["errorCodes"], ["10000"])
        self.assertNotIn("synthetic-private-message", str(caught.exception))

    def test_connect_proxy_failure_is_not_reported_as_provider_permissions(self):
        with patch.object(status, "provider_open", side_effect=URLError("Tunnel connection failed: 403 Forbidden")), self.assertRaises(status.ProviderFailure) as caught:
            status.api("/accounts/test")
        self.assertEqual(caught.exception.evidence["responseLayer"], "transport_connect")
        self.assertEqual(caught.exception.evidence["httpStatus"], 403)

    def test_authenticated_provider_redirect_is_never_followed(self):
        req = Request(status.API + "/accounts/test", headers={"Authorization": "Bearer unused-fixture"})
        with self.assertRaises(status.ProviderFailure) as caught:
            status.NoProviderRedirects().redirect_request(req, None, 302, "Found", {}, "https://example.org/")
        self.assertEqual(caught.exception.evidence["responseLayer"], "redirect_refused")


class FixedReportOutput(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(); self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name); self.repo = self.base / "repo"
        tools = self.repo / "tools"; tools.mkdir(parents=True)
        for filename in ("cloudflare_pages_status.py", "cloudflare_deployment_evidence.py"):
            shutil.copyfile(SOURCE.with_name(filename), tools / filename)
        shared = self.repo / "rebuild/tools"; shared.mkdir(parents=True)
        shutil.copyfile(SOURCE.parents[1] / "rebuild/tools/public_snapshot.py", shared / "public_snapshot.py")
        self.script = tools / "cloudflare_pages_status.py"

    def run_cli(self):
        return subprocess.run([sys.executable, str(self.script)], cwd=self.base, text=True,
                              capture_output=True, timeout=5,
                              env={**os.environ, "CLOUDFLARE_API_TOKEN": "", "GH_TOKEN": ""})

    def test_missing_credential_reports_incomplete_at_fixed_checkout_slot(self):
        result = self.run_cli()
        self.assertEqual(result.returncode, 1, result.stderr)
        report = json.loads((self.repo / "cloudflare-pages-status.json").read_text())
        self.assertEqual(report["verification"]["reason"], "missing_runtime_credential")
        self.assertEqual(report["verification"]["status"], "NOT_VERIFIED")
        self.assertFalse((self.base / "cloudflare-pages-status.json").exists())

    def test_report_symlink_cannot_overwrite_outside_fixture(self):
        sentinel = self.base / "outside.json"; sentinel.write_text("synthetic public sentinel")
        (self.repo / "cloudflare-pages-status.json").symlink_to(sentinel)
        self.assertNotEqual(self.run_cli().returncode, 0)
        self.assertEqual(sentinel.read_text(), "synthetic public sentinel")


if __name__ == "__main__":
    unittest.main()
