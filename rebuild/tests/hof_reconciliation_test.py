"""Issue #57: lossless projection, reviewed conflicts and dynamic canonical IDs."""
from html import escape
import json
from pathlib import Path
import re
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "rebuild/tools"))
from hof_biography import correct_name, normalized, sync_biography
from hof_reconcile import current_report, digest, indexed, reconcile
from build_event_graph import compile_graph
import build_event_graph


def page(text, language="el"):
    return f'<section data-profile-language="{language}"><div class="bio">{escape(text)}</div></section>'


class LosslessProjectionTests(unittest.TestCase):
    def test_expands_old_summary_to_new_canonical_not_reverse(self):
        old = "Αθλητής του συλλόγου."
        new = old + "\n\nΤεκμηριωμένη νεότερη διάκριση."
        self.assertIn(escape(new), sync_biography(page(old), new, "el"))
        self.assertEqual(sync_biography(page(new), old, "el"), page(new))

    def test_independent_richer_archival_facts_are_not_deleted(self):
        source = page("Παλαιότερο βιογραφικό με αυτοτελή τεκμήρια.")
        self.assertEqual(sync_biography(source, "Σύντομη νεότερη περίληψη.", "el"), source)

    def test_conflicting_rank_is_not_overwritten(self):
        source = page("Δεύτερος το 1994· η κατάταξη χρειάζεται διασταύρωση.")
        self.assertEqual(sync_biography(source, "Πρωταθλητής το 1994.", "el"), source)

    def test_english_entities_and_newlines_do_not_block_safe_expansion(self):
        self.assertIn("New fact.", sync_biography(page("Club's athlete.", "en"),
                                                 "Club's athlete.\n\nNew fact.", "en"))

    def test_spelling_is_corrected_without_deleting_archive(self):
        result = sync_biography(page("Χρήστος Λυμπανοβνός: ιστορικό τεκμήριο."), "Άλλη περίληψη.", "el")
        self.assertIn("Χρήστος Λιμπανοβνός: ιστορικό τεκμήριο.", result)
        self.assertEqual(correct_name("Christos Lympanovnos"), "Christos Limpanovnos")

    def test_empty_canonical_or_archive_never_destroys_text(self):
        self.assertEqual(sync_biography(page("Ιστορία"), "", "el"), page("Ιστορία"))
        self.assertEqual(sync_biography(page(""), "Νέο", "el"), page(""))

    def test_repeated_build_projection_is_idempotent(self):
        result = sync_biography(page("Old."), "Old.\n\nNew.", "el")
        self.assertEqual(sync_biography(result, "Old.\n\nNew.", "el"), result)

    def test_dynamic_inventory_includes_all_people_after_682(self):
        people = [{"id": f"person-{n}", "name": str(n), "bio": "history"} for n in range(719)]
        master = {"count": len(people), "people": people}
        old = {"count": 682, "people": people[:682]}
        result = reconcile(master, old, {})
        self.assertEqual(result["counts"]["canonical"], 719)
        self.assertEqual(result["canonical_only_ids"], sorted(p["id"] for p in people[682:]))

    def test_duplicate_ids_and_false_count_fail_closed(self):
        for document in [{"count": 2, "people": [{"id": "p"}]},
                         {"count": 2, "people": [{"id": "p"}, {"id": "p"}]}]:
            with self.assertRaises(ValueError):
                indexed(document)

    def test_unknown_difference_requires_explicit_review(self):
        a = {"count": 1, "people": [{"id": "p", "name": "N", "bio": "New claim."}]}
        b = {"count": 1, "people": [{"id": "p", "name": "N", "bio": "Different old fact."}]}
        self.assertEqual(reconcile(a, b, {})["counts"]["classifications"], {"UNREVIEWED": 1})

    def test_changed_manual_evidence_invalidates_approval(self):
        a = {"count": 1, "people": [{"id": "p", "bio": "New", "name": "N"}]}
        b = {"count": 1, "people": [{"id": "p", "bio": "Old", "name": "N"}]}
        decisions = {"p": {"bio": {"legacy_sha256": digest("Old"), "canonical_sha256": digest("Before edit")}}}
        with self.assertRaisesRegex(ValueError, "Stale manual review"):
            reconcile(a, b, decisions)

    def test_new_canonical_id_is_usable_by_approved_event_graph(self):
        people = [{"id": f"p{n}", "name": f"Person {n}"} for n in range(683)]
        catalog = {"source_registry": [{"id": "s", "title": "Record", "provider": "Club", "url": "https://example.org"}],
                   "events": [{"id": "e", "title": "Title", "summary": "Summary", "sport": "archery",
                               "temporal": {"year": "2026"}, "editorial_status": "approved", "source_ids": ["s"],
                               "associations": {"people": [{"person_id": "p682", "source_id": "s", "role": "athlete"}]}}]}
        self.assertEqual(compile_graph(catalog, people)["by_event"], {"e": ["p682"]})
        self.assertEqual(compile_graph(catalog, people[:682])["events"], [])
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            stage = root / "rebuild"
            (stage / "research").mkdir(parents=True)
            (stage / "data").mkdir()
            (stage / "research/historical-events.json").write_text(json.dumps(catalog))
            (root / "hall-of-fame-people.json").write_text(json.dumps({"people": people}))
            (stage / "data/people.json").write_text(json.dumps({"people": people[:682]}))
            output = stage / "test-artifacts/graph.json"
            with patch.object(build_event_graph, "ROOT", stage), patch.object(sys, "argv", ["build_event_graph.py", "--json", str(output)]):
                build_event_graph.main()
            self.assertEqual(json.loads(output.read_text())["by_event"], {"e": ["p682"]})


class RepositoryReconciliationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.people = indexed(json.loads((ROOT / "hall-of-fame-people.json").read_text()))

    def test_committed_review_matches_actual_source_hashes(self):
        report = current_report()
        self.assertEqual(json.loads((ROOT / "docs/research/hof-canonical-reconciliation-20261103.json").read_text()), report)
        self.assertEqual(report["historical_only_ids"], [])
        self.assertNotIn("UNREVIEWED", report["counts"]["classifications"])

    def test_limpanovnos_canonical_identity(self):
        self.assertEqual(self.people["arch-f56820c52e55"]["name"], "Χρήστος Λιμπανοβνός")

    def test_tortopidis_both_languages_keep_conflict_and_neutral_participation(self):
        person = self.people["arch-3fe6e9ae9b29"]
        for key, neutral, caveat in [("bio", "συμμετοχή", "προς διασταύρωση"),
                                     ("bio_en", "competed", "remains unresolved")]:
            self.assertIn(neutral, person[key].split("\n\n")[0])
            self.assertIn(caveat, person[key])
        self.assertIn("δεύτερη ομαδική", person["bio"])
        self.assertIn("second-place team", person["bio_en"])

    def test_restored_team_roster_has_same_approved_news_evidence(self):
        person = self.people["arch-f6152b60c43f"]
        article = next(x for x in json.loads((ROOT / "news.json").read_text())["items"]
                       if x["id"] == "archery-national-oaka-team-title-2025")
        for name in ["Ευάγγελο Χαρίση", "Χαράλαμπο Ιακωβίδη", "Ευάγγελο Μαρινόπουλο"]:
            self.assertIn(name, person["bio"])
        self.assertIn("5 July 2025", person["bio_en"])
        self.assertIn(article["sourceUrl"], [r["url"] for r in person["refs"]])

    def test_generated_public_identity_sets_are_complete(self):
        dist = ROOT / "dist"
        self.assertTrue(dist.is_dir(), "Build the release before running integration tests")
        expected = set(self.people)
        public = indexed(json.loads((dist / "hall-of-fame-people.json").read_text()))
        index = {p["id"] for p in json.loads((dist / "archelaos-person-index.json").read_text())}
        profiles = {p.stem for p in (dist / "people").glob("arch-*.html")}
        sitemap = {x.text.rsplit("/", 1)[-1][:-5] for x in ET.parse(dist / "sitemaps/people.xml").findall(".//{*}loc")}
        # The old root entry point has a static index; the deployed rebuild
        # derives search records at runtime (covered by the browser regression).
        search = json.loads((ROOT / "search-index.json").read_text())["records"]
        search_ids = {parse_qs(urlsplit(p["href"]).query)["person"][0]
                      for p in search if p.get("type") == "person"}
        for actual in [set(public), index, profiles, sitemap, search_ids]:
            self.assertEqual(actual, expected)

    def test_release_never_reverts_to_archival_summary(self):
        for pid, person in self.people.items():
            source = ROOT / "rebuild/source-profiles" / (pid + ".html")
            if not source.is_file():
                continue
            generated = (ROOT / "dist/people" / (pid + ".html")).read_text()
            for lang, key in [("el", "bio"), ("en", "bio_en")]:
                pattern = r'<section\b[^>]*data-profile-language="' + lang + r'"[^>]*>.*?<div class="bio">(.*?)</div>'
                before = re.search(pattern, source.read_text(), re.S)
                after = re.search(pattern, generated, re.S)
                self.assertIsNotNone(after, pid + "/" + lang)
                if before and normalized(before[1]) and normalized(before[1]) in normalized(person.get(key, "")):
                    self.assertEqual(normalized(after[1]), normalized(person[key]), pid + "/" + lang)
                elif before:
                    # Archival additions are appended later; the original text
                    # must survive when no lossless substitution is possible.
                    self.assertIn(normalized(before[1]), normalized(after[1]), pid + "/" + lang)

    def test_verified_profile_addenda_are_not_duplicated_by_projection(self):
        additions = json.loads((ROOT / "rebuild/data/people-addenda.json").read_text())["entries"]
        for pid, rows in additions.items():
            output = (ROOT / "dist/people" / (pid + ".html")).read_text()
            for lang in ("el", "en"):
                section = re.search(r'<section\b[^>]*data-profile-language="' + lang
                                    + r'"[^>]*>.*?<div class="bio">(.*?)</div>', output, re.S)[1]
                for row in rows:
                    self.assertEqual(normalized(section).count(normalized(row[lang])), 1, pid + "/" + lang)


if __name__ == "__main__":
    unittest.main()
