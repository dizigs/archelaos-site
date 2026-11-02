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
match = load("match_contribution_records")


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

    def test_offline_matching_preserves_review_gate(self):
        leads = {"privacy": "internal_only", "research_leads": [{
            "id": "case1",
            "excerpt": "Το 1994 ο Αρχέλαος στο χάντμπολ κατέκτησε Κύπελλο 27-25 με τον Δημήτρη Σκούφα.",
            "dates": ["1994"], "scores": ["27-25"]
        }]}
        news = {"items": [
            {"id": "n1994", "date": "1994-05-22", "sport": "Χάντμπολ",
             "title": "Αρχέλαος Κύπελλο Ελλάδας", "summary": "Ο τελικός έληξε 27–25."},
            {"id": "n1993", "date": "1993-04-05", "sport": "Χάντμπολ",
             "title": "Αρχέλαος Κύπελλο Ελλάδας", "summary": "Ο τελικός έληξε 34–33."}
        ]}
        events = {"events": [
            {"id": "e1994", "sport": "handball", "title": "Κύπελλο Ελλάδας",
             "summary": "Τελικός 1994", "temporal": {"date": "1994-05-22"},
             "match": {"home_score": 27, "away_score": 25}},
            {"id": "e1993", "sport": "handball", "title": "Κύπελλο Ελλάδας",
             "summary": "Τελικός 1993", "temporal": {"date": "1993-04-05"},
             "match": {"home_score": 34, "away_score": 33}}
        ]}
        people = {"people": [
            {"id": "p1", "name": "Δημήτρης Σκούφας"}
        ]}
        result = match.reconcile(leads, news, events, people)
        row = result["matches"][0]
        self.assertEqual([x["id"] for x in row["news_candidates"]], ["n1994"])
        self.assertEqual([x["id"] for x in row["event_candidates"]], ["e1994"])
        self.assertEqual(row["person_candidates"][0]["candidates"][0]["id"], "p1")
        self.assertEqual(row["verification_status"], "pending")
        self.assertFalse(row["publishable"])
        self.assertNotIn("excerpt", str(row))

    def test_name_homonyms_are_not_resolved_automatically(self):
        people = [
            {"id": "p1", "name": "Γιώργος Παπαδόπουλος"},
            {"id": "p2", "name": "Γιώργος Παπαδόπουλος"},
        ]
        found = match.person_candidates("Ο Γιώργος Παπαδόπουλος αγωνίστηκε.", people)
        self.assertEqual(found[0]["status"], "homonym_requires_review")
        self.assertEqual(len(found[0]["candidates"]), 2)

    def test_no_match_from_club_name_alone_and_sport_conflict(self):
        lead = {"excerpt": "Ο Αρχέλαος Κατερίνης στο χάντμπολ το 2026.",
                "dates": ["2026"], "scores": []}
        unrelated = [{"id": "n", "date": "2026-03-01", "sport": "Πάλη",
                      "title": "Αρχέλαος Κατερίνης", "summary": "Εκδήλωση."}]
        self.assertEqual(match.candidate_matches(lead, unrelated, "news"), [])

    def test_private_schema_required(self):
        with self.assertRaises(ValueError):
            match.reconcile({"research_leads": []}, {"items": []},
                            {"events": []}, {"people": []})


if __name__ == "__main__":
    unittest.main()
