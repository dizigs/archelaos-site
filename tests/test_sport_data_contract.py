import copy
import importlib.util
import json
import pathlib
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("validate_sport_data_contract",ROOT/"tools"/"validate_sport_data_contract.py")
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contract=json.loads((ROOT/"config"/"sport-data-contract.json").read_text(encoding="utf-8"))
        cls.registry=json.loads((ROOT/"config"/"sport-sites.json").read_text(encoding="utf-8"))

    def test_current_contract_is_safe(self):
        self.assertEqual(module.check(self.contract,self.registry), [])

    def test_identity_name_matching_cannot_be_enabled(self):
        c=copy.deepcopy(self.contract)
        c["person"]["automaticNameMatchAllowed"]=True
        self.assertTrue(module.check(c,self.registry))

    def test_analytics_cannot_include_player_ids(self):
        c=copy.deepcopy(self.contract)
        c["analytics"]["allowedParameters"].append("externalPlayerId")
        self.assertTrue(module.check(c,self.registry))

    def test_analytics_cannot_be_claimed_active(self):
        c=copy.deepcopy(self.contract)
        c["analytics"]["mode"]="active"
        self.assertTrue(module.check(c,self.registry))

    def test_events_must_have_source_provenance(self):
        c=copy.deepcopy(self.contract)
        c["events"]["required"].remove("sourceUrl")
        self.assertTrue(module.check(c,self.registry))

if __name__=="__main__":
    unittest.main()
