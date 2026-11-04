"""Offline provider evidence must distinguish missing permission from readiness."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("brain_provider", Path(__file__).resolve().parents[1] / "tools/cloudflare_staging.py")
provider = importlib.util.module_from_spec(spec)
spec.loader.exec_module(provider)


class Inventory(unittest.TestCase):
    def test_403_metadata_is_blocked_not_deployed_or_retried(self):
        class Client:
            calls = []
            def get(self, suffix):
                self.calls.append(suffix)
                return {"endpoint": "https://api.cloudflare.com/fixture/" + suffix,
                        "httpStatus": 403, "success": False, "retryPerformed": False}
        client = Client()
        result = provider.inventory(client)
        self.assertEqual(result["status"], "BLOCKED")
        self.assertEqual(len(client.calls), len(set(client.calls)))
        self.assertFalse(result["resourceMutationPerformed"])
        self.assertFalse(result["deploymentVerified"])

    def test_confirmed_free_plan_and_reads_still_do_not_prove_deployment(self):
        class Client:
            def get(self, suffix):
                result = []
                if suffix == "subscriptions": result = [{"rate_plan": {"public_name": "Workers Free"}}]
                return {"endpoint": "https://api.cloudflare.com/fixture/" + suffix,
                        "httpStatus": 200, "success": True, "result": result}
        result = provider.inventory(Client())
        self.assertEqual(result["billingPlan"], "WORKERS_FREE_CONFIRMED")
        self.assertFalse(result["deploymentVerified"])


class StagingReadiness(unittest.TestCase):
    def client(self, failed=None):
        class Client:
            account = "a" * 32
            def __init__(self): self.calls = []
            def get(self, suffix):
                self.calls.append(suffix)
                if failed: return {"httpStatus": 403, "success": False, "errorClass": failed}
                if suffix.endswith('/settings'): return {"httpStatus": 404, "success": False, "errorClass": "provider_http"}
                value = [] if suffix.endswith('namespaces') else {"subdomain": "synthetic", "private": "DO_NOT_LOG"}
                return {"httpStatus": 200, "success": True, "result": value}
        return Client()
    def test_new_read_token_inventory_does_not_claim_write_billing_or_deployment(self):
        import json
        client = self.client()
        result = provider.staging_readiness(client)
        self.assertEqual(result['status'], 'READ_ACCESS_VERIFIED')
        self.assertFalse(result['readyForDeployment'])
        self.assertFalse(result['deploymentVerified'])
        self.assertFalse(result['resourceMutationPerformed'])
        self.assertFalse(result['evidence'][-1]['existingStagingScript'])
        self.assertNotIn('DO_NOT_LOG', json.dumps(result))
        self.assertFalse(any('subscriptions' in p or 'automation-bridge' in p for p in client.calls))
    def test_provider_403_is_unknown_staging_presence_and_no_retries(self):
        client = self.client('provider_http')
        result = provider.staging_readiness(client)
        self.assertEqual(result['status'], 'BLOCKED')
        self.assertIsNone(result['evidence'][-1]['existingStagingScript'])
        self.assertEqual(len(client.calls), len(set(client.calls)))
    def test_same_host_network_denial_skips_following_reads(self):
        client = self.client('proxy_http')
        result = provider.staging_readiness(client)
        self.assertEqual(result['status'], 'BLOCKED')
        self.assertEqual(len(client.calls), 1)


if __name__ == "__main__": unittest.main()
