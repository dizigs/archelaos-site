"""Regression guards for legacy Font Awesome CDN SRI and least-privilege restore workflow."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
PAGES = ("index.html",)  # First isolated batch; expand after follow-up page merges.
CSS_URL = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
# Version-specific cdnjs SRI; change only with a verified asset/version update.
SRI = "sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA=="


class LegacySRIAndPermissionsTests(unittest.TestCase):
    def test_fontawesome_is_version_pinned_and_integrity_checked(self):
        exact = (
            f'<link href="{CSS_URL}" integrity="{SRI}" '
            'crossorigin="anonymous" referrerpolicy="no-referrer" rel="stylesheet"/>'
        )
        for page in PAGES:
            with self.subTest(page=page):
                source = (ROOT / page).read_text(encoding="utf-8")
                self.assertEqual(source.count(CSS_URL), 1)
                self.assertEqual(source.count(exact), 1)

    def test_actions_read_is_only_in_manual_provider_job(self):
        src = (ROOT / ".github/workflows/public-restore-audit.yml").read_text(
            encoding="utf-8"
        )
        before_jobs, jobs = src.split("\njobs:\n", 1)
        self.assertEqual(before_jobs.count("\npermissions:\n"), 1)
        top_level_permissions = before_jobs.split("\npermissions:\n", 1)[1]
        self.assertEqual(top_level_permissions, "  contents: read")
        fixture, manual = jobs.split("\n  provider-artifact-rehearsal:\n", 1)
        self.assertNotIn("actions: read", fixture)
        self.assertIn("if: github.event_name == 'workflow_dispatch'", manual)
        self.assertIn("    permissions:\n      contents: read\n      actions: read\n", manual)


if __name__ == "__main__":
    unittest.main()
