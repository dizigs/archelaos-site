"""Inject the historical visible \\n defect in memory and prove automatic safe recovery.

This uses the REAL news.html as its fixture. No production, branch HTML, or
working-tree file is modified; this is an isolated CI safety drill.
"""
import re
import sys
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "rebuild" / "tools"))
from auto_fix_html_escapes import repair_news_head
from guard_html_escaped_text import find_visible_escapes


class FaultInjectionSelfHealTest(unittest.TestCase):
    def test_injected_news_head_escape_detected_and_fully_repaired(self):
        original = (ROOT / "news.html").read_text(encoding="utf-8")
        opening, remaining = original.split("<head>", 1)
        head, trailing = remaining.split("</head>", 1)
        self.assertEqual(find_visible_escapes(original), [], "News baseline must be clean")

        gap = re.search(r"(?<=>)\n(?=<)", head)
        self.assertIsNotNone(gap, "A safe real-world head tag separator is required")
        faulty_head = head[:gap.start()] + r"\n" + head[gap.end():]
        faulty = opening + "<head>" + faulty_head + "</head>" + trailing

        findings = find_visible_escapes(faulty)
        self.assertEqual(len(findings), 1, "The injected fault MUST trip the real HTML guard")
        self.assertIn(r"\n", findings[0]["codes"])
        repaired, replacements = repair_news_head(faulty)
        self.assertEqual(replacements, 1, "The allowlisted repair MUST resolve exactly one fault")
        self.assertEqual(find_visible_escapes(repaired), [], "The repaired page MUST pass the guard")
        self.assertEqual(repaired, original, "Every byte of the original HTML must be restored")
        repeat, second_count = repair_news_head(repaired)
        self.assertEqual((repeat, second_count), (original, 0), "Repair must be idempotent")
        print("FAULT_INJECTION PASS: introduced 1 escaped-newline bug; detected 1; auto-repaired 1; original restored byte-for-byte")

    def test_unknown_body_fault_must_not_be_silently_repaired(self):
        original = (ROOT / "news.html").read_text(encoding="utf-8")
        closing = "</body>"
        self.assertEqual(original.count(closing), 1)
        faulty = original.replace(closing, r"\n" + closing, 1)
        self.assertGreaterEqual(len(find_visible_escapes(faulty)), 1)
        repaired, count = repair_news_head(faulty)
        self.assertEqual(count, 0, "Unknown body text is outside the auto-repair allowlist")
        self.assertEqual(repaired, faulty, "Unsafe defects must require human-reviewed correction")
        print("FAULT_INJECTION PASS: unknown body fault detected and correctly left untouched")


if __name__ == "__main__":
    unittest.main()
