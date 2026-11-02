import importlib.util
from pathlib import Path
import sys
import unittest
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"rebuild/tools"))
spec=importlib.util.spec_from_file_location("media_builder",ROOT/"rebuild/tools/build_news_media_candidates.py")
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class MediaFacetTests(unittest.TestCase):
    def setUp(self):
        self.people=[{"id":"p1"},{"id":"p2"}]
        self.row={"id":"article-1","date":"2026-11-02","sport":"Τοξοβολία",
                  "title":"Τίτλος","sourceUrl":"https://example.org/story",
                  "personIds":["p1"],"intervieweeName":"Ομιλητής","intervieweePersonId":"p1"}
    def test_one_source_two_facet_ids(self):
        result=module.candidates([dict(self.row,archiveKinds=["interview","press_clipping"])],self.people)
        self.assertEqual([x["id"] for x in result["interviews"]],["news-article-1"])
        self.assertEqual([x["id"] for x in result["press_clippings"]],["press-news-article-1"])
        self.assertEqual(result["interviews"][0]["source"]["news_id"],"article-1")
        self.assertEqual(result["press_clippings"][0]["source"]["news_id"],"article-1")
    def test_untagged_not_inferred(self):
        result=module.candidates([self.row],self.people)
        self.assertEqual((len(result["interviews"]),len(result["press_clippings"])),(0,0))
    def test_statement_only(self):
        result=module.candidates([dict(self.row,archiveKinds=["statement"])],self.people)
        self.assertEqual(result["interviews"][0]["kind"],"statement")
        self.assertFalse(result["press_clippings"])
    def test_unknown_label_blocks(self):
        with self.assertRaisesRegex(ValueError,"BAD_ARCHIVE_KIND"):
            module.candidates([dict(self.row,archiveKinds=["random"])],self.people)
    def test_unknown_speaker_blocks(self):
        with self.assertRaisesRegex(ValueError,"INVALID_INTERVIEWEE_LINK"):
            module.candidates([dict(self.row,archiveKinds=["interview"],intervieweePersonId="p2")],self.people)
    def test_no_keyword_auto_classification(self):
        row=dict(self.row,title="Συνέντευξη προέδρου στην εφημερίδα")
        self.assertFalse(module.candidates([row],self.people)["interviews"])
    def test_duplicate_facet_safe_repair(self):
        row=dict(self.row,archiveKinds=["interview","interview","press_clipping"])
        from news_pipeline_self_heal import repair
        self.assertEqual(repair([row],self.people),["article-1"])
        self.assertEqual(row["archiveKinds"],["interview","press_clipping"])

if __name__=="__main__": unittest.main()
