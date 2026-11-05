#!/usr/bin/env python3
"""Issue #134 regression checks for generated HTML5 semantics, without network."""
from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase, main
from unittest.mock import patch
import json
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "rebuild" / "tools"))
import build_event_pages
import build_release


class FigcaptionParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.parents = []

    def handle_starttag(self, tag, attrs):
        if tag == "figcaption":
            self.parents.append(self.stack[-1] if self.stack else None)
        if tag not in {"meta", "link", "input", "br", "img", "hr", "source"}:
            self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag in self.stack:
            while self.stack:
                if self.stack.pop() == tag:
                    break


class HTML5BaselineTests(TestCase):
    def test_generated_meta_charset_precedes_seo_head(self):
        with TemporaryDirectory() as tmp:
            stage = Path(tmp) / "stage"
            output = Path(tmp) / "dist"
            stage.mkdir()
            output.mkdir()
            (stage / "sample.html").write_text(
                '<!doctype html><html lang="el"><head><meta charset="utf-8">'
                '<meta name="robots" content="noindex"><meta name="description" content="a">'
                '<title>Original</title></head><body><main>Sample</main></body></html>',
                encoding="utf-8",
            )
            entry = {
                "file": "sample.html", "path": "/sample.html",
                "title": "Sample", "description": "Issue 134 regression",
            }
            with patch.object(build_release, "STAGE", stage), patch.object(build_release, "OUTPUT", output):
                build_release.create_page(entry)
            rendered = (output / "sample.html").read_bytes()
            charset = rendered.index(b'<meta charset="utf-8">')
            robots = rendered.index(b'<meta name="robots"')
            self.assertLess(charset, 1024)
            self.assertLess(charset, robots)
            self.assertIn(b'<link rel="canonical"', rendered)
            self.assertIn(b'Issue 134 regression', rendered)

    def test_event_date_ranges_keep_visible_text_and_valid_datetime(self):
        with TemporaryDirectory() as tmp:
            root, output = Path(tmp) / "source", Path(tmp) / "output"
            root.mkdir()
            (root / "archelaos-history-events.json").write_text(
                json.dumps({"events": [{
                    "id": "test-season", "title": "Season", "description": "Test",
                    "category": "History", "date": "1994", "display_date": "1994–95",
                    "verification": "published-club-history",
                }]}), encoding="utf-8",
            )
            (root / "hall-of-fame-people.json").write_text(
                json.dumps({"people": []}), encoding="utf-8",
            )
            paths = build_event_pages.render(root, output)
            self.assertIn("/events/test-season.html", paths)
            for page in ("test-season.html", "index.html"):
                html = (output / "events" / page).read_text(encoding="utf-8")
                self.assertIn('<time', html)
                self.assertIn('datetime="1994">1994–95</time>', html)

    def test_event_does_not_fabricate_a_date(self):
        with TemporaryDirectory() as tmp:
            root, output = Path(tmp) / "source", Path(tmp) / "output"
            root.mkdir()
            (root / "archelaos-history-events.json").write_text(
                json.dumps({"events": [{
                    "id": "test-season", "title": "Season", "description": "Test",
                    "date": "1994–95",
                }]}), encoding="utf-8",
            )
            (root / "hall-of-fame-people.json").write_text(
                json.dumps({"people": []}), encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "Invalid canonical event date"):
                build_event_pages.render(root, output)

    def test_quote_figcaptions_have_figure_parent(self):
        for name in ("board", "index", "stories", "hall-of-fame"):
            with self.subTest(name=name):
                source = (ROOT / "rebuild" / (name + ".html")).read_text(encoding="utf-8")
                parser = FigcaptionParser()
                parser.feed(source)
                self.assertTrue(parser.parents)
                self.assertEqual(parser.parents, ["figure"] * len(parser.parents))

    def test_news_dialog_and_contributor_checkbox_have_valid_labels(self):
        news = (ROOT / "news.html").read_text(encoding="utf-8")
        contribute = (ROOT / "rebuild" / "contribute.html").read_text(encoding="utf-8")
        self.assertIn('aria-label="Λεπτομέρειες είδησης"', news)
        self.assertNotIn('aria-labelledby="an-dialog-title"', news)
        self.assertIn('<input id="ac-credit-consent" type="checkbox">', contribute)


if __name__ == "__main__":
    main()
