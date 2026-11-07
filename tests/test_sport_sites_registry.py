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

    def test_only_archery_has_an_approved_theme(self):
        by_key = {d["key"]: d for d in self.source["departments"]}
        self.assertEqual(by_key["archery"]["themeStatus"], "approved-archery-only")
        self.assertIsNotNone(by_key["archery"]["theme"])
        self.assertTrue(all(d["theme"] is None and d["themeStatus"] == "undecided"
                            for k,d in by_key.items() if k != "archery"))

    def test_unapproved_wrestling_theme_is_rejected(self):
        data = json.loads(json.dumps(self.source))
        for d in data["departments"]:
            if d["key"] == "wrestling":
                d["theme"] = data["departments"][0]["theme"]
        self.assertTrue(any("unapproved sport theme" in error for error in validator.validate(data)))

    def test_archery_and_wrestling_are_only_planned_not_live_certified(self):
        by_key = {d["key"]: d for d in self.source["departments"]}
        self.assertIn(by_key["archery"]["state"], ("existing-rebuild-planned", "planned"))
        self.assertEqual(by_key["wrestling"]["state"], "planned")
        self.assertTrue(all(d["analytics"]["propertyMode"] == "shared-proposed"
                            for d in self.source["departments"]))

if __name__ == "__main__":
    unittest.main()
