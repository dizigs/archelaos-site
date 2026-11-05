#!/usr/bin/env python3
"""Issue #125: two explicitly distinct athletes must never share person IDs."""
from __future__ import annotations

import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
OLD_ID = "arch-2616694d9908"
NEW_ID = "arch-nikos-zinisa-savvas-wrestling"
DUAL = (
    "wrestling-u15-prosotsani-zinisa-march-2025",
    "wrestling-prosotsani-u11-u13-nov-2023",
)


def load_json(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


class ZinisaIdentitySeparationTests(unittest.TestCase):
    def setUp(self):
        self.hall = load_json("hall-of-fame-people.json")
        self.news = load_json("news.json")
        self.people = {p["id"]: p for p in self.hall["people"]}
        self.items = {x["id"]: x for x in self.news["items"]}

    def test_hall_count_ids_and_distinct_biographies(self):
        self.assertEqual(self.hall["count"], len(self.hall["people"]))
        self.assertEqual(len(self.people), len(self.hall["people"]))
        self.assertEqual(self.hall["count"], 772)
        self.assertNotEqual(OLD_ID, NEW_ID)
        old, young = self.people[OLD_ID], self.people[NEW_ID]
        self.assertIn("Κωνσταντίνου", old["name"])
        self.assertIn("Σάββα", young["name"])
        self.assertIn("Ευρωπαϊκό", old["bio"])
        self.assertNotIn("Ευρωπαϊκό", young["bio"])
        self.assertIn("Πορόια", young["bio"])
        self.assertNotIn("Πορόια", old["bio"])
        self.assertIn("katerini.gr", json.dumps(old["refs"]))
        self.assertIn("124780", json.dumps(young["refs"]))

    def test_exact_article_identity_links_and_no_duplicate_news(self):
        self.assertEqual(len(self.items), len(self.news["items"]))
        for event in DUAL:
            with self.subTest(event=event):
                ids = self.items[event]["personIds"]
                self.assertIn(OLD_ID, ids)
                self.assertIn(NEW_ID, ids)
                self.assertEqual(ids.count(OLD_ID), 1)
                self.assertEqual(ids.count(NEW_ID), 1)
        porroia = self.items["wrestling-u15-porroia-silver-2026"]
        self.assertIn(NEW_ID, porroia["personIds"])
        self.assertNotIn(OLD_ID, porroia["personIds"])
        self.assertEqual(porroia["sourceUrl"], "https://pieriasocial.gr/?p=124780")
        bronze = self.items["wrestling-u15-european-bronze-loutraki-2024"]
        self.assertIn(OLD_ID, bronze["personIds"])
        self.assertNotIn(NEW_ID, bronze["personIds"])
        for article in self.news["items"]:
            ids = article.get("personIds") or []
            self.assertEqual(len(ids), len(set(ids)), article["id"])
            self.assertTrue(set(ids).issubset(self.people), article["id"])

    def test_ambiguous_bare_name_does_not_link_to_either_athlete(self):
        index = load_json("archelaos-person-index.json")
        people = [x for x in index if x["id"] in (OLD_ID, NEW_ID)]
        self.assertEqual(len(people), 2)
        # The automatic mention linker ingests both the displayed name and
        # every names[] alias. Bare mentions must not resolve to either person.
        ambiguous = {"Νίκος Ζινίσα", "Νικόλαος Ζινίσα"}
        for person in people:
            self.assertNotIn(person["name"], ambiguous)
            self.assertTrue(ambiguous.isdisjoint(person.get("names", [])))
            self.assertTrue(all("του " in alias for alias in person["names"]))
        self.assertTrue(any("Κωνσταντίνου" in a for a in people[0]["names"]))
        self.assertTrue(any("Σάββα" in a for a in people[1]["names"]))

    def test_indexes_and_sitemap_preserve_old_deep_links(self):
        index = load_json("archelaos-person-index.json")
        search = load_json("search-index.json")["records"]
        self.assertEqual(len(index), self.hall["count"])
        self.assertEqual(len([r for r in search if r["type"] == "person"]), self.hall["count"])
        for person_id in (OLD_ID, NEW_ID):
            self.assertEqual(len([r for r in index if r["id"] == person_id]), 1)
            self.assertEqual(
                len([r for r in search if r.get("href") == f"hall-of-fame.html?person={person_id}"]),
                1,
            )
            sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
            self.assertEqual(sitemap.count(f"/people/{person_id}.html</loc>"), 1)
        aliases = load_json("hall-of-fame-person-aliases.json")["aliases"]
        self.assertNotIn(OLD_ID, aliases)
        self.assertNotIn(NEW_ID, aliases)
        self.assertNotEqual(aliases.get(OLD_ID), NEW_ID)

    def test_standalone_root_and_staged_profiles_and_json_ld(self):
        for person_id in (OLD_ID, NEW_ID):
            with self.subTest(person_id=person_id):
                for path in (
                    ROOT / "people" / (person_id + ".html"),
                    ROOT / "rebuild/source-profiles" / (person_id + ".html"),
                ):
                    source = path.read_text(encoding="utf-8")
                    self.assertIn(f"/people/{person_id}.html", source)
                    self.assertIn(self.people[person_id]["name"], source)
                    self.assertIn(self.people[person_id]["bio"].split("\n")[0][:90], source)
                    tags = re.findall(
                        r'<script type="application/ld\+json">(.*?)</script>', source, re.DOTALL,
                    )
                    self.assertEqual(len(tags), 1)
                    ld = json.loads(tags[0])
                    self.assertEqual(ld["@type"], "Person")
                    self.assertEqual(ld["name"], self.people[person_id]["name"])
                    self.assertIn(person_id + ".html", ld["url"])
                    self.assertEqual(ld["description"], self.people[person_id]["bio"])
        old_root = (ROOT / "people" / (OLD_ID + ".html")).read_text(encoding="utf-8")
        self.assertNotIn("Πορόια Σερρών (22 Μαρτίου 2026)", old_root)

    def test_legacy_and_history_keep_id_and_parity(self):
        legacy = load_json("rebuild/data/people.json")
        english = load_json("rebuild/i18n/content/en/people.json")
        self.assertEqual(legacy["count"], len(legacy["people"]))
        self.assertEqual(len(english["people"]), len(legacy["people"]))
        historical = {p["id"]: p for p in legacy["people"]}
        self.assertIn(OLD_ID, historical)
        self.assertNotIn(NEW_ID, historical)
        self.assertEqual(historical[OLD_ID]["bio"], self.people[OLD_ID]["bio"])
        events = {e["id"]: e for e in load_json("archelaos-history-events.json")["events"]}
        self.assertIn(OLD_ID, events["archive-0199"]["people"])
        self.assertNotIn(OLD_ID, events["archive-0215"]["people"])
        self.assertNotIn(NEW_ID, events["archive-0215"]["people"])


if __name__ == "__main__":
    unittest.main()
