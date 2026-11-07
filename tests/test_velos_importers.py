import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]

def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class VelosTests(unittest.TestCase):
    def test_catalogue_validates_and_deduplicates(self):
        m = load("sync_velos_catalogue")
        result = m.extract({"data": [
            {"match_id": 8, "match_date": "0000-00-00", "match_name": "Test"},
            {"match_id": 8, "match_date": "2025-12-20", "match_name": "Revised"},
            {"match_id": "bad"}, {"match_id": 9, "match_date": "2024-01-03"}
        ]})
        self.assertEqual(len(result["matches"]), 2)
        self.assertEqual(result["matches"][-1]["name"], "Revised")
        self.assertEqual([x["matchId"] for x in result["matches"]], [9, 8])

    def test_results_only_archelaos(self):
        m = load("sync_velos_archery")
        sample = {"match_id": 800, "matchLeagues": [{"league_id": 1, "league": {"league_name": "Recurve"}}],
                  "matchPlayers": [
                      {"match_player_id": 1, "playerName": "Alpha", "teamName": "Γ.Α.Σ. ΑΡΧΕΛΑΟΣ",
                       "league_id": 1, "player": {"player_id": 4}, "total_rank": 2, "total_score": 500},
                      {"match_player_id": 2, "playerName": "Beta", "teamName": "Other club",
                       "league_id": 1, "player": {"player_id": 5}}]}
        out = m.extract(sample)
        self.assertEqual(len(out["results"]), 1)
        self.assertEqual(out["results"][0]["externalPlayerId"], 4)
        self.assertEqual(out["results"][0]["leagueName"], "Recurve")

    def test_athlete_index_merges_matches_without_hall_ids(self):
        m = load("build_velos_athletes")
        result = m.build({"matches": [
            {"matchId": 7, "date": "2025-01-02", "sourceUrl": "source",
             "results": [{"externalPlayerId": 2, "name": "Alpha", "matchPlayerId": 10}]},
            {"matchId": 8, "date": "2025-02-02", "sourceUrl": "source",
             "results": [{"externalPlayerId": 2, "name": "Alpha", "matchPlayerId": 11}]}
        ]})
        self.assertEqual(len(result["athletes"]), 1)
        self.assertEqual(len(result["athletes"][0]["matches"]), 2)
        self.assertIsNone(result["athletes"][0]["hallPersonId"])

if __name__ == "__main__":
    unittest.main()
