import importlib.util
from pathlib import Path
import unittest
R=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location("pipeline",R/"rebuild/tools/news_pipeline_self_heal.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class PipelineTests(unittest.TestCase):
 def setUp(self):
  self.people=[{"id":"p1"},{"id":"p2"}]
  self.row={"id":"a","eventDate":"2025-06-21","sport":"Τοξοβολία","sourceUrl":"https://example.org/story","personIds":["p1"]}
 def codes(self,rows):return [x["code"] for x in m.check(rows,self.people)]
 def test_valid(self):self.assertEqual(self.codes([self.row]),["NO_PHOTO"])
 def test_safe_repair(self):
  x=dict(self.row,personIds=["p1","p1","p2"])
  self.assertEqual(m.repair([x],self.people),["a"])
  self.assertEqual(x["personIds"],["p1","p2"])
  self.assertEqual(m.repair([x],self.people),[])
 def test_unknown_not_repaired(self):
  x=dict(self.row,personIds=["p1","unknown","unknown"])
  self.assertEqual(m.repair([x],self.people),[])
  self.assertIn("UNKNOWN_PERSON",self.codes([x]))
 def test_event_date(self):
  self.assertIn("BAD_EVENT_DATE",self.codes([dict(self.row,eventDate="bad")]))
 def test_profile_fact(self):
  self.assertIn("BAD_PROFILE_FACT",self.codes([dict(self.row,personFacts={"p2":"fact"})]))
if __name__=="__main__":unittest.main()
