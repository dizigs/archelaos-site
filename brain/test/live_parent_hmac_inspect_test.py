"""Regression: after a rollback, read settings from the active deployment version."""
import importlib.util
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

os.environ.setdefault("RUNNER_TEMP", tempfile.gettempdir())
MODULE = Path(__file__).resolve().parents[1] / "qa/live_parent_hmac_once.py"
spec = importlib.util.spec_from_file_location("live_parent_hmac_once", MODULE)
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)


class ActiveVersionReadbackTest(unittest.TestCase):
    def test_rollback_readback_ignores_latest_uploaded_settings(self):
        deployed = "f6f360fc-c232-48a3-8370-df0fa6fe20b4"
        upload = "de932e96-5fb2-4ee8-9536-bfdce2436245"
        calls = []
        def fake(method, name, resource, payload=None):
            self.assertEqual(method, "GET")
            self.assertEqual(name, qa.BRAIN)
            calls.append(resource)
            if resource == "deployments":
                return [{"versions": [{"version_id": deployed, "percentage": 100}]}]
            if resource == "schedules":
                return {"schedules": []}
            if resource == "versions/" + deployed:
                return {"resources": {"bindings": [
                    {"name": "PRIVATE_HMAC_ACCEPTANCE_ISOLATED",
                     "type": "plain_text", "text": "false"},
                    {"name": "DEPLOY_SHA", "type": "plain_text", "text": "0" * 40}
                ]}}
            if resource == "settings":
                self.fail("Latest uploaded version must NOT determine active runtime")
            if resource == "versions/" + upload:
                self.fail("Inactive uploaded version must not be read")
            self.fail("Unexpected API path: " + resource)
        with mock.patch.object(qa, "api", side_effect=fake):
            bindings, version = qa.inspect(qa.BRAIN)
        self.assertEqual(version, deployed)
        self.assertEqual(qa.scalar(bindings, "PRIVATE_HMAC_ACCEPTANCE_ISOLATED"), "false")
        self.assertEqual(calls, ["deployments", "schedules", "versions/" + deployed])

    def test_split_traffic_fails_closed(self):
        def fake(method, name, resource, payload=None):
            if resource == "deployments":
                return [{"versions": [{"version_id": qa.BASE[qa.HEALER],
                                       "percentage": 50}]}]
            if resource == "schedules":
                return {"schedules": []}
            self.fail("Version settings must not be read on split traffic")
        with mock.patch.object(qa, "api", side_effect=fake):
            with self.assertRaisesRegex(qa.NoGo, "SPLIT_TRAFFIC"):
                qa.inspect(qa.HEALER)


if __name__ == "__main__":
    unittest.main()
