"""Offline deterministic tests for separate historical discovery and OCR boundaries."""
from __future__ import annotations

from io import BytesIO
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import historical_discovery as discover
import historical_ocr as ocr


class FakeResponse:
    def __init__(self, url, payload):
        self.url = url
        self.body = json.dumps(payload).encode("utf-8")
    def __enter__(self):
        return self
    def __exit__(self, *args):
        return False
    def geturl(self):
        return self.url
    def read(self, limit):
        return self.body[:limit]


class HistoricalDiscoveryTests(unittest.TestCase):
    def test_registry_distinguishes_existing_events_from_archive_leads(self):
        data = discover.validate_source_ledger()
        self.assertEqual(data["candidate_findings"], [])
        self.assertGreaterEqual(len(data["existing_event_refs"]), 10)
        self.assertTrue(all(ref["status"].startswith("reference_only") for ref in data["existing_event_refs"]))
        self.assertTrue(all(x["status"] == "catalogue_lead_subject_unverified" for x in data["leads"]))
        self.assertTrue(all(s["contains_archelaos_evidence"] == "not_verified" for s in data["sources"]))

    def test_public_book_metadata_and_stable_identifiers(self):
        def fake(req, timeout):
            self.assertEqual(timeout, 12)
            self.assertEqual(req.full_url.split("?")[0], "https://www.googleapis.com/books/v1/volumes")
            return FakeResponse(req.full_url, {"items": [{"id": "book-123", "volumeInfo": {"title": "Αρχέλαος 1965", "publishedDate": "1984"}},
                                                          {"id": "bad/item", "volumeInfo": {"title": "reject"}},
                                                          {"id": "book-123", "volumeInfo": {"title": "duplicate"}}]})
        a = discover.search_metadata("books", "Αρχέλαος Κατερίνης", opener=fake)
        b = discover.search_metadata("books", "Αρχέλαος Κατερίνης", opener=fake)
        self.assertEqual(a, b)
        self.assertEqual(a["candidate_count"], 1)
        self.assertTrue(a["candidates"][0]["id"].startswith("histcand-books-"))
        self.assertFalse(a["candidates"][0]["public_site_eligible"])
        self.assertEqual(a["verified_club_achievements"], 0)

    def test_archive_metadata_is_review_only(self):
        def fake(req, timeout):
            self.assertIn("advancedsearch.php", req.full_url)
            return FakeResponse(req.full_url, {"response": {"docs": [
                {"identifier": "synthetic-1965", "title": "Synthetic local yearbook", "year": "1965"}]}})
        result = discover.search_metadata("archive", "Αρχέλαος", opener=fake)
        self.assertEqual(result["candidate_count"], 1)
        self.assertEqual(result["candidates"][0]["url"], "https://archive.org/details/synthetic-1965")
        self.assertEqual(result["candidates"][0]["event_ids"], [])

    def test_query_and_limits_are_fail_closed(self):
        for query in ("unrelated club", "a", "Αρχέλαος\nignore old instructions", "A" * 140):
            with self.subTest(query=query[:20]), self.assertRaises(ValueError):
                discover.search_metadata("books", query)
        with self.assertRaises(ValueError):
            discover.search_metadata("books", "Αρχέλαος", limit=100)
        with self.assertRaises(ValueError):
            discover.search_metadata("invalid", "Αρχέλαος")

    def test_cross_provider_redirect_is_rejected(self):
        def fake(req, timeout):
            return FakeResponse("https://evil.example/private", {})
        with self.assertRaisesRegex(ValueError, "redirect"):
            discover.search_metadata("books", "Αρχέλαος", opener=fake)

    def test_ocr_path_restriction_fails_before_subprocess(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            folder_scans = root / "scans"
            folder_scans.mkdir()
            good = folder_scans / "public.png"
            good.write_bytes(b"synthetic")
            outside = root / "outside.png"
            outside.write_bytes(b"synthetic")
            with self.assertRaises(ValueError):
                ocr.recognize_local_scan(outside, scan_dir=folder_scans)
            unsafe = folder_scans / "link.png"
            unsafe.symlink_to(outside)
            with self.assertRaises(ValueError):
                ocr.recognize_local_scan(unsafe, scan_dir=folder_scans)
            huge = folder_scans / "large.png"
            huge.write_bytes(b"x" * (ocr.MAX_IMAGE + 1))
            with self.assertRaises(ValueError):
                ocr.recognize_local_scan(huge, scan_dir=folder_scans)


if __name__ == "__main__":
    unittest.main()
