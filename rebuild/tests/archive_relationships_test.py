#!/usr/bin/env python3
"""Reciprocal archive-link integrity and mutation regression tests."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location("archive_graph",ROOT/"rebuild/tools/build_archive_relationships.py")
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
read=lambda path:json.loads((ROOT/path).read_text(encoding="utf-8"))

class ArchiveRelationshipTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data=dict(
            people=read("hall-of-fame-people.json")["people"],
            news=read("news.json")["items"],
            moments=read("rebuild/data/moments.json")["moments"],
            stories=read("rebuild/data/stories.json")["stories"],
            interviews=read("rebuild/data/interviews.json")["items"],
            museum=read("rebuild/data/museum.json"),
            home=read("rebuild/data/home.json")["sports"],
            history=read("archelaos-history-events.json")["events"])
    def test_full_graph_and_reciprocal_links(self):
        graph=module.compile_graph(**self.data)
        self.assertGreaterEqual(graph["counts"]["nodes"],1000)
        self.assertEqual(graph["counts"]["edges"],len(graph["edges"]))
        for edge in graph["edges"]:
            a,b=edge["a"],edge["b"]
            self.assertIn({"key":b,"relation":edge["relation"]},graph["by_node"][a])
            self.assertIn({"key":a,"relation":edge["relation"]},graph["by_node"][b])
        self.assertTrue(all(k.startswith(n["type"]+":") for k,n in graph["nodes"].items()))
    def test_croatia_is_one_event_connected_to_its_four_people(self):
        graph=module.compile_graph(**self.data)
        n="news:archery-central-european-cup-novi-marof-2025"
        e="event:central-european-cup-novi-marof-2025"
        expected={"arch-955a386f547f","arch-konstantinos-charisis-arch",
                  "arch-6212ba5ea7f1","arch-44ef21dfb9b7"}
        self.assertIn({"key":e,"relation":"news_evidence"},graph["by_node"][n])
        actual={v["key"].split(":",1)[1] for v in graph["by_node"][n]
                if v["relation"]=="named_in_news"}
        self.assertEqual(expected,actual)
        self.assertTrue(graph["nodes"][e]["url"].endswith("archery-central-european-cup-novi-marof-2025"))
        self.assertIn({"key":"department:archery","relation":"department_news"},graph["by_node"][n])
    def test_existing_stories_interviews_and_moments_are_linked(self):
        graph=module.compile_graph(**self.data)
        self.assertIn({"key":"person:arch-803dd3926e77","relation":"story_person"},graph["by_node"]["story:1"])
        self.assertIn({"key":"event:handball-cup-1990","relation":"story_event"},graph["by_node"]["story:1"])
        self.assertIn({"key":"moment:59","relation":"interview_moment"},graph["by_node"]["interview:q1"])
    def test_reject_unknown_person_and_event(self):
        data=copy.deepcopy(self.data)
        data["news"][0]["personIds"]=["arch-does-not-exist"]
        with self.assertRaisesRegex(ValueError,"Unknown person"):module.compile_graph(**data)
        data=copy.deepcopy(self.data)
        data["stories"][0]["relatedEvents"]=["invented-event"]
        with self.assertRaisesRegex(ValueError,"unknown event"):module.compile_graph(**data)
    def test_no_private_or_unverified_news(self):
        data=copy.deepcopy(self.data)
        data["news"].append({"id":"private-test","title":"not approved",
                             "unverified":True,"personIds":[]})
        graph=module.compile_graph(**data)
        self.assertNotIn("news:private-test",graph["nodes"])
        self.assertNotIn("private-test",json.dumps(graph))

if __name__=="__main__":unittest.main()
