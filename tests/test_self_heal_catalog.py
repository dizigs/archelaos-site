"""Fail-closed checks for the reviewed self-heal knowledge base and single hourly schedule."""
import json
from pathlib import Path
import re
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from self_heal_control_plane import REPAIR_TARGETS


class SelfHealCatalogTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = json.loads((ROOT / "docs/self-heal/error-solution-catalog.json").read_text(encoding="utf-8"))

    def test_schema_entries_have_unique_stable_codes(self):
        data = self.catalog
        self.assertEqual(data["schemaVersion"], 1)
        self.assertEqual(data["mode"], "REVIEWED_REFERENCE_ONLY")
        self.assertGreaterEqual(len(data["entries"]), 1)
        codes = [item["code"] for item in data["entries"]]
        self.assertEqual(len(codes), len(set(codes)))
        for item in data["entries"]:
            self.assertRegex(item["code"], r"^ARCH-[A-Z0-9-]+-[0-9]{3}$")
            self.assertIn(item["status"], {"ISOLATED_REPAIR_VERIFIED", "DIAGNOSE_ONLY"})
            self.assertTrue(item["signal"] and item["diagnosis"] and item["limitations"])
            self.assertTrue(item["resource"].startswith("https://"))
            self.assertFalse(item["remediation"]["automaticMerge"])
            self.assertTrue(item["remediation"]["requiresReviewedPR"])
            self.assertTrue(item["remediation"]["independentBeforeAfterGuard"])

    def test_only_compiled_public_allowlist_has_repair_recipe(self):
        allowed = {("club", "ci_failure", "public"): "news.html"}
        for item in self.catalog["entries"]:
            key = (item["sportKey"], item["failureClass"], item["scope"])
            repair = item["remediation"]
            if item["status"] == "ISOLATED_REPAIR_VERIFIED":
                self.assertEqual(repair["mode"], "DRAFT_PR_ONLY")
                self.assertEqual(item["approvedTarget"], allowed[key])
                self.assertEqual(REPAIR_TARGETS.get(key), item["approvedTarget"])
                self.assertEqual(repair["implementation"], "tools/self_heal_fixture.py:tested_patch")
                self.assertTrue((ROOT / "tools/self_heal_fixture.py").exists())
                self.assertEqual(item["evidence"]["scope"], "isolated-fixture")
                self.assertIn("NOT yet", item["limitations"])
            else:
                self.assertEqual(repair["mode"], "NO_AUTOMATIC_REPAIR")
                self.assertIsNone(repair["implementation"])
                self.assertIsNone(item["approvedTarget"])

    def test_existing_workflow_uses_one_hourly_schedule_without_new_job(self):
        source = (ROOT / ".github/workflows/site-watch-and-repair.yml").read_text(encoding="utf-8")
        crons = re.findall(r"^\s*- cron:\s*'([^']+)'", source, re.MULTILINE)
        self.assertEqual(crons, ["17 * * * *"])
        self.assertIn("workflow_dispatch:", source)
        self.assertIn("group: site-watch-and-repair", source)
        self.assertIn("cancel-in-progress: false", source)
        self.assertIn("github.ref == 'refs/heads/main'", source)
        self.assertIn("python tools/self_heal_monitor.py", source)


if __name__ == "__main__":
    unittest.main()
