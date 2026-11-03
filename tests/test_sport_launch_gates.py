import copy
import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("audit_sport_launch",ROOT/"tools/audit_sport_launch.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class GateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry=json.loads((ROOT/"config/sport-sites.json").read_text(encoding="utf-8"))
        cls.matrix=json.loads((ROOT/"config/sport-launch-readiness.json").read_text(encoding="utf-8"))
        cls.policy=json.loads((ROOT/"config/sport-self-heal-policy.json").read_text(encoding="utf-8"))
    def test_defaults_are_not_deployable(self):
        errors,result=m.assess(self.registry,self.matrix)
        self.assertEqual(errors,[])
        self.assertFalse(any(v["ready"] for v in result.values()))
    def test_unproven_release_gate_rejected(self):
        data=copy.deepcopy(self.matrix)
        data["departments"]["wrestling"]["gates"]["dns_routed"]["status"]="verified"
        errors,_=m.assess(self.registry,data)
        self.assertTrue(any("no evidence" in e for e in errors))
    def test_other_sports_cannot_assume_archery_brand(self):
        data=copy.deepcopy(self.matrix)
        data["departments"]["wrestling"]["gates"]["brand_approved"]={"status":"verified","checkedAt":"2026-11-03","evidenceUrl":"https://example.com/a"}
        errors,_=m.assess(self.registry,data)
        self.assertTrue(any("brand approval" in e for e in errors))
    def test_self_heal_does_not_auto_publish(self):
        self.assertFalse(self.policy["createNewCron"])
        self.assertEqual(self.policy["mode"],"observe-and-propose-only")
        self.assertIn("publish_production",self.policy["actions"]["manualOrProviderGate"])
        self.assertIn("auto_merge_athlete_identities",self.policy["actions"]["alwaysForbidden"])
    def test_no_duplicate_schedule(self):
        self.assertEqual(set(self.policy["reuseExistingHealthWorkflows"]),{"live-health.yml","automation-health.yml"})
if __name__=="__main__":unittest.main()
