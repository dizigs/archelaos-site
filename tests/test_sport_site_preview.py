"""Static safety checks for the non-production sport-site preview."""
import pathlib
import re
import unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]/"prototypes"/"sport-site"
class PreviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html=(ROOT/"index.html").read_text(encoding="utf-8")
        cls.css=(ROOT/"sport-site.css").read_text(encoding="utf-8")
        cls.js=(ROOT/"sport-site.js").read_text(encoding="utf-8")
    def test_greek_semantics(self):
        self.assertIn('lang="el"',self.html)
        self.assertIn('href="#main"',self.html)
        self.assertIn('id="main"',self.html)
        self.assertIn('<details>',self.html)
    def test_no_analytics_or_external_js(self):
        self.assertNotRegex(self.html.lower(),r'gtag|googletagmanager|google-analytics|<iframe|<form')
        self.assertEqual(re.findall(r'<script[^>]+src="([^"]+)"',self.html),['./sport-site.js'])
    def test_no_fake_statistics(self):
        self.assertIn('Δεν εμφανίζονται εικονικοί αθλητές ή αποτελέσματα.',self.html)
    def test_central_history_and_hall_only(self):
        self.assertIn('https://archelaos.club/tmimata.html#sport-archery',self.html)
        self.assertIn('https://archelaos.club/hall-of-fame.html',self.html)
        self.assertIn('https://archelaos.club/tmimata.html#sport-wrestling',self.js)
    def test_other_sports_are_neutral_not_archery_branded(self):
        self.assertIn('data-preview-sport="wrestling"', self.css)
        self.assertIn("document.documentElement.dataset.previewSport=key", self.js)

    def test_minimal_design_and_accessibility(self):
        self.assertIn('#ffcf20',self.css.lower())
        self.assertIn('prefers-reduced-motion',self.css)
        self.assertIn(':focus-visible',self.css)
        self.assertIn('@media',self.css)
if __name__=="__main__":
    unittest.main()
