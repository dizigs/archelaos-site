"""Regression tests for proposed sport-site registration; no live services."""
import importlib.util
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "tools" / "validate_sport_sites.py"
spec = importlib.util.spec_from_file_location("validate_sport_sites", MODULE_PATH)
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)

class SportSiteRegistryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = json.loads((ROOT / "config/sport-sites.json").read_text(encoding="utf-8"))

    def test_current_registry_is_valid(self):
        self.assertEqual(validator.validate(self.source), [])

    def test_canonical_people_and_history_on_main_domain(self):
        for d in self.source["departments"]:
            self.assertTrue(d["historyUrl"].startswith("https://archelaos.club/"))
            self.assertTrue(d["peopleUrl"].startswith("https://archelaos.club/"))

    def test_unsafe_external_history_is_rejected(self):
        data = json.loads(json.dumps(self.source))
        data["departments"][0]["historyUrl"] = "https://example.org/hall"
        self.assertTrue(any("historyUrl" in error for error in validator.validate(data)))

    def test_duplicate_sport_key_is_rejected(self):
        data = json.loads(json.dumps(self.source))
        data["departments"].append(dict(data["departments"][0]))
        self.assertTrue(any("duplicate key" in error for error in validator.validate(data)))

    def test_archery_and_wrestling_are_only_planned_not_live_certified(self):
        by_key = {d["key"]: d for d in self.source["departments"]}
        self.assertIn(by_key["archery"]["state"], ("existing-rebuild-planned", "planned"))
        self.assertEqual(by_key["wrestling"]["state"], "planned")
        self.assertTrue(all(d["analytics"]["propertyMode"] == "shared-proposed"
                            for d in self.source["departments"]))

if __name__ == "__main__":
    unittest.main()
