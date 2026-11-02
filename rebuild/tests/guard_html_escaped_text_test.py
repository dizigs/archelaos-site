"""Offline tests for the visible literal-escape deployment guard."""
import importlib.util
from pathlib import Path
import unittest

PATH = Path(__file__).resolve().parents[1] / "tools" / "guard_html_escaped_text.py"
spec = importlib.util.spec_from_file_location("escaped_guard", PATH)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class LiteralEscapesTests(unittest.TestCase):
    def test_reject_literal_backslash_n_between_html_elements(self):
        bad = '<html><head><link rel="stylesheet" href="a.css">\\n<link href="b.css"></head><body><p>ok</p></body></html>'
        matches = guard.find_visible_escapes(bad)
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]["codes"], [r"\n"])

    def test_reject_literal_backslash_n_inside_visible_text(self):
        bad = '<html><body><p>Η ιστορία\\nσυνεχίζεται.</p></body></html>'
        self.assertEqual(len(guard.find_visible_escapes(bad)), 1)

    def test_ignore_legal_escapes_in_scripts_styles_and_code(self):
        safe = (
            '<html><head><script>const message="line\\nnext";</script>'
            '<style>p::before{content:"one\\ntwo"}</style></head>'
            '<body><pre>Example: \\n</pre><code>\\t</code>'
            '<p>Line one\nLine two</p></body></html>'
        )
        self.assertEqual(guard.find_visible_escapes(safe), [])

    def test_reject_textarea_escaped_newline(self):
        self.assertEqual(len(guard.find_visible_escapes('<textarea>\\n</textarea>')), 1)

    def test_reject_escaped_tab_and_return(self):
        bad = '<body><p>text\\tword</p><p>text\\rword</p></body>'
        self.assertEqual(len(guard.find_visible_escapes(bad)), 2)

    def test_guard_inspects_actual_news_source(self):
        news = Path(__file__).resolve().parents[2] / "news.html"
        self.assertEqual(guard.find_visible_escapes(news.read_text(encoding="utf-8")), [])


if __name__ == "__main__":
    unittest.main()
