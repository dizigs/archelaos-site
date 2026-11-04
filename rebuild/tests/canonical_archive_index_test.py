"""Tests for approved-only canonical archive indexing, reverse navigation and no guessing."""
import pathlib
import sys
import unittest

TOOLS = pathlib.Path(__file__).resolve().parents[1] / "tools"
sys.path.insert(0, str(TOOLS))
from build_canonical_archive_index import build_index


def fixtures():
    events = {
        "source_registry": [{"id": "s1", "title": "Official record",
                             "provider": "Federation", "url": "https://example.org/source"}],
        "events": [
            {"id": "e1", "title": "Κύπελλο 1994", "summary": "Επιτυχία",
             "sport": "handball", "temporal": {"date": "1994-05-22"},
             "editorial_status": "approved", "source_ids": ["s1"],
             "associations": {"people": [
                 {"person_id": "p1", "source_id": "s1", "role": "αθλητής"}]}},
            {"id": "e2", "title": "Εκκρεμές 1995", "summary": "Αναμονή",
             "sport": "handball", "temporal": {"year": "1995"},
             "verification": "source_checked", "source_ids": ["s1"],
             "associations": {"people": []}},
        ],
    }
    news = {"items": [
        {"id": "n1", "title": "Είδηση", "date": "1994-05-22",
         "sport": "Χάντμπολ", "personIds": ["p1", "p1"],
         "eventIds": ["e1"], "sourceUrl": "https://example.org/article"},
        {"id": "n2", "title": "Άλλο γεγονός", "date": "1995-01-01",
         "sport": "Χάντμπολ", "personIds": ["p2", "missing"],
         "eventIds": ["e2"], "sourceUrl": "https://example.org/article"},
        {"id": "n3", "title": "Μια ημερομηνία", "date": "1994-05-22",
         "sport": "Χάντμπολ", "personIds": ["p2"]},
    ]}
    people = {"people": [{"id": "p1", "name": "Αθλητής Πρώτος"},
                         {"id": "p2", "name": "Αθλητής Δεύτερος"}]}
    return events, news, people


class ArchiveIndexTests(unittest.TestCase):
    def test_explicit_approved_event_bidirectional_links(self):
        result = build_index(*fixtures())
        self.assertEqual(result["stats"]["approved_event_count"], 1)
        self.assertEqual(result["events"]["e1"]["article_ids"], ["n1"])
        self.assertEqual(result["events"]["e1"]["person_ids"], ["p1"])
        self.assertEqual(result["article_to_events"]["n1"], ["e1"])
        self.assertEqual(result["person_to_articles"]["p1"], ["n1"])
        self.assertEqual(result["person_to_events"]["p1"], ["e1"])
        self.assertEqual(result["articles"]["n1"]["person_ids"], ["p1"])
        self.assertEqual(result["timeline_cards"][0]["date_label"], "1994-05-22")
        self.assertTrue(result["timeline_cards"][0]["popup_only"])

    def test_source_checked_is_not_editorial_approval(self):
        result = build_index(*fixtures())
        self.assertEqual(result["excluded_event_ids"], ["e2"])
        self.assertNotIn("e2", result["events"])
        self.assertEqual(result["unresolved_event_references"], [
            {"article_id": "n2", "event_id": "e2", "reason": "not_approved_or_unknown"}
        ])
        self.assertEqual(result["article_to_events"]["n2"], [])
        # n3 has same date/sport as e1 but NO explicit event ID; it stays unlinked.
        self.assertEqual(result["article_to_events"]["n3"], [])

    def test_missing_person_and_shared_url_never_merge_silently(self):
        result = build_index(*fixtures())
        self.assertEqual(result["unresolved_person_references"],
                         [{"article_id": "n2", "person_id": "missing"}])
        self.assertEqual(len(result["possible_duplicate_source_urls"]), 1)
        self.assertEqual(result["possible_duplicate_source_urls"][0]["article_ids"],
                         ["n1", "n2"])
        self.assertEqual(result["stats"]["article_count"], 3)
        self.assertEqual(result["publication_scope"], "preview_only")

    def test_reject_duplicate_canonical_ids(self):
        events, news, people = fixtures()
        news["items"].append(dict(news["items"][0]))
        with self.assertRaisesRegex(ValueError, "Duplicate news article ID"):
            build_index(events, news, people)

    def test_no_source_cannot_make_event_public(self):
        events, news, people = fixtures()
        events["events"][0]["source_ids"] = ["missing-source"]
        result = build_index(events, news, people)
        self.assertEqual(result["events"], {})
        self.assertEqual(result["stats"]["approved_event_count"], 0)


    def test_cross_section_reverse_links_keep_review_gate(self):
        events, news, people = fixtures()
        collections = {
            "interview": {"items": [
                {"id": "i1", "name": "Συνέντευξη", "personIds": ["p1"],
                 "needsReview": False},
                {"id": "i2", "name": "Σε έλεγχο", "personIds": ["p2"],
                 "needsReview": True},
            ]},
            "story": {"stories": [
                {"title": "Αφήγηση", "relatedPeople": ["p2"]},
            ]},
            "moment": {"moments": [
                {"id": 1, "title": "Ιστορική στιγμή", "personIds": ["p1"]},
            ]},
            "museum": {"articles": [
                {"id": "m1", "title": "Μουσείο", "relatedPeople": ["p2"]},
            ]},
        }
        result = build_index(events, news, people, collections)
        self.assertIn("interview:i1", result["person_to_archive_records"]["p1"])
        self.assertNotIn("interview:i2", result["archive_record_to_people"])
        self.assertIn("moment:1", result["person_to_archive_records"]["p1"])
        self.assertIn("museum:m1", result["person_to_archive_records"]["p2"])
        stories = [ref for ref in result["person_to_archive_records"]["p2"]
                   if ref.startswith("story:")]
        self.assertEqual(len(stories), 1)
        self.assertTrue(result["archive_record_to_people"][stories[0]]["provisional_record_id"])
        self.assertFalse(result["archive_record_to_people"][stories[0]]["publishable"])


if __name__ == "__main__":
    unittest.main()
