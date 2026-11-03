import importlib.util
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("triage_sport_health",ROOT/"tools/triage_sport_health.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
RUN="https://github.com/dizigs/archelaos-site/actions/runs/41616262142"
def event(kind="broken_asset",resource="https://archery.archelaos.club/images/a.webp"):
    return {"sportKey":"archery","failureClass":kind,"resource":resource,
        "observedAt":"2026-11-03T10:00:00Z","statusOrError":"HTTP 404","sourceRunUrl":RUN}
class TriageTest(unittest.TestCase):
    def test_single_valid_observation_is_suggestion_not_fix(self):
        errors,out=m.triage({"observations":[event()]},{"archery"})
        self.assertFalse(errors)
        self.assertEqual(len(out),1)
        self.assertFalse(out[0]["productionChangeAllowed"])
        self.assertFalse(out[0]["automaticRetryAllowed"])
    def test_duplicate_observation_is_one_suggestion(self):
        errors,out=m.triage({"observations":[event(),event()]},{"archery"})
        self.assertFalse(errors)
        self.assertEqual(len(out),1)
    def test_no_private_url(self):
        errors,out=m.triage({"observations":[event(resource="https://private.example.com/data")]},{"archery"})
        self.assertTrue(errors)
        self.assertEqual(out,[])
    def test_limits_proposals(self):
        rows=[event(kind=k) for k in ["unreachable","http_error","broken_asset","invalid_json"]]
        errors,out=m.triage({"observations":rows},{"archery"},max_items=3)
        self.assertFalse(errors)
        self.assertEqual(len(out),3)
    def test_untrusted_source_is_rejected(self):
        bad=event()
        bad["sourceRunUrl"]="https://evil.example/a"
        errors,out=m.triage({"observations":[bad]},{"archery"})
        self.assertTrue(errors)
        self.assertEqual(out,[])
if __name__=="__main__":unittest.main()
