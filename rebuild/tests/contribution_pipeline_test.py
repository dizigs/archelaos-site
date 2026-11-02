"""Offline regression tests for the contribution research pipeline.

Run: python -m unittest discover -s rebuild/tests -p 'contribution_pipeline_test.py'
"""
import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1] / "tools"


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


extract = load("contribution_research")
search = load("search_contribution_leads")
draft = load("draft_contribution_research")


class ContributionPipelineTests(unittest.TestCase):
    def test_extract_event_and_deduplicate(self):
        sentence = "Ο Αρχέλαος κατέκτησε το Κύπελλο Ελλάδας το 1994 με σκορ 27-25."
        output = extract.analyze(sentence + "\n\n" + sentence)
        self.assertEqual(len(output["research_leads"]), 1)
        self.assertEqual(output["research_leads"][0]["verification_status"], "pending")
        self.assertIn("1994", output["research_leads"][0]["dates"])

    def test_external_query_does_not_include_private_excerpt(self):
        lead = {"excerpt": "Ο Αρχέλαος στο χάντμπολ το 1994. Ιδιωτικό τηλέφωνο 6999999999 και email test@example.com.",
                "dates": ["1994"]}
        query = search.safe_query(lead)
        self.assertIn("1994", query)
        self.assertIn("χάντμπολ", query)
        self.assertNotIn("6999999999", query)
        self.assertNotIn("test@example.com", query)
        self.assertNotIn("Ιδιωτικό", query)

    def test_drafts_remain_unpublished_and_unverified(self):
        leads = {"research_leads": [{"id": "abc", "excerpt": "Δοκιμαστικό ιστορικό γεγονός",
                                     "dates": ["1994"], "scores": []}]}
        found = {"results": [{"lead_id": "abc", "sources": [
            {"url": "https://example.org/source", "title": "Example"}]}]}
        output = draft.build(leads, found)
        self.assertEqual(len(output["drafts"]), 1)
        self.assertFalse(output["drafts"][0]["publishable"])
        self.assertEqual(output["drafts"][0]["verification_status"], "pending")
        self.assertEqual(output["drafts"][0]["biography_enrichment_candidates"], [])

    def test_no_source_means_no_draft(self):
        leads = {"research_leads": [{"id": "abc", "excerpt": "Unknown"}]}
        self.assertEqual(draft.build(leads, {"results": []})["drafts"], [])


if __name__ == "__main__":
    unittest.main()
