#!/usr/bin/env python3
"""Offline checks for targeted SonarCloud workflow security regressions."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / ".github" / "workflows"


def workflow(name):
    return (WORKFLOWS / name).read_text(encoding="utf-8")


class SecurityWorkflowTests(unittest.TestCase):
    def test_google_oidc_auth_action_has_full_sha(self):
        text = workflow("google-analytics-aggregate.yml")
        match = re.search(r"uses:\s*google-github-actions/auth@([^\s#]+)", text)
        self.assertIsNotNone(match)
        self.assertRegex(match.group(1), r"^[0-9a-f]{40}$")
        self.assertIn("--only-binary=:all:", text)
        self.assertIn("google-auth==2.35.0", text)
        self.assertIn("requests==2.32.3", text)

    def test_eslint_uses_no_on_demand_runner(self):
        text = workflow("eslint-guard.yml")
        self.assertNotRegex(text, r"\bnpx\b")
        self.assertIn("npm install --no-save --no-package-lock --ignore-scripts eslint@9.39.1", text)
        self.assertIn("./node_modules/.bin/eslint --config eslint.config.mjs rebuild", text)

    def test_live_guard_uses_pinned_local_playwright_without_lifecycle(self):
        text = workflow("live-site-guard.yml")
        self.assertNotRegex(text, r"\bnpx\b")
        self.assertIn("npm install --no-save --no-package-lock --ignore-scripts playwright@1.56.1", text)
        self.assertIn("./node_modules/.bin/playwright install --with-deps chromium", text)


if __name__ == "__main__":
    unittest.main()
