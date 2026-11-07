import importlib.util
import json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("repair_sport_preview",ROOT/"tools/repair_sport_preview.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class RepairPreview(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry=json.loads((ROOT/"config/sport-sites.json").read_text(encoding="utf-8"))
        cls.source=(ROOT/"prototypes/sport-site/index.html").read_text(encoding="utf-8")
    def test_current_links_are_correct(self):
        fixed,changes=m.repair_preview(self.source,self.registry)
        self.assertEqual(fixed,self.source)
        self.assertEqual(changes,[])
    def test_broken_links_restore_only_expected_destination(self):
        broken=self.source.replace('id="history-card" href="https://archelaos.club/tmimata.html#sport-archery"','id="history-card" href="https://archelaos.club/incorrect"',1)
        fixed,changes=m.repair_preview(broken,self.registry)
        self.assertEqual(fixed,self.source)
        self.assertEqual(len(changes),1)
    def test_refuses_unknown_markup(self):
        broken=self.source.replace('id="history-card"', 'id="unexpected"',1)
        with self.assertRaises(ValueError):m.repair_preview(broken,self.registry)
    def test_refuses_untrusted_canonical_domain(self):
        other=json.loads(json.dumps(self.registry))
        other["departments"][0]["historyUrl"]="https://example.org/phish"
        with self.assertRaises(ValueError):m.repair_preview(self.source,other)
if __name__=="__main__":unittest.main()
