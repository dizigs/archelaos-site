"""Inactive source configuration is not permission to connect live Workers."""
import copy
import importlib.util
import unittest
from pathlib import Path
import tomllib

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("inactive_bindings", ROOT / "brain/tools/check_inactive_bindings.py")
GUARD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(GUARD)
NOW = GUARD.datetime(2026, 11, 6, 16, 0, tzinfo=GUARD.timezone.utc)


def configs():
    return [tomllib.loads((ROOT / p).read_text()) for p in (
        "brain/wrangler.toml", "automation/self-heal-worker/wrangler.toml")]


class ApprovedBindingContracts(unittest.TestCase):
    def test_brain_targets_only_existing_healer_default(self):
        self.assertEqual(configs()[0].get("services"), [{
            "binding": "HEALER", "service": "archelaos-self-heal"}])

    def test_healer_targets_only_hardened_named_brain_port(self):
        self.assertEqual(configs()[1].get("services"), [{
            "binding": "BRAIN_RECOVERY", "service": "archelaos-brain-staging",
            "entrypoint": "BrainRecoveryPort"}])


def live_fixture():
    """Synthetic pre-link inventory. Contains no real IDs, credentials or values."""
    workers = []
    for c in configs():
        bindings = list(GUARD.declared_bindings(c).values())
        bindings = [b for b in bindings if b["type"] != "service"]
        for b in bindings:
            if b["type"] == "durable_object_namespace":
                b["namespace_id"] = "synthetic-sqlite-namespace"
        bindings.append({"name": "TEST_ONLY_PRIVATE_KEY", "type": "secret_text"})
        workers.append({"name": c["name"], "bindings": bindings})
    return {"capturedAt": NOW.isoformat(), "workers": workers}


