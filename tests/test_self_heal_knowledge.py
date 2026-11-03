"""Offline end-to-end tests for the large OSV knowledge cache. No network or code fixes."""
import importlib.util
import io
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import self_heal_knowledge as kb


def record(id="GHSA-aaaa-bbbb-cccc", alias="CVE-2026-1111", modified="2026-11-03T10:00:00Z",
           withdrawn=None, pkg="example-lib", summary="Unsafe example parser"):
    return {
        "id": id, "aliases": [alias], "modified": modified,
        "published": "2026-01-01T00:00:00Z", "withdrawn": withdrawn,
        "summary": summary, "details": "Example parser can expose information in an old version",
        "affected": [{"package": {"name": pkg, "ecosystem": "PyPI"},
                      "ranges": [{"type": "ECOSYSTEM", "events": [
                          {"introduced": "0"}, {"fixed": "1.0.1"}]}]}],
        "references": [{"type": "WEB", "url": "https://example.org/advisories/1"}]
    }


class KnowledgeTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.conn = kb.connect(Path(self.temp.name) / "kb.sqlite3")
        self.addCleanup(self.conn.close)

    def make_zip(self, members):
        path = Path(self.temp.name) / "fixture.zip"
        with zipfile.ZipFile(path, "w") as z:
            for filename, payload in members.items():
                z.writestr(filename, json.dumps(payload) if isinstance(payload, dict) else payload)
        return path

    def test_bulk_zip_is_ingested_and_searchable_without_network(self):
        f = self.make_zip({"PyPI/GHSA-aaaa-bbbb-cccc.json": record()})
        result = kb.ingest_zip(self.conn, f)
        self.conn.commit()
        self.assertEqual(result["scanned"], 1)
        self.assertEqual(result["updated"], 1)
        self.assertEqual(kb.stats(self.conn)["records"], 1)
        self.assertEqual(kb.search(self.conn, "parser")[0]["id"], "GHSA-aaaa-bbbb-cccc")
        evidence = kb.inspect(self.conn, "CVE-2026-1111")[0]
        self.assertEqual(evidence["canonicalId"], "CVE-2026-1111")
        self.assertEqual(evidence["affected"][0]["package"]["ecosystem"], "PyPI")
        self.assertTrue(evidence["sourceUrl"].startswith("https://osv.dev/"))

    def test_repeated_import_is_idempotent_new_modified_updates_index(self):
        row = record()
        self.assertTrue(kb.upsert(self.conn, row))
        self.assertFalse(kb.upsert(self.conn, row))
        self.assertEqual(kb.stats(self.conn)["records"], 1)
        row["modified"] = "2026-11-03T11:00:00Z"
        row["summary"] = "Patched packaging issue"
        self.assertTrue(kb.upsert(self.conn, row))
        self.assertEqual(kb.search(self.conn, "Patched")[0]["id"], row["id"])
        self.assertEqual(kb.search(self.conn, "Unsafe"), [])

    def test_aliases_group_cross_ecosystem_duplicates(self):
        a = record()
        b = record(id="PYSEC-2026-1", pkg="other-package", summary="Related parser flaw")
        kb.upsert(self.conn, a)
        kb.upsert(self.conn, b)
        self.assertEqual(kb.stats(self.conn)["records"], 2)
        self.assertEqual(kb.stats(self.conn)["canonicalGroups"], 1)
        self.assertEqual(len(kb.inspect(self.conn, "CVE-2026-1111")), 2)
        self.assertEqual(len(kb.search(self.conn, "parser")), 1)

    def test_withdrawn_is_retained_but_excluded_from_normal_search(self):
        a = record(withdrawn="2026-11-02T12:00:00Z")
        kb.upsert(self.conn, a)
        self.assertEqual(kb.stats(self.conn)["records"], 1)
        self.assertEqual(kb.stats(self.conn)["active"], 0)
        self.assertEqual(kb.search(self.conn, "parser"), [])
        self.assertEqual(len(kb.search(self.conn, "parser", include_withdrawn=True)), 1)

    def test_archive_does_not_write_or_extract_files(self):
        for name in ("../escape.json", "/abs/escape.json", "bad\\path.json", "bad.txt"):
            with self.subTest(name=name):
                path = self.make_zip({name: record()})
                with self.assertRaises(kb.KnowledgeError):
                    kb.ingest_zip(self.conn, path)
                self.assertFalse((Path(self.temp.name).parent / "escape.json").exists())

    def test_oversized_zip_member_is_rejected_before_reading(self):
        path = self.make_zip({"too-big.json": "X" * 800})
        previous = kb.MAX_RECORD
        kb.MAX_RECORD = 200
        try:
            with self.assertRaises(kb.KnowledgeError):
                kb.ingest_zip(self.conn, path)
        finally:
            kb.MAX_RECORD = previous

    def test_bounded_api_query_hydrates_and_commits_exact_package(self):
        paths = []
        def transport(path, payload=None):
            paths.append(path)
            if path == "/v1/query":
                self.assertEqual(payload["version"], "1.0.0")
                self.assertEqual(payload["package"], {"ecosystem": "PyPI", "name": "example-lib"})
                return {"vulns": [{"id": "GHSA-aaaa-bbbb-cccc"}]}
            if path == "/v1/vulns/GHSA-aaaa-bbbb-cccc":
                return record()
            raise AssertionError("Unexpected endpoint")
        r = kb.lookup_package(self.conn, "PyPI", "example-lib", "1.0.0", transport)
        self.assertEqual(r["matches"], 1)
        self.assertEqual(r["requests"], 2)
        self.assertEqual(kb.stats(self.conn)["records"], 1)
        self.assertEqual(paths, ["/v1/query", "/v1/vulns/GHSA-aaaa-bbbb-cccc"])

    def test_api_pagination_loop_fails_without_committing(self):
        def transport(path, payload=None):
            return {"vulns": [{"id": "GHSA-aaaa-bbbb-cccc"}], "next_page_token": "loop"}
        with self.assertRaises(kb.KnowledgeError):
            kb.lookup_package(self.conn, "PyPI", "example-lib", "1.0.0", transport)
        self.assertEqual(kb.stats(self.conn)["records"], 0)

    def test_untrusted_api_endpoint_and_client_inputs_fail_closed(self):
        for endpoint in ("/v1/../../admin", "/v1/vulns/a?next=1", "https://evil.example.com/"):
            with self.subTest(endpoint=endpoint), self.assertRaises(kb.KnowledgeError):
                kb._request_json(endpoint)
        with self.assertRaises(kb.KnowledgeError):
            kb.lookup_package(self.conn, "PyPI", "../../etc/passwd", "1", lambda *args: {})
        with self.assertRaises(kb.KnowledgeError):
            kb.search(self.conn, "!!!")

    def test_bulk_download_rejects_unapproved_ecosystem_before_network(self):
        calls = []
        def opener(*args, **kwargs):
            calls.append((args, kwargs))
            raise AssertionError("Network should not be called")
        with self.assertRaises(kb.KnowledgeError):
            kb.download_bulk_archive("../outside", Path(self.temp.name) / "no.zip", opener)
        self.assertEqual(calls, [])

    def test_bulk_download_streams_official_fixed_url_with_bounded_output(self):
        class FakeResponse:
            def __init__(self, url, data):
                self.url, self.data, self.position = url, data, 0
                self.headers = {"Content-Length": str(len(data))}
            def geturl(self):
                return self.url
            def read(self, size):
                start = self.position
                self.position += size
                return self.data[start:self.position]
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return None
        paths = []
        blob = b"ZIPTEST" * 40
        def opener(request, timeout):
            self.assertEqual(timeout, 30)
            paths.append(request.full_url)
            return FakeResponse(request.full_url, blob)
        destination = Path(self.temp.name) / "official.zip"
        result = kb.download_bulk_archive("PyPI", destination, opener)
        self.assertEqual(result["compressedBytes"], len(blob))
        self.assertEqual(destination.read_bytes(), blob)
        self.assertEqual(paths, ["https://storage.googleapis.com/osv-vulnerabilities/PyPI/all.zip"])

    def test_bulk_rejects_redirect_without_writing_archive(self):
        class Redirect:
            headers = {}
            def geturl(self): return "https://unknown.example.com/archive.zip"
            def __enter__(self): return self
            def __exit__(self, *args): return None
        destination = Path(self.temp.name) / "must-not-exist.zip"
        with self.assertRaises(kb.KnowledgeError):
            kb.download_bulk_archive("all", destination, lambda *args, **kwargs: Redirect())
        self.assertFalse(destination.exists())

    def test_no_automated_repair_permissions_in_knowledge_tool(self):
        source = (ROOT / "tools/self_heal_knowledge.py").read_text()
        for forbidden in ("subprocess.", "os.system(", "git push", "merge_pull_request", "deploy("):
            self.assertNotIn(forbidden, source)
        self.assertIn("explicit --allow-network", source)


if __name__ == "__main__":
    unittest.main()
