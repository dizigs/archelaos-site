"""Regression tests for private, idempotent and nonpublishing contribution intake."""
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

TOOLS = Path(__file__).resolve().parents[1] / "tools"
sys.path.insert(0, str(TOOLS))
from intake_contributions import ingest, inside_private, MAX_FILE_BYTES


class PrivateIntakeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.workspace = Path(self.tmp.name)
        (self.workspace / "incoming").mkdir()

    def source(self, payload, name="report.txt", source="gmail",
               source_id="message/attachment-A", revision="v1"):
        path = self.workspace / "incoming" / name
        path.write_bytes(payload)
        return {"source": source, "source_id": source_id, "revision": revision,
                "payload_relpath": "incoming/" + name}

    def test_intake_produces_private_leads_and_only_hashed_identity(self):
        record = self.source("Το 1994 ο Αρχέλαος κατέκτησε το Κύπελλο με σκορ 27-25.".encode())
        outcome = ingest(record, self.workspace)
        self.assertEqual(outcome["outcome"], "queued")
        self.assertEqual(outcome["extraction_status"], "extracted")
        self.assertFalse(outcome["publishable"])
        self.assertTrue((self.workspace / "research" / (outcome["receipt_id"] + ".json")).exists())
        leads = json.loads((self.workspace / "research" / (outcome["receipt_id"] + ".json")).read_text())
        self.assertEqual(leads["privacy"], "internal_only")
        self.assertGreater(len(leads["research_leads"]), 0)
        receipt = (self.workspace / "receipts" / (outcome["receipt_id"] + ".json")).read_text()
        self.assertNotIn("message/attachment-A", receipt)
        self.assertNotIn("Κύπελλο", receipt)
        self.assertFalse(json.loads(receipt)["publishable"])

    def test_replay_is_idempotent(self):
        envelope = self.source(b"Hello")
        first = ingest(envelope, self.workspace)
        second = ingest(envelope, self.workspace)
        self.assertEqual(second["outcome"], "already_ingested")
        self.assertEqual(first["receipt_id"], second["receipt_id"])
        self.assertEqual(len(list((self.workspace / "receipts").glob("*.json"))), 1)

    def test_same_content_across_sources_is_one_analysis(self):
        first = self.source(b"The same content", name="original.txt")
        one = ingest(first, self.workspace)
        second = self.source(b"The same content", name="other.txt", source="drive",
                             source_id="drive-file-1", revision="17")
        two = ingest(second, self.workspace)
        self.assertEqual(two["outcome"], "duplicate_content")
        self.assertEqual(two["extraction_status"], "duplicate_content")
        self.assertNotEqual(one["receipt_id"], two["receipt_id"])
        self.assertFalse((self.workspace / "research" / (two["receipt_id"] + ".json")).exists())
        receipt = json.loads((self.workspace / "receipts" / (two["receipt_id"] + ".json")).read_text())
        self.assertEqual(receipt["duplicates_receipt"], one["receipt_id"])

    def test_new_revision_tracks_previous_without_overwriting(self):
        old = self.source(b"First version", revision="v1")
        one = ingest(old, self.workspace)
        new = self.source(b"Second version", revision="v2")
        two = ingest(new, self.workspace)
        receipt = json.loads((self.workspace / "receipts" / (two["receipt_id"] + ".json")).read_text())
        self.assertEqual(receipt["supersedes"], one["receipt_id"])
        self.assertNotEqual(one["receipt_id"], two["receipt_id"])
        self.assertEqual(len(list((self.workspace / "receipts").glob("*.json"))), 2)

    def test_same_revision_different_content_is_rejected(self):
        old = self.source(b"Before")
        ingest(old, self.workspace)
        changed = self.source(b"After")
        with self.assertRaisesRegex(ValueError, "new revision"):
            ingest(changed, self.workspace)

    def test_escape_and_unsupported_extension_rejected(self):
        record = self.source(b"test")
        record["payload_relpath"] = "../sensitive.txt"
        with self.assertRaises(ValueError):
            ingest(record, self.workspace)
        record["payload_relpath"] = "incoming/other.exe"
        with self.assertRaises(ValueError):
            ingest(record, self.workspace)
        with self.assertRaises(ValueError):
            inside_private(self.workspace, "/etc/passwd")

    def test_pdf_is_not_falsely_treated_as_extracted(self):
        pdf = self.source(b"%PDF-1.7\nfake-test-pdf", name="scan.pdf")
        out = ingest(pdf, self.workspace)
        self.assertEqual(out["extraction_status"], "needs_pdf_extraction")
        self.assertFalse((self.workspace / "text" / (out["receipt_id"] + ".txt")).exists())
        invalid = self.source(b"not a real pdf", name="wrong.pdf", revision="v2")
        with self.assertRaisesRegex(ValueError, "Invalid PDF"):
            ingest(invalid, self.workspace)

    def test_docx_paragraph_extraction(self):
        raw = io.BytesIO()
        with zipfile.ZipFile(raw, "w") as docx:
            docx.writestr("word/document.xml",
                '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                '<w:body><w:p><w:r><w:t>Το 1994</w:t></w:r>'
                '<w:r><w:t> ο Αρχέλαος κατέκτησε το Κύπελλο Ελλάδας.</w:t></w:r>'
                '</w:p></w:body></w:document>')
        out = ingest(self.source(raw.getvalue(), "source.docx"), self.workspace)
        self.assertEqual(out["extraction_status"], "extracted")
        text = (self.workspace / "text" / (out["receipt_id"] + ".txt")).read_text()
        self.assertIn("Το 1994 ο Αρχέλαος", text)

    def test_binary_text_and_large_input_fail_closed(self):
        with self.assertRaisesRegex(ValueError, "Binary"):
            ingest(self.source(b"text\x00hidden"), self.workspace)
        with self.assertRaisesRegex(ValueError, "oversized"):
            ingest(self.source(b"x" * (MAX_FILE_BYTES + 1), revision="v2"), self.workspace)

    def test_no_source_or_identity_means_no_intake(self):
        envelope = self.source(b"sample")
        for field in ("source", "source_id", "revision"):
            bad = dict(envelope)
            bad.pop(field)
            with self.assertRaises(ValueError):
                ingest(bad, self.workspace)


if __name__ == "__main__":
    unittest.main()
