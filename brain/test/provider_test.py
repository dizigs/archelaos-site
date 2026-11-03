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


if __name__ == "__main__": unittest.main()
