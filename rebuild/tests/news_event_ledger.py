import importlib.util
import pathlib
import unittest
ROOT=pathlib.Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location("news_event_ledger", ROOT/"rebuild/tools/build_news_event_candidates.py")
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class LedgerTests(unittest.TestCase):
    def setUp(self): self.people=[{"id":"one"},{"id":"two"}]
    def article(self,**kwargs):
        base={"id":"a","date":"2026-11-01","sport":"Πάλη","title":"Αποτελέσματα","personIds":["one"]}
        return base|kwargs
    def test_stable_id_and_status(self):
        event=module.event_candidates([self.article()],self.people)["events"][0]
        self.assertEqual(event["id"],"news-a")
        self.assertEqual(event["editorial_status"],"candidate")
        self.assertIsNone(event["event_date"])
    def test_same_event_multiple_articles(self):
        events=module.event_candidates([self.article(id="a",eventId="tournament-2026"),self.article(id="b",eventId="tournament-2026",personIds=["two"])],self.people)["events"]
        self.assertEqual(len(events),1)
        self.assertEqual(events[0]["person_ids"],["one","two"])
        self.assertEqual(len(events[0]["sources"]),2)
    def test_unknown_person_blocks(self):
        with self.assertRaises(ValueError):
            module.event_candidates([self.article(personIds=["missing"])],self.people)
    def test_no_silent_sport_merge(self):
        with self.assertRaises(ValueError):
            module.event_candidates([self.article(id="a",eventId="shared"),self.article(id="b",eventId="shared",sport="Χάντμπολ")],self.people)
if __name__=="__main__":unittest.main()
