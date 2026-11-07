"""Synthetic-only regression tests for the private HMAC QA cleanup path."""
import importlib.util
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("cloudflare_qa", ROOT / "brain/qa/cloudflare_isolated_acceptance.py")
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)
SHA = "a" * 40
SUBJECT = "qa(remote): one-shot isolated Cloudflare HMAC acceptance"


class CleanupTest(unittest.TestCase):
    def exercise(self, factory, fake_deploy=None, fake_verify=None):
        with tempfile.TemporaryDirectory(prefix="qa-failure-test-") as work:
            root, events = Path(work), []
            env = {"GITHUB_ACTIONS": "true", "GITHUB_REPOSITORY": "dizigs/archelaos-site",
                   "GITHUB_EVENT_NAME": "pull_request", "QA_PR": "288",
                   "CLOUDFLARE_API_TOKEN": "synthetic-test-token", "EXPECTED_SHA": SHA}
            def make(*args):
                return factory(root, *args)
            with mock.patch.dict(os.environ, env), \
                 mock.patch.object(qa, "ROOT", root), \
                 mock.patch.object(qa, "tempfiles", []), \
                 mock.patch.object(qa, "created", set()), \
                 mock.patch.object(qa, "boot", {}), \
                 mock.patch.object(qa, "api", side_effect=lambda method, name, resource="settings": None), \
                 mock.patch.object(qa.subprocess, "check_output", side_effect=[SHA+"\n", SUBJECT+"\n"]), \
                 mock.patch.object(qa, "note", side_effect=events.append), \
                 mock.patch.object(qa, "make", side_effect=make), \
                 mock.patch.object(qa, "deploy", side_effect=fake_deploy), \
                 mock.patch.object(qa, "verify", side_effect=fake_verify):
                with self.assertRaises(qa.Stop) as ctx:
                    qa.run()
                return str(ctx.exception), list(root.rglob("*.toml")), events

    def test_second_plan_failure_removes_first(self):
        def make(root, src, original, name, old_peer, new_peer):
            if name == qa.H:
                raise qa.Stop("SECOND_PLAN_FAILED")
            path = root / "first.toml"
            path.write_text("synthetic")
            qa.tempfiles.append(path)
            qa.boot[name] = path
            return path, ""
        error, files, events = self.exercise(make)
        self.assertEqual(error, "SECOND_PLAN_FAILED")
        self.assertEqual(files, [])
        self.assertNotIn("QA_CLEANUP_INCOMPLETE", events)

    def test_cleanup_failure_does_not_mask_original(self):
        calls = {}
        def make(root, src, original, name, old_peer, new_peer):
            path = root / (name + ".toml")
            path.write_text("synthetic")
            qa.tempfiles.append(path)
            qa.boot[name] = path
            return path, ""
        def deploy(path):
            key = str(path)
            calls[key] = calls.get(key, 0) + 1
            if calls[key] > 1:
                raise qa.Stop("REVOCATION_ERROR")
        def verify(*args):
            raise qa.Stop("ORIGINAL_VALIDATION_ERROR")
        error, files, events = self.exercise(make, deploy, verify)
        self.assertEqual(error, "ORIGINAL_VALIDATION_ERROR")
        self.assertEqual(files, [])
        self.assertIn("QA_CLEANUP_INCOMPLETE", events)


if __name__ == "__main__":
    unittest.main()
