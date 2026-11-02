"""Cross-page self-heal and private-data-safe event audit.

Tests must not write site files or contact production endpoints.
"""
import importlib.util
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / "rebuild" / "tools"
sys.path.insert(0, str(TOOLS))
from auto_fix_html_escapes import ALLOWLIST, repair_news_head, repair
from site_health_events import build_events, categorize, safe_route


class SitewideSelfHealTest(unittest.TestCase):
    def test_covers_all_released_public_pages_and_news_without_archive_profiles(self):
        self.assertIn("news.html", ALLOWLIST)
        self.assertIn("rebuild/hall-of-fame.html", ALLOWLIST)
        self.assertIn("rebuild/tmimata.html", ALLOWLIST)
        self.assertIn("rebuild/contact.html", ALLOWLIST)
        self.assertIn("rebuild/search.html", ALLOWLIST)
        self.assertEqual(len(ALLOWLIST), len(set(ALLOWLIST)))
        self.assertTrue(all((ROOT / name).is_file() for name in ALLOWLIST))
        self.assertFalse(any("/people/" in name or ".." in name for name in ALLOWLIST))

    def test_synthetic_defect_in_multiple_page_heads_is_idempotently_repaired(self):
        for page in ("rebuild/hall-of-fame.html", "rebuild/tmimata.html", "rebuild/search.html"):
            with self.subTest(page=page):
                original = (ROOT / page).read_text(encoding="utf-8")
                # Independently test permitted head transformations without mutating repo files.
                sample = '<!doctype html><head><meta charset="utf-8">\\n<link href="/assets/site/css/tokens.css"></head><body><p>Keep \\n prose untouched</p></body>'
                repaired, n = repair_news_head(sample)
                self.assertEqual(n, 1)
                self.assertIn('charset="utf-8">\n<link', repaired)
                self.assertIn("<p>Keep \\n prose untouched</p>", repaired)
                again, no_changes = repair_news_head(repaired)
                self.assertEqual((again, no_changes), (repaired, 0))
                # Current page must be processed without a write and no mutation.
                repair(ROOT / page, apply=False)
                self.assertEqual((ROOT / page).read_text(encoding="utf-8"), original)

    def test_rejects_unapproved_existing_files(self):
        with self.assertRaises(ValueError):
            repair(ROOT / "hall-of-fame-people.json", apply=False)
        with self.assertRaises(ValueError):
            repair(ROOT / "rebuild/tools/site_health_events.py", apply=False)

    def test_event_signatures_deduplicate_and_hide_private_values(self):
        report = {
            "checked": ["/", "/news.html", "/hall-of-fame.html"],
            "errors": [
                "/news.html: missing main element; visitor john@example.com IP 192.168.0.14",
                "/news.html: missing header; visitor jane@example.com IP 10.0.0.23",
                "http 503: /people/arch-12345678.html?email=private@example.com",
            ],
            "warnings": [
                "/news.html: canonical does not match final www host",
                "/news.html: canonical does not match final www host",
            ],
        }
        first = build_events(report)
        second = build_events(report)
        self.assertEqual(first["events"], second["events"])
        self.assertEqual(first["total_checked"], 3)
        self.assertEqual(first["errors"], 3)
        self.assertEqual(first["warnings"], 2)
        self.assertEqual(len(first["events"]), 3)
        self.assertTrue(any(e["occurrences"] == 2 for e in first["events"]))
        text = str(first)
        for secret in ("john@example.com", "jane@example.com", "192.168.0.14",
                       "10.0.0.23", "private@example.com", "arch-12345678"):
            self.assertNotIn(secret, text)
        self.assertIn("/people/:profile.html", text)

    def test_unknown_paths_never_leak_arbitrary_content(self):
        for candidate in ("private/token-supersensitive-file.txt",
                          "/private/this-is-confidential.pdf",
                          "https://evil.test/private/secret",
                          "error from jane@example.com"):
            self.assertEqual(safe_route(candidate), "site")

    def test_known_route_categories(self):
        self.assertEqual(categorize("/news.html: canonical does not match final www host"),
                         "SEO_CANONICAL_MISMATCH")
        self.assertEqual(categorize("Published asset fingerprint mismatch"), "STATIC_ASSET_MISMATCH")


if __name__ == "__main__":
    unittest.main()
