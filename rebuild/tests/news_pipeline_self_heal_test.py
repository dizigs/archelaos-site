import importlib.util
from pathlib import Path
import unittest
R=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location("pipeline",R/"rebuild/tools/news_pipeline_self_heal.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class PipelineTests(unittest.TestCase):
 def setUp(self):
  self.people=[{"id":"p1"},{"id":"p2"}]
  self.row={"id":"a","title":"Τεκμηριωμένη είδηση","eventDate":"2025-06-21","sport":"Τοξοβολία","sourceUrl":"https://example.org/story","personIds":["p1"]}
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
 def test_missing_id_and_title(self):
  self.assertIn("MISSING_NEWS_ID",self.codes([dict(self.row,id=None)]))
  self.assertIn("MISSING_NEWS_TITLE",self.codes([dict(self.row,title="")]))
 def test_malformed_source_never_crashes(self):
  self.assertIn("BAD_SOURCE",self.codes([dict(self.row,sourceUrl=42)]))
  self.assertIn("BAD_SOURCE",self.codes([dict(self.row,sourceUrl="https://")]))
 def test_malformed_photo_never_crashes(self):
  self.assertIn("BAD_PHOTO",self.codes([dict(self.row,image=["bad"])]))
 def test_compact_date_is_rejected(self):
  self.assertIn("BAD_EVENT_DATE",self.codes([dict(self.row,eventDate="20250621")]))
 def test_profile_fact(self):
  self.assertIn("BAD_PROFILE_FACT",self.codes([dict(self.row,personFacts={"p2":"fact"})]))
if __name__=="__main__":unittest.main()
