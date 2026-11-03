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
from hof_biography import correct_name, include_addenda, normalized, ensure_biography_sections, sync_biography
from hof_reconcile import REVIEW_CLASSIFICATIONS, current_report, digest, indexed, reconcile
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

    def test_missing_required_language_fails_with_profile_context(self):
        for language in ("el", "en"):
            with self.subTest(language=language), self.assertRaisesRegex(
                    ValueError, "Missing " + language + " biography section in arch-test"):
                sync_biography("<main>No biography</main>", "Required text", language, profile_id="arch-test")

    def test_missing_optional_empty_language_is_unchanged(self):
        self.assertEqual(sync_biography("<main>Archive</main>", "", "en"), "<main>Archive</main>")

    def test_legacy_root_template_gains_existing_canonical_english(self):
        person = {"id": "arch-test", "bio_en": "Club's athlete <safe>."}
        result = ensure_biography_sections('<main><div class="bio">Αρχικό τεκμήριο.</div><a>Return</a></main>', person["bio_en"], profile_id=person["id"])
        self.assertIn('<div class="bio">Αρχικό τεκμήριο.</div>', result)
        self.assertIn('data-profile-language="en"', result)
        self.assertIn(escape(person["bio_en"]), result)
        self.assertNotIn("<safe>", result)
        self.assertEqual(ensure_biography_sections(result, person["bio_en"], profile_id=person["id"]), result)

    def test_legacy_root_template_preserves_richer_english_and_greek(self):
        original = '<div class="bio">Πλήρες τεκμήριο.</div><section lang="en"><div class="bio">Independent rich English.</div></section>'
        result = ensure_biography_sections(original, "Short summary.", profile_id="arch-test")
        self.assertIn("Independent rich English.", result)
        self.assertIn("Πλήρες τεκμήριο.", result)
        self.assertNotIn("Short summary.", result)
        self.assertIn('data-profile-language="en"', result)
        self.assertEqual(result.count('data-profile-language="en"'), 1)
        self.assertEqual(result.count('lang="en"'), 1)

    def test_damaged_typed_or_unknown_root_profile_is_not_silently_repaired(self):
        person = {"id": "arch-test", "bio_en": "English"}
        typed = page("Greek")
        self.assertEqual(ensure_biography_sections(typed, person["bio_en"], profile_id=person["id"]), typed)
        with self.assertRaisesRegex(ValueError, "Missing en"):
            sync_biography(ensure_biography_sections(typed, person["bio_en"], profile_id=person["id"]), person["bio_en"], "en")
        with self.assertRaisesRegex(ValueError, "Unsectioned profile.*arch-test"):
            ensure_biography_sections("<main>No biography</main>", person["bio_en"], profile_id=person["id"])

    def test_missing_nonempty_canonical_biography_fails_closed(self):
        greek_only = page("Greek profile")
        with self.assertRaisesRegex(ValueError, "Missing en biography section"):
            sync_biography(greek_only, "English canonical biography", "en")
        self.assertEqual(sync_biography(greek_only, "", "en"), greek_only)


    def test_generated_root_only_profile_gains_hidden_english_without_source_loss(self):
        source = ('<main><article><div class="bio">Παλαιό τεκμήριο &amp; συνέχεια.</div>'
                  '<h2>Πηγές</h2></article></main>')
        generated = ensure_biography_sections(source, "English & verified.")
        self.assertIn('<div class="bio">Παλαιό τεκμήριο &amp; συνέχεια.</div>', generated)
        self.assertIn('data-profile-language="el"', generated)
        self.assertIn('data-profile-language="en" hidden', generated)
        self.assertIn('English &amp; verified.', generated)
        self.assertIn("<h2>Πηγές</h2>", generated)
        self.assertEqual(ensure_biography_sections(generated, "English & verified."), generated)
        self.assertEqual(sync_biography(generated, "Brief newer summary", "el"), generated)
        with self.assertRaisesRegex(ValueError, "Unsectioned profile has no biography div"):
            ensure_biography_sections("<article>Missing biography</article>", "English")


    def test_unknown_manual_classification_fails_closed(self):
        master = {"count": 1, "people": [{"id": "p", "name": "N", "bio": "New"}]}
        archive = {"count": 1, "people": [{"id": "p", "name": "N", "bio": "Old"}]}
        review = {"p": {"bio": {"legacy_sha256": digest("Old"),
                                 "canonical_sha256": digest("New"),
                                 "classification": "QUALIFIED_CONFLCT",
                                 "evidence": "Typo must not be accepted"}}}
        with self.assertRaisesRegex(ValueError, "Unknown manual classification"):
            reconcile(master, archive, review)


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

    def test_unknown_manual_categories_are_rejected_even_with_matching_hashes(self):
        a = {"count": 1, "people": [{"id": "p", "bio": "New", "name": "N"}]}
        b = {"count": 1, "people": [{"id": "p", "bio": "Old", "name": "N"}]}
        for category in ["QUALIFIED_CONFLCT", "APPROVED", "", None, [], {}]:
            with self.subTest(category=category):
                review = {"legacy_sha256": digest("Old"), "canonical_sha256": digest("New"),
                          "classification": category, "evidence": "Review"}
                with self.assertRaisesRegex(ValueError, "Unknown manual classification: p/bio"):
                    reconcile(a, b, {"p": {"bio": review}})

    def test_documented_categories_remain_valid(self):
        a = {"count": 1, "people": [{"id": "p", "bio": "New", "name": "N"}]}
        b = {"count": 1, "people": [{"id": "p", "bio": "Old", "name": "N"}]}
        for category in REVIEW_CLASSIFICATIONS:
            review = {"legacy_sha256": digest("Old"), "canonical_sha256": digest("New"),
                      "classification": category, "evidence": "Review"}
            self.assertEqual(reconcile(a, b, {"p": {"bio": review}})["counts"]["classifications"], {category: 1})

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


