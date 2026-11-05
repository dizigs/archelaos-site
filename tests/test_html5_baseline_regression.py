"""Regression checks for release HTML5 fixes (Issue #134)."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "rebuild" / "tools"))
import build_event_pages  # noqa: E402
import build_release  # noqa: E402


class Html5BaselineRegression(unittest.TestCase):
    def test_seo_metadata_follows_early_charset(self):
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp)
            stage, output = work / "stage", work / "dist"
            stage.mkdir()
            output.mkdir()
            (stage / "mini.html").write_text(
                '<!doctype html><html><head><meta charset="utf-8">'
                '<meta name="robots" content="noindex,nofollow">'
                '<meta name="description" content="old"><title>old</title>'
                '</head><body><main>hello</main></body></html>', encoding="utf-8"
            )
            entry = {
                "file": "mini.html", "path": "/mini.html",
                "title": "Test museum", "description": "Release accessibility regression"
            }
            with patch.object(build_release, "STAGE", stage), patch.object(build_release, "OUTPUT", output):
                build_release.create_page(entry)
            html = (output / "mini.html").read_text(encoding="utf-8")
            self.assertEqual(html.count('<meta charset="utf-8">'), 1)
            self.assertLess(html.index('<meta charset="utf-8">'), 1024)
            self.assertLess(html.index('<meta charset="utf-8">'), html.index('name="og:type"') if 'name="og:type"' in html else html.index('property="og:type"'))
            self.assertIn('<link rel="canonical" href="https://www.archelaos.club/mini.html">', html)

    def test_event_time_uses_canonical_date_not_approximate_label(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "archelaos-history-events.json").write_text(json.dumps({"events": [
                {"id": "example-1994", "date": "1994", "display_date": "1994–95",
                 "title": "Αρχείο", "description": "Περίοδος", "verification": "published-club-history"},
                {"id": "example-2015", "date": "2015-10-12", "display_date": "12 Οκτωβρίου 2015",
                 "title": "Δράση", "description": "Ημερομηνία", "verification": "published-club-history"},
            ]}, ensure_ascii=False), encoding="utf-8")
            (root / "hall-of-fame-people.json").write_text('{"people":[]}', encoding="utf-8")
            paths = build_event_pages.render(root, root / "dist")
            self.assertEqual(len(paths), 3)
            approx = (root / "dist" / "events" / "example-1994.html").read_text(encoding="utf-8")
            index = (root / "dist" / "events" / "index.html").read_text(encoding="utf-8")
            exact = (root / "dist" / "events" / "example-2015.html").read_text(encoding="utf-8")
            self.assertIn('datetime="1994">1994–95</time>', approx)
            self.assertIn('datetime="1994">1994–95</time>', index)
            self.assertIn('datetime="2015-10-12">12 Οκτωβρίου 2015</time>', exact)

    def test_caption_source_templates_are_semantically_nested(self):
        for name in ("index", "board", "stories", "hall-of-fame"):
            with self.subTest(name=name):
                html = (ROOT / "rebuild" / (name + ".html")).read_text(encoding="utf-8")
                self.assertIn('</blockquote></div><figcaption class="arch-container">', html)
                self.assertIn('</figcaption></figure>', html)
                self.assertNotIn('</blockquote><figcaption>', html)

    def test_contribution_checkbox_and_news_dialog_labels(self):
        contribution = (ROOT / "rebuild" / "contribute.html").read_text(encoding="utf-8")
        news = (ROOT / "news.html").read_text(encoding="utf-8")
        self.assertIn('<input id="ac-credit-consent" type="checkbox">', contribution)
        self.assertIn('aria-label="Λεπτομέρειες είδησης"', news)
        self.assertNotIn('aria-labelledby="an-dialog-title"', news)


if __name__ == "__main__":
    unittest.main()
