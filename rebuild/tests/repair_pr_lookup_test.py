"""Execute the real repair-PR shell steps with offline Git/GitHub doubles."""
import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest
from unittest.mock import patch
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
import self_heal_github as github
import self_heal_control_plane as controller

ROOT = Path(__file__).resolve().parents[2]
STEPS = (
    ("archive-news-images.yml", "Propose photo updates in a pull request"),
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
    def test_controller_api_lookup_failure_stops_before_git_object_or_ref_creation(self):
        class Client:
            writes = 0
            def pages(self, path):
                raise github.AccessFailure("GET", path, 403, "Resource not accessible by integration")
            def request(self, path, method="GET", data=None):
                if method == "POST": self.writes += 1
                raise AssertionError("No mutation may follow the failed lookup")
        client = Client()
        observation = controller.Observation("club", "ci_failure", "https://archelaos.club/news.html",
            "2026-11-03T12:00:00+00:00", "https://github.com/dizigs/archelaos-site/actions/runs/123",
            "a" * 40, "b" * 64, "public")
        candidate = controller.TestedPatch("news.html", "fixed source", "c" * 64, "b" * 64, 1, True)
        publisher = github.DraftPublisher(client, "main", "d" * 40, lambda _: None)
        with patch.object(github, "assert_no_other_pr_owner"), patch.object(github, "branch_head", return_value="a" * 40), \
                patch.object(github, "tree_file", return_value={"sha": "d" * 40}), \
                patch.object(github, "create_changed_ref") as create, self.assertRaises(github.AccessFailure):
            publisher.propose(observation, candidate)
        create.assert_not_called()
        self.assertEqual(client.writes, 0)

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
