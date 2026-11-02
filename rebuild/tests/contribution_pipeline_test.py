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
links = load("build_archive_links")


class ContributionPipelineTests(unittest.TestCase):
    def test_extract_event_and_deduplicate(self):
        sentence = "Ο Αρχέλαος κατέκτησε το Κύπελλο Ελλάδας το 1994 με σκορ 27-25."
        output = extract.analyze(sentence + "\n\n" + sentence)
        self.assertEqual(len(output["research_leads"]), 1)
        self.assertEqual(output["research_leads"][0]["verification_status"], "pending")
        self.assertIn("1994", output["research_leads"][0]["dates"])

    def test_offline_research_query_never_copies_private_sentence(self):
        sentence = "Αγώνας 1994 με ιδιωτικό τηλέφωνο 6999999999 και email witness@example.com."
        lead = extract.analyze(sentence)["research_leads"][0]
        self.assertIn("1994", lead["search_query"])
        self.assertNotIn("6999999999", lead["search_query"])
        self.assertNotIn("witness@example.com", lead["search_query"])
        self.assertNotIn("ιδιωτικό", lead["search_query"].casefold())

    def test_external_query_does_not_include_private_excerpt(self):
        lead = {"excerpt": "Ο Αρχέλαος στο χάντμπολ το 1994. Ιδιωτικό τηλέφωνο 6999999999 και email test@example.com.",
                "dates": ["1994"]}
        query = search.safe_query(lead)
        self.assertIn("1994", query)
        self.assertIn("χάντμπολ", query)
        self.assertNotIn("6999999999", query)
        self.assertNotIn("test@example.com", query)
        self.assertNotIn("Ιδιωτικό", query)

    def test_merged_basketball_stays_out_of_external_research(self):
        lead = {"id": "merged", "excerpt": "ΣΦΚ Πιερικός Αρχέλαος μπάσκετ 2026.",
                "dates": ["2026"]}
        self.assertIsNone(search.safe_query(lead))

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


    def test_interviews_and_all_archive_sections_are_matching_inputs(self):
        leads = {"privacy": "internal_only", "research_leads": [
            {"id": "i", "excerpt": "Το 1993 ο Χρήστος Ελευθερούδης μίλησε για την ιστορική ευρωπαϊκή αποστολή στο Τίτο Βέλες.", "dates": ["1993"], "scores": []},
            {"id": "s", "excerpt": "Το 1994 οι άστεγοι Κυπελλούχοι αγωνίζονταν χωρίς κλειστό γήπεδο.", "dates": ["1994"], "scores": []},
            {"id": "m", "excerpt": "Η ίδρυση του συλλόγου έγινε το 1956 από τον Γεώργιο Ευθυμίου.", "dates": ["1956"], "scores": []},
            {"id": "a", "excerpt": "Το 1968 καθιερώθηκαν τα πράσινα και κίτρινα χρώματα της ταυτότητας.", "dates": ["1968"], "scores": []},
        ]}
        collections = {
            "interview": {"items": [
                {"id": "q1", "name": "Χρήστος Ελευθερούδης",
                 "event": "Ιστορική ευρωπαϊκή αποστολή στο Τίτο Βέλες",
                 "year": "1993",
                 "qa": [{"question": "Απόρρητο απόσπασμα;", "answer": "Αυθαίρετη πληροφορία"}]},
            ]},
            "story": {"stories": [
                {"title": "Οι άστεγοι Κυπελλούχοι", "year": "1994",
                 "sport": "Χειροσφαίριση", "lead": "Χωρίς κλειστό γήπεδο"},
            ]},
            "moment": {"moments": [
                {"id": 1, "year": "1956", "title": "Η ίδρυση του συλλόγου",
                 "body": ["Ο Γεώργιος Ευθυμίου υπέγραψε το καταστατικό."]},
            ]},
            "museum": {"articles": [
                {"id": "colors", "title": "Τα χρώματα της ταυτότητας",
                 "period": "1968", "html": "<p>Πράσινα και κίτρινα χρώματα</p>"},
            ]},
        }
        result = match.reconcile(leads, {"items": []}, {"events": []},
                                 {"people": []}, collections)
        i, s, m, a = result["matches"]
        self.assertEqual(i["interview_candidates"][0]["id"], "q1")
        self.assertTrue(s["story_candidates"][0]["id"].startswith("story-title-"))
        self.assertTrue(s["story_candidates"][0]["internal_provisional_id"])
        self.assertEqual(m["moment_candidates"][0]["id"], 1)
        self.assertEqual(a["museum_candidates"][0]["id"], "colors")
        self.assertTrue(all(not x["publishable"] for x in result["matches"]))
        self.assertNotIn("Αυθαίρετη πληροφορία", str(result))
        self.assertNotIn("Απόρρητο απόσπασμα", str(result))

    def test_interview_quotes_are_not_treated_as_verified_event_facts(self):
        records = match.normalize_collection(
            {"items": [{"id": "q", "name": "Απόστολος Παπαδόπουλος",
                        "event": "Συνέντευξη για τον ευρωπαϊκό αγώνα το 1993",
                        "year": "1993",
                        "qa": [{"question": "Ποιος νίκησε;",
                                "answer": "Δοκιμαστική επινόηση για απόκρυψη"}]}]},
            "interview")
        self.assertNotIn("Δοκιμαστική επινόηση", str(records))
        self.assertEqual(match.candidate_matches(
            {"excerpt": "Δοκιμαστική επινόηση για απόκρυψη το 1993.",
             "dates": ["1993"], "scores": []}, records, "interview"), [])


    def test_reverse_links_from_existing_identifiers_only(self):
        canonical = {"people": [
            {"id": "p1", "name": "Πρόσωπο Πρώτο"},
            {"id": "p2", "name": "Πρόσωπο Δεύτερο"}
        ]}
        catalogs = {
            "news": {"items": [
                {"id": "n1", "title": "Αθλητική είδηση", "personIds": ["p1", "p1"]},
            ]},
            "interview": {"items": [
                {"id": "q1", "name": "Ανεπιβεβαίωτη συνέντευξη",
                 "needsReview": True, "personIds": ["p1"]},
                {"id": "q2", "name": "Ελεγμένη ταυτότητα",
                 "needsReview": False, "personIds": ["p2"],
                 "relatedPeople": [{"id": "p2", "name": "Πρόσωπο Δεύτερο"}]},
            ]},
            "story": {"stories": [
                {"title": "Μια ιστορική αφήγηση", "relatedPeople": ["p1", "p2", "unknown"]},
            ]},
            "moment": {"moments": [{"id": 1, "title": "Η ίδρυση του Αρχέλαου"}]},
            "museum": {"articles": [{"id": "intro", "title": "Εισαγωγή"}]},
        }
        output = links.link_proposals(canonical, catalogs)
        self.assertEqual(output["record_counts"], {"interview": 1, "news": 1, "story": 1})
        self.assertNotIn("interview:q1", output["people_by_record"])
        self.assertIn("interview:q2", output["records_by_person"]["p2"])
        self.assertIn("news:n1", output["records_by_person"]["p1"])
        self.assertEqual(output["people_by_record"]["news:n1"]["person_ids"], ["p1"])
        self.assertEqual(len(output["missing_canonical_ids"]), 1)
        self.assertFalse(output["people_by_record"]["interview:q2"]["publishable"])
        self.assertTrue(output["people_by_record"][next(
            x for x in output["people_by_record"] if x.startswith("story:"))]["provisional_record_id"])

    def test_reverse_link_ids_must_be_unique(self):
        with self.assertRaises(ValueError):
            links.link_proposals(
                {"people": [{"id": "p1"}, {"id": "p1"}]}, {})

    def test_private_schema_required(self):
        with self.assertRaises(ValueError):
            match.reconcile({"research_leads": []}, {"items": []},
                            {"events": []}, {"people": []})


if __name__ == "__main__":
    unittest.main()
