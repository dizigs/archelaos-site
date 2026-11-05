"""Execute the entire offline command in an isolated repository-shaped fixture."""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class Pipeline(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        shutil.copytree(ROOT / "rebuild/ads", self.root / "rebuild/ads")
        script = self.root / ".github/scripts/ad_grants_issue_plan.py"
        script.parent.mkdir(parents=True)
        shutil.copyfile(ROOT / ".github/scripts/ad_grants_issue_plan.py", script)
        self.output = self.root / "rebuild/test-artifacts/ad-grants/handoff"

    def execute(self, *args):
        return subprocess.run(["bash", str(self.root / "rebuild/ads/run_dry_run.sh"), *args],
                              cwd=self.root, text=True, capture_output=True, timeout=20)

    def status(self):
        return json.loads((self.output / "status.json").read_text())

    def test_full_pipeline_then_repeated_inventory_creates_no_duplicate_plans(self):
        result = self.execute("--fixture")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.status()["status"], "DRY_RUN_COMPLETE")
        self.assertFalse(self.status()["ready_for_live_ads"])
        self.assertEqual(self.status()["issue_actions"]["would_create"], 6)
        plan = json.loads((self.output / "issue-plan.json").read_text())
        self.assertFalse(plan["can_publish"])
        existing = [{"number":i + 1, "state":"open", "user":{"login":"github-actions[bot]"},
                     "body":action["body"]} for i, action in enumerate(plan["actions"])]
        (self.root / "rebuild/ads/fixtures/existing-issues.json").write_text(json.dumps(existing))
        self.assertEqual(self.execute("--fixture").returncode, 0)
        self.assertEqual(self.status()["issue_actions"], {"would_create":0, "would_reopen":0, "already_open":6})

    def test_missing_real_inputs_invalidates_previous_fixture_completion(self):
        self.assertEqual(self.execute("--fixture").returncode, 0)
        result = self.execute()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.status()["status"], "INCOMPLETE")
        self.assertFalse(self.status()["ready_for_live_ads"])

    def test_stale_analytics_stops_the_entire_pipeline(self):
        file = self.root / "rebuild/ads/fixtures/google-analytics-aggregate.synthetic.json"
        data = json.loads(file.read_text()); data["generated_utc"] = "2020-01-01T00:00:00Z"
        file.write_text(json.dumps(data))
        self.assertNotEqual(self.execute("--fixture").returncode, 0)
        self.assertEqual(self.status()["status"], "INCOMPLETE")
