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
        result=module.candidates([row],self.people)
        self.assertFalse(result["interviews"])
        self.assertEqual(len(result["classification_suggestions"]),1)
        self.assertFalse(result["classification_suggestions"][0]["auto_publish"])
    def test_duplicate_facet_safe_repair(self):
        row=dict(self.row,archiveKinds=["interview","interview","press_clipping"])
        from news_pipeline_self_heal import repair
        self.assertEqual(repair([row],self.people),["article-1"])
        self.assertEqual(row["archiveKinds"],["interview","press_clipping"])

    def test_explicit_interview_title_review_only(self):
        row=dict(self.row,title="Συνέντευξη: Ο προπονητής μιλά για την ομάδα")
        result=module.candidates([row],self.people)
        self.assertEqual(result["schema_version"],2)
        self.assertEqual(result["classification_suggestions"][0]["proposed_kind"],"interview")
        self.assertEqual(result["classification_suggestions"][0]["editorial_status"],"needs_review")
        self.assertTrue(result["classification_suggestions"][0]["speaker_needs_verification"])
        self.assertEqual(result["interviews"],[])
        self.assertEqual(row.get("archiveKinds"),None)

    def test_press_clipping_title_review_only(self):
        row=dict(self.row,title="Απόκομμα Τύπου: Αρχέλαος 1994")
        result=module.candidates([row],self.people)
        self.assertEqual([s["proposed_kind"] for s in result["classification_suggestions"]],["press_clipping"])
        self.assertFalse(result["press_clippings"])

    def test_no_false_positive_press_conference(self):
        row=dict(self.row,title="Συνέντευξη Τύπου για το νέο πρωτάθλημα")
        self.assertFalse(module.candidates([row],self.people)["classification_suggestions"])

    def test_contextual_interview_not_interview_article(self):
        row=dict(self.row,title="Νέος πρόεδρος του συλλόγου",
                 summary="Σε σχετική συνέντευξη αναφέρθηκαν οι στόχοι του")
        self.assertFalse(module.candidates([row],self.people)["classification_suggestions"])

    def test_unverified_or_unsourced_never_suggested(self):
        row=dict(self.row,title="Συνέντευξη: προπονητής")
        self.assertFalse(module.candidates([dict(row,unverified=True)],self.people)["classification_suggestions"])
        self.assertFalse(module.suggest_archive_kinds(dict(row,sourceUrl="")))

    def test_dont_suggest_preapproved_kind(self):
        row=dict(self.row,title="Συνέντευξη: προπονητής",archiveKinds=["interview"])
        result=module.candidates([row],self.people)
        self.assertFalse(result["classification_suggestions"])
        self.assertEqual(len(result["interviews"]),1)

    def test_explicit_statement_review_only(self):
        row=dict(self.row,title="Δήλωση: Ο πρόεδρος του Αρχέλαου")
        result=module.candidates([row],self.people)
        self.assertEqual([s["proposed_kind"] for s in result["classification_suggestions"]],["statement"])
        self.assertFalse(result["interviews"])

if __name__=="__main__": unittest.main()
