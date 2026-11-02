"""Execute the real repair-PR shell steps with offline Git/GitHub doubles."""
import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest

ROOT = Path(__file__).resolve().parents[2]
STEPS = (
    ("archive-news-images.yml", "Propose photo updates in a pull request"),
    ("site-watch-and-repair.yml", "Open CI-gated repair pull request instead of touching production"),
)


def shell_step(filename, name):
    lines = (ROOT / ".github/workflows" / filename).read_text().splitlines()
    start = lines.index("      - name: " + name)
    run = next(i for i in range(start, len(lines)) if lines[i].strip() == "run: |")
    body = []
    for line in lines[run + 1:]:
        if line.strip() and not line.startswith("          "):
            break
        body.append(line[10:])
    return "\n".join(body)


class RepairPullRequestLookupTests(unittest.TestCase):
    def execute(self, filename, name, lookup):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            for command, script in {
                "git": '''
                    #!/bin/bash
                    echo "git $*" >> "$CALL_LOG"
                    if [[ "$1" == diff ]]; then exit 1; fi
                ''',
                "gh": '''
                    #!/bin/bash
                    echo "gh $*" >> "$CALL_LOG"
                    if [[ "$1 $2" == "pr list" ]]; then
                      case "$LOOKUP" in
                        failure) echo 'simulated API failure' >&2; exit 1 ;;
                        existing) echo '42' ;;
                        empty) ;;
                      esac
                    fi
                ''',
            }.items():
                target = base / command
                target.write_text(textwrap.dedent(script).lstrip())
                target.chmod(0o755)
            env = dict(os.environ, PATH=str(base) + os.pathsep + os.environ["PATH"],
                       CALL_LOG=str(base / "calls"), LOOKUP=lookup,
                       REPO="example/site", GITHUB_RUN_ID="offline-fixture")
            result = subprocess.run(["bash", "-c", shell_step(filename, name)],
                                    cwd=tmp, env=env, text=True, capture_output=True, timeout=10)
            return result, (base / "calls").read_text()

    def test_api_failure_stops_before_push_or_pr_creation(self):
        for filename, name in STEPS:
            with self.subTest(workflow=filename):
                result, calls = self.execute(filename, name, "failure")
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertNotIn("git push", calls)
                self.assertNotIn("gh pr create", calls)

    def test_existing_pr_is_left_for_review(self):
        for filename, name in STEPS:
            with self.subTest(workflow=filename):
                result, calls = self.execute(filename, name, "existing")
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertNotIn("git push", calls)
                self.assertNotIn("gh pr create", calls)

    def test_confirmed_empty_lookup_can_propose_patch(self):
        for filename, name in STEPS:
            with self.subTest(workflow=filename):
                result, calls = self.execute(filename, name, "empty")
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn("git push", calls)
                self.assertIn("gh pr create", calls)


if __name__ == "__main__":
    unittest.main()
