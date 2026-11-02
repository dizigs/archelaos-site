"""Scoped self-healing regression tests: never alter script or body content."""
import importlib.util
from pathlib import Path
import unittest

file = Path(__file__).resolve().parents[1] / "tools" / "auto_fix_html_escapes.py"
spec = importlib.util.spec_from_file_location("self_heal", file)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class SelfHealTests(unittest.TestCase):
    def test_only_head_escaped_whitespace_between_tags_is_replaced(self):
        bad = ('<html><head><link href="a">\\n<link href="b">\\t'
               '<script>const a="one\\nother";</script></head>'
               '<body><p>literal\\ntext stays for CI to reject</p></body></html>')
        fixed, count = m.repair_news_head(bad)
        self.assertEqual(count, 2)
        self.assertIn('<link href="a">\n<link href="b">\n<script>', fixed)
        self.assertIn('const a="one\\nother"', fixed)
        self.assertIn('<p>literal\\ntext stays', fixed)
        again, n = m.repair_news_head(fixed)
        self.assertEqual(n, 0)
        self.assertEqual(again, fixed)

    def test_preserve_intertag_escape_inside_inline_script(self):
        raw = '<head><script>const s = ">\\n<";</script></head>'
        fixed, count = m.repair_news_head(raw)
        self.assertEqual(count, 0)
        self.assertEqual(fixed, raw)

    def test_refuse_unrecognized_markup(self):
        with self.assertRaises(ValueError):
            m.repair_news_head('<body>News</body>')
        with self.assertRaises(ValueError):
            m.repair_news_head('<head></head><head></head>')

    def test_refuse_non_allowlisted_paths(self):
        with self.assertRaises(ValueError):
            m.repair(Path(__file__))


if __name__ == "__main__":
    unittest.main()
