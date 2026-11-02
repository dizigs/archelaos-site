"""Offline end-to-end handoff: private intake -> match candidates -> no publication."""
import json
from pathlib import Path
import sys
import tempfile
import unittest

TOOLS = Path(__file__).resolve().parents[1] / "tools"
sys.path.insert(0, str(TOOLS))
from intake_contributions import ingest
from process_private_inbox import run_queue


def empty_catalogs():
    return {
        "news": {"items": []}, "events": {"events": []},
        "people": {"people": []}, "interview": {"items": []},
        "story": {"stories": []}, "moment": {"moments": []},
        "museum": {"articles": []},
    }


class PrivateQueueTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.workspace = Path(self.tmp.name)
        (self.workspace / "incoming").mkdir()
        self.catalogs = empty_catalogs()

    def put(self, text, label):
        (self.workspace / "incoming" / (label + ".txt")).write_text(text, encoding="utf-8")
        return ingest({"source": "admin", "source_id": label, "revision": "v1",
                       "payload_relpath": "incoming/" + label + ".txt"}, self.workspace)

    def test_private_analysis_and_matching_are_idempotent(self):
        report = self.put("Το 1994 ο Αρχέλαος κατέκτησε Κύπελλο Ελλάδας στο χάντμπολ.", "one")
        one = run_queue(self.workspace, self.catalogs)
        self.assertEqual(one["processed"], 1)
        self.assertEqual(one["failed"], 0)
        path = self.workspace / "matches" / (report["receipt_id"] + ".json")
        result = json.loads(path.read_text())
        self.assertFalse(result["publishable"])
        self.assertEqual(result["verification_status"], "pending")
        self.assertEqual(result["privacy"], "internal_only")
        self.assertEqual(len(result["matches"]), 1)
        again = run_queue(self.workspace, self.catalogs)
        self.assertEqual(again["unchanged"], 1)
        self.assertEqual(again["processed"], 0)

    def test_catalog_changes_refresh_matches(self):
        report = self.put("Το 1994 ο Αρχέλαος κατέκτησε Κύπελλο Ελλάδας στο χάντμπολ.", "two")
        run_queue(self.workspace, self.catalogs)
        old = json.loads((self.workspace / "matches" / (report["receipt_id"] + ".json")).read_text())
        self.catalogs["news"]["items"].append(
            {"id": "n1994", "date": "1994-05-22", "sport": "Χάντμπολ",
             "title": "Αρχέλαος Κύπελλο Ελλάδας 1994", "summary": "Κυπελλούχος."}
        )
        rerun = run_queue(self.workspace, self.catalogs)
        self.assertEqual(rerun["processed"], 1)
        now = json.loads((self.workspace / "matches" / (report["receipt_id"] + ".json")).read_text())
        self.assertNotEqual(old["catalog_sha256"], now["catalog_sha256"])
        self.assertEqual(now["matches"][0]["news_candidates"][0]["id"], "n1994")

    def test_one_failed_receipt_does_not_stop_another(self):
        bad = self.put("Το 1993 ο Αρχέλαος συμμετείχε στο πρωτάθλημα.", "bad")
        good = self.put("Το 1994 ο Αρχέλαος κατέκτησε το Κύπελλο Ελλάδας.", "good")
        bad_path = self.workspace / "research" / (bad["receipt_id"] + ".json")
        bad_path.write_text("{broken json", encoding="utf-8")
        counts = run_queue(self.workspace, self.catalogs)
        self.assertEqual(counts["failed"], 1)
        self.assertEqual(counts["processed"], 1)
        self.assertNotIn("bad", str(counts))
        self.assertTrue((self.workspace / "matches" / (good["receipt_id"] + ".json")).exists())

    def test_duplicates_and_pdf_wait_for_extraction(self):
        one = self.put("Ίδια σύντομη πληροφορία.", "original")
        duplicate = self.put("Ίδια σύντομη πληροφορία.", "duplicate")
        (self.workspace / "incoming" / "scan.pdf").write_bytes(b"%PDF-1.7\n")
        pdf = ingest({"source": "drive", "source_id": "pdf", "revision": "1",
                      "payload_relpath": "incoming/scan.pdf"}, self.workspace)
        self.assertEqual(duplicate["outcome"], "duplicate_content")
        self.assertEqual(pdf["extraction_status"], "needs_pdf_extraction")
        counts = run_queue(self.workspace, self.catalogs)
        self.assertEqual(counts["processed"], 1)
        self.assertEqual(counts["skipped"], 2)
        self.assertTrue((self.workspace / "matches" / (one["receipt_id"] + ".json")).exists())


if __name__ == "__main__":
    unittest.main()