class PreservationGuard(unittest.TestCase):
    def test_valid_source_does_not_claim_live_readiness(self):
        r = GUARD.assess(configs())
        self.assertEqual(r["configuration"], "PASS")
        self.assertEqual(r["bindingPreservation"], "NOT_VERIFIED")
        self.assertFalse(r["uploadAuthorized"])
        self.assertIn("FRESH_PRIVATE_LIVE_INVENTORY_REQUIRED", r["blockers"])

    def test_synthetic_complete_inventory_checks_preservation_only(self):
        r = GUARD.assess(configs(), live_fixture(), NOW)
        self.assertEqual(r["offlineBindingComparison"], "PASS")
        self.assertEqual(r["bindingPreservation"], "NOT_VERIFIED")
        self.assertEqual(r["inventoryCompleteness"], "NOT_VERIFIED")
        self.assertIn("AUTHENTICATED_COMPLETE_PROVIDER_INVENTORY_REQUIRED", r["blockers"])
        self.assertFalse(r["uploadAuthorized"])
        self.assertFalse(r["liveConnectivityVerified"])

    def test_present_default_and_named_links_match_but_redirects_are_blocked(self):
        f = live_fixture()
        for i, c in enumerate(configs()):
            link = next(b for b in GUARD.declared_bindings(c).values() if b["type"] == "service")
            f["workers"][i]["bindings"].append(link)
        # Cloudflare can explicitly report the default entrypoint as "default".
        f["workers"][0]["bindings"][-1]["entrypoint"] = "default"
        self.assertEqual(GUARD.assess(configs(), f, NOW)["offlineBindingComparison"], "PASS")
        for patch in ({"entrypoint": "default"}, {"environment": "production"},
                      {"service": "unapproved-brain"}):
            wrong = copy.deepcopy(f)
            wrong["workers"][1]["bindings"][-1].update(patch)
            self.assertIn("LIVE_SERVICE_TARGET_CONFLICT",
                          GUARD.assess(configs(), wrong, NOW)["blockers"])

    def test_drop_retype_redirect_activation_or_migration_fails(self):
        for mutate in (
            lambda c: c[0].pop("ai"),
            lambda c: c[1]["services"][0].pop("entrypoint"),
            lambda c: c[0]["services"][0].update(service="other-worker"),
            lambda c: c[0]["services"][0].update(environment="production"),
            lambda c: c[1]["services"].append(dict(c[1]["services"][0])),
            lambda c: c[0]["vars"].update(STAGING_EXPIRES_AT="2099-01-01T00:00:00Z"),
            lambda c: c[0]["vars"].update(BRAIN_SELFHEAL_RECOVERY_ENABLED="true"),
            lambda c: c[0]["vars"].update(BRAIN_GITHUB_APP_PRIVATE_KEY="synthetic-not-a-key"),
            lambda c: c[1]["migrations"][0].update(deleted_classes=["HealerMemory"]),
            lambda c: c[1].update(workers_dev=True),
            lambda c: c[1].update(compatibility_date="2026-07-30"),
            lambda c: c[0].update(routes=["synthetic.invalid/*"]),
            lambda c: c[1].update(triggers={"crons": ["* * * * *"]}),
        ):
            with self.subTest(mutation=mutate):
                c = copy.deepcopy(configs())
                mutate(c)
                self.assertEqual(GUARD.assess(c)["configuration"], "BLOCKED")

    def test_unreviewed_kv_secret_shadowing_fails_closed(self):
        c = configs()
        c[0]["kv_namespaces"] = [{"binding": "HEALER_EVENT_HMAC_KEY",
                                   "id": "synthetic-namespace"}]
        self.assertIn("UNREVIEWED_BINDING_OR_OVERRIDE", GUARD.assess(c)["blockers"])
        f = live_fixture()
        f["workers"][0]["bindings"].append({
            "name": "HEALER_EVENT_HMAC_KEY", "type": "secret_text"})
        self.assertIn("UNREVIEWED_BINDING_OR_OVERRIDE",
                      GUARD.assess(c, f, NOW)["blockers"])

    def test_filtered_baseline_inventory_never_attests_completeness(self):
        f = live_fixture()
        for w in f["workers"]:
            w["bindings"] = [b for b in w["bindings"]
                             if b["type"] in ("durable_object_namespace", "ai")]
        r = GUARD.assess(configs(), f, NOW)
        self.assertEqual(r["bindingPreservation"], "NOT_VERIFIED")
        self.assertIn("AUTHENTICATED_COMPLETE_PROVIDER_INVENTORY_REQUIRED", r["blockers"])

    def test_unknown_live_binding_prevents_silent_deletion(self):
        for b in ({"name": "EXTRA_KV", "type": "kv_namespace"},
                  {"name": "EXTRA_AI", "type": "ai"},
                  {"name": "EXTRA_VAR", "type": "plain_text", "text": "synthetic"}):
            f = live_fixture()
            f["workers"][0]["bindings"].append(b)
            self.assertIn("UNDECLARED_OR_RETYPED_LIVE_BINDING",
                          GUARD.assess(configs(), f, NOW)["blockers"])

    def test_missing_baseline_namespace_duplicate_or_redirect_is_blocked(self):
        for mutate in (
            lambda f: f["workers"][0]["bindings"].pop(-2),  # baseline AI
            lambda f: f["workers"][0]["bindings"].append(
                {"name": "BRAIN", "type": "durable_object_namespace"}),
            lambda f: next(b for b in f["workers"][0]["bindings"] if b["name"] == "BRAIN").pop("namespace_id"),
            lambda f: next(b for b in f["workers"][1]["bindings"] if b["name"] == "HEALER_MEMORY").update(script_name="another-worker"),
            lambda f: next(b for b in f["workers"][0]["bindings"] if b["name"] == "AI").update(type="plain_text"),
        ):
            f = live_fixture()
            mutate(f)
            self.assertTrue(GUARD.assess(configs(), f, NOW)["blockers"])

    def test_secret_conversion_and_secret_values_are_rejected_without_logging(self):
        for binding in (
            {"name": "ENVIRONMENT", "type": "secret_text"},
            {"name": "TEST_PRIVATE", "type": "secret_text", "text": "SYNTHETIC_NEVER_LOG"},
        ):
            f = live_fixture()
            f["workers"][0]["bindings"].append(binding)
            result = GUARD.assess(configs(), f, NOW)
            self.assertTrue(result["blockers"])
            self.assertNotIn("SYNTHETIC_NEVER_LOG", str(result))

    def test_stale_malformed_and_partial_inventory_is_unknown(self):
        for f in ([], {}, {"capturedAt": "2020-01-01T00:00:00Z", "workers": []},
                  {"capturedAt": NOW.isoformat(), "workers": [live_fixture()["workers"][0]]}):
            self.assertTrue(GUARD.assess(configs(), f, NOW)["blockers"])


if __name__ == "__main__":
    unittest.main()
