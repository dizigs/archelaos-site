"""Real Git regression checks for the read-only sync auditor's CLI boundary."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("live_sync", Path(__file__).resolve().parents[1] / "tools/live_sync_audit.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class GitBoundary(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.run_git("init", "-b", "main")
        (self.root / "hall-of-fame-people.json").write_text(json.dumps({"people": []}))
        (self.root / "board.html").write_text("<h1>Public test board</h1>")
        self.run_git("add", ".")
        self.run_git("-c", "user.name=Offline fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "public fixture")
        self.sha = self.run_git("rev-parse", "HEAD").strip()
        self.run_git("update-ref", "refs/remotes/origin/main", self.sha)
        self.root_patch = patch.object(audit, "ROOT", self.root)
        self.root_patch.start()
        self.addCleanup(self.root_patch.stop)

    def run_git(self, *args):
        return subprocess.check_output(["git", "-C", str(self.root), *args], text=True, stderr=subprocess.DEVNULL)

    def test_read_main_and_exact_commit(self):
        for ref in ("main", "origin/main", self.sha):
            self.assertEqual(audit.live_json(ref, "hall-of-fame-people.json"), {"people": []})
            self.assertEqual(audit.live_text(ref, "board.html"), "<h1>Public test board</h1>")

    def test_output_option_cannot_write_a_file(self):
        target = self.root / "forbidden"
        with self.assertRaises(ValueError):
            audit.live_text("--output=" + str(target), "board.html")
        self.assertFalse(Path(str(target) + ":board.html").exists())

    def test_reject_options_revision_expressions_and_unapproved_paths(self):
        for ref in ("--help", "-p", "main:board.html", "main^{tree}", "main~1", "a" * 39, "main\n--output=oops"):
            with self.subTest(ref=ref), patch.object(audit.subprocess, "check_output") as process:
                with self.assertRaises(ValueError):
                    audit.live_text(ref, "board.html")
                process.assert_not_called()
        for name in ("../private.json", "private.json", "board.html:other", "/etc/passwd"):
            with self.subTest(path=name), self.assertRaises(ValueError):
                audit.live_text("main", name)

    def test_missing_commit_is_failure(self):
        with self.assertRaises(subprocess.CalledProcessError):
            audit.live_text("0" * 40, "board.html")


if __name__ == "__main__":
    unittest.main()
