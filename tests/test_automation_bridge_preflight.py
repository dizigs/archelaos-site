"""Synthetic metadata/permission probes: never access actual Google/Worker data."""
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from automation_bridge_preflight import REQUIRED_SECRETS, WORKER, inspect_bridge
from cloudflare_pages_status import ProviderFailure

ACCOUNT = "a" * 32


def settings():
    return {"bindings": [{"name": name, "type": "secret_text", "text": "NEVER_DISCLOSE_SECRET"}
                          for name in REQUIRED_SECRETS]
            + [{"name": "AUTH_KV", "type": "kv_namespace", "namespace_id": "b" * 32}],
            "unrelatedGoogleEmail": "private@example.invalid"}


class BridgePreflightTests(unittest.TestCase):
    def request(self, worker=None, control=None):
        calls = []

        def run(path):
            calls.append(path)
            value = control if "/pages/" in path else worker
            if isinstance(value, Exception):
                raise value
            return value if value is not None else ([] if "/pages/" in path else settings())

        return run, calls

    def inspect(self, request, **kwargs):
        return inspect_bridge(request, account=ACCOUNT, project="archelaos-site", token_present=True, **kwargs)

    def test_metadata_success_is_not_claimed_as_full_integration(self):
        request, calls = self.request()
        report = self.inspect(request)
        self.assertEqual(report["status"], "METADATA_OBSERVED")
        self.assertFalse(report["fullIntegrationVerified"])
        self.assertFalse(report["productionMutationPerformed"])
        self.assertFalse(report["sourceCodeInspected"])
        self.assertEqual(len(calls), 2)
        self.assertTrue(all(path.startswith("/accounts/" + ACCOUNT) for path in calls))
        self.assertIn("/workers/scripts/" + WORKER + "/settings", calls[1])

    def test_secrets_email_namespace_and_unrelated_data_are_not_disclosed(self):
        request, _ = self.request()
        payload = json.dumps(self.inspect(request))
        for private in ("NEVER_DISCLOSE_SECRET", "private@example.invalid", "b" * 32):
            self.assertNotIn(private, payload)

    def test_missing_token_performs_no_requests(self):
        request, calls = self.request()
        report = inspect_bridge(request, account=ACCOUNT, token_present=False)
        self.assertEqual(report["reason"], "missing_runtime_cloudflare_credential")
        self.assertEqual(calls, [])

    def test_invalid_account_and_project_perform_no_requests(self):
        for account, project in [("../bad", "archelaos-site"), (ACCOUNT, "../bad")]:
            request, calls = self.request()
            report = inspect_bridge(request, account=account, project=project, token_present=True)
            self.assertEqual(report["reason"], "invalid_provider_identifiers")
            self.assertEqual(calls, [])

    def test_working_pages_control_isolates_worker_permission_denial(self):
        failure = ProviderFailure("/ignored", 403, (10000,), "provider_http")
        request, calls = self.request(worker=failure)
        report = self.inspect(request)
        self.assertEqual(report["reason"], "worker_permission_or_resource_scope_denied")
        access = report["probes"]["workerSettings"]
        self.assertEqual(access["httpStatus"], 403)
        self.assertEqual(access["errorCodes"], ["10000"])
        self.assertEqual(access["responseLayer"], "provider_http")
        self.assertTrue(access["endpoint"].endswith(WORKER + "/settings"))
        self.assertEqual(len(calls), 2)

    def test_connect_denial_is_network_and_other_same_host_request_is_skipped(self):
        failure = ProviderFailure("/ignored", 403, (), "transport_connect")
        request, calls = self.request(control=failure)
        report = self.inspect(request)
        self.assertEqual(report["reason"], "network_transport_denied")
        self.assertEqual(report["probes"]["workerSettings"]["status"], "NOT_ATTEMPTED")
        self.assertEqual(len(calls), 1)

    def test_two_origin_denials_do_not_fabricate_a_valid_credential(self):
        failure = ProviderFailure("/ignored", 403, (10000,), "provider_http")
        request, _ = self.request(worker=failure, control=failure)
        self.assertEqual(self.inspect(request)["reason"], "worker_access_not_verified")

    def test_proxy_http_denial_skips_other_same_host_probe(self):
        request, calls = self.request(control=ProviderFailure("/ignored", 403, (), "proxy_http"))
        self.assertEqual(self.inspect(request)["reason"], "network_transport_denied")
        self.assertEqual(len(calls), 1)

    def test_worker_proxy_denial_is_not_misclassified_as_permissions(self):
        request, _ = self.request(worker=ProviderFailure("/ignored", 403, (), "proxy_http"))
        self.assertEqual(self.inspect(request)["reason"], "network_transport_denied")

    def test_unknown_forbidden_origin_is_not_asserted_as_a_permission_failure(self):
        request, _ = self.request(worker=ProviderFailure("/ignored", 403, (), "UNKNOWN"))
        self.assertEqual(self.inspect(request)["reason"], "worker_access_not_verified")

    def test_missing_required_binding_stays_incomplete(self):
        value = settings()
        value["bindings"] = value["bindings"][:-1]
        request, _ = self.request(worker=value)
        report = self.inspect(request)
        self.assertEqual(report["status"], "INCOMPLETE_CONFIGURATION")
        self.assertFalse(report["configuration"]["authKvBindingConfigured"])

    def test_public_client_id_can_be_plaintext_without_exposing_its_value(self):
        value = settings()
        value["bindings"][0]["type"] = "plain_text"
        request, _ = self.request(worker=value)
        report = self.inspect(request)
        self.assertEqual(report["status"], "METADATA_OBSERVED")
        self.assertNotIn("NEVER_DISCLOSE_SECRET", json.dumps(report))

    def test_sensitive_plaintext_binding_is_not_treated_as_protected(self):
        value = settings()
        value["bindings"][1]["type"] = "plain_text"
        request, _ = self.request(worker=value)
        report = self.inspect(request)
        self.assertEqual(report["status"], "INCOMPLETE_CONFIGURATION")
        self.assertFalse(report["configuration"]["sensitiveBindingsStoredAsSecrets"]["GOOGLE_CLIENT_SECRET"])

    def test_durable_binding_is_not_evidence_of_atomic_action_execution(self):
        value = settings()
        value["bindings"].append({"name": "GATE", "type": "durable_object_namespace"})
        request, _ = self.request(worker=value)
        config = self.inspect(request)["configuration"]
        self.assertTrue(config["atomicStorageBindingObserved"])
        self.assertFalse(config["atomicActionExecutionVerified"])

    def test_malformed_settings_fail_without_logging_their_contents(self):
        request, _ = self.request(worker={"bindings": "NEVER_DISCLOSE_SECRET"})
        report = self.inspect(request)
        self.assertEqual(report["status"], "BLOCKED")
        self.assertNotIn("NEVER_DISCLOSE_SECRET", json.dumps(report))

    def test_unsafe_error_fields_are_not_forwarded(self):
        failure = ProviderFailure("/NEVER_DISCLOSE_SECRET", 403, ("NEVER_DISCLOSE_SECRET", 10000), "private@example.invalid")
        request, _ = self.request(worker=failure)
        payload = json.dumps(self.inspect(request))
        self.assertNotIn("NEVER_DISCLOSE_SECRET", payload)
        self.assertNotIn("private@example.invalid", payload)


if __name__ == "__main__":
    unittest.main()