class AddendaTests(unittest.TestCase):
    def test_nested_addenda_keep_the_longer_fact_in_either_input_order(self):
        short = {"en": "A sourced fact.", "source_label": "Short source"}
        long = {"en": "A sourced fact. Additional verified detail.", "source_label": "Long source"}
        for rows in ([short, long], [long, short]):
            result = include_addenda(page("Archive.", "en"), rows, "en", "arch-test")
            self.assertEqual(normalized(result).count(short["en"]), 1)
            self.assertIn(long["en"], result)
            self.assertIn(short["source_label"], result)
            self.assertIn(long["source_label"], result)
            self.assertEqual(include_addenda(result, rows, "en", "arch-test"), result)

    def test_repeated_rows_and_overlapping_paragraphs_are_appended_once(self):
        rows = [{"el": "Πρώτη παράγραφος.", "source_label": "A"},
                {"el": "Πρώτη παράγραφος.\n\nΔεύτερη παράγραφος.", "source_label": "B"},
                {"el": "  Δεύτερη   παράγραφος.  ", "source_label": "B"}]
        result = include_addenda(page("Αρχείο."), rows, "el", "arch-test")
        for paragraph in ["Πρώτη παράγραφος.", "Δεύτερη παράγραφος."]:
            self.assertEqual(normalized(result).count(paragraph), 1)
        self.assertEqual(include_addenda(result, rows, "el", "arch-test"), result)
        self.assertEqual(result.count('class="profile-addenda-source"'), 1)

    def test_successive_batches_retain_facts_and_distinct_source_labels(self):
        first = [{"en": "Club's first fact.", "source_label": "Source 10"}]
        second = [{"en": "Club's first fact.\n\nSecond fact.", "source_label": "Source 1"}]
        result = include_addenda(page("Archive.", "en"), first, "en", "arch-test")
        result = include_addenda(result, second, "en", "arch-test")
        self.assertEqual(normalized(result).count("Club's first fact."), 1)
        self.assertEqual(normalized(result).count("Second fact."), 1)
        self.assertIn("Sources: Source 10 · Source 1", result)
        self.assertEqual(include_addenda(result, second, "en", "arch-test"), result)

    def test_existing_entities_and_spelling_do_not_duplicate_a_fact(self):
        rows = [{"en": "Christos Limpanovnos & the club.", "source_label": "Public <source>"}]
        result = include_addenda(page("Christos Lympanovnos & the club.", "en"), rows, "en", "arch-test")
        self.assertEqual(normalized(result).count("Christos Limpanovnos & the club."), 1)
        self.assertIn("Public &lt;source&gt;", result)
        self.assertNotIn("<source>", result)

    def test_missing_addendum_section_fails_with_context(self):
        with self.assertRaisesRegex(ValueError, "Missing en.*arch-test"):
            include_addenda(page("Greek"), [{"en": "Fact.", "source_label": "A"}], "en", "arch-test")


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

    def test_root_only_generated_english_biography_matches_canonical(self):
        pid = "arch-archery-contrib-20261102-01"
        original = (ROOT / "people" / (pid + ".html")).read_text()
        self.assertNotIn('data-profile-language=', original)
        output = (ROOT / "dist/people" / (pid + ".html")).read_text()
        english = re.search(
            r'<section\b[^>]*data-profile-language="en"[^>]*>.*?<div class="bio">(.*?)</div>',
            output, re.S)
        self.assertIsNotNone(english, "Missing generated English section: " + pid)
        self.assertEqual(normalized(english[1]), normalized(self.people[pid]["bio_en"]))
        self.assertIn('data-profile-language="en" hidden', output)


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

    def test_every_required_language_is_present_in_every_generated_profile(self):
        for pid, person in self.people.items():
            output = (ROOT / "dist/people" / (pid + ".html")).read_text()
            for lang, key in [("el", "bio"), ("en", "bio_en")]:
                if not normalized(person.get(key, "")):
                    continue
                section = re.search(r'<section\b[^>]*data-profile-language="' + lang
                                    + r'"[^>]*>.*?<div class="bio">(.*?)</div>', output, re.S)
                self.assertIsNotNone(section, pid + "/" + lang)
                self.assertTrue(normalized(section[1]), pid + "/" + lang + " empty")
                if lang == "en":
                    self.assertEqual(len(re.findall(r'<section\b[^>]*\blang="en"', output)), 1, pid + " duplicate English")
                if not (ROOT / "rebuild/source-profiles" / (pid + ".html")).is_file():
                    original = (ROOT / "people" / (pid + ".html")).read_text()
                    if lang == "en" and '<section lang="en"' not in original:
                        self.assertEqual(normalized(section[1]), normalized(person[key]), pid)


if __name__ == "__main__":
    unittest.main()
