"""No-network tests for Gemini Notebook public source bridge."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("notebook_source_bridge", ROOT / "tools/notebook_source_bridge.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class Reply:
    def __init__(self, url, data):
        self.url = url
        self.data = json.dumps(data).encode("utf-8")
    def __enter__(self): return self
    def __exit__(self, *args): return False
    def geturl(self): return self.url
    def read(self, size): return self.data[:size]


class SourceBridgeTests(unittest.TestCase):
    def test_news_provenance_and_no_unlisted_sources(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "news.json"
            path.write_text(json.dumps({"items":[{"id":"old-news-1965","title":"Ο Αρχέλαος",
                         "sourceUrl":"https://example.org/1965"}]}), encoding="utf-8")
            actual = m.news_source("old-news-1965", path)
            self.assertIn("[old-news-1965]", actual["display_name"])
            self.assertEqual(actual["web_content"]["url"], "https://example.org/1965")
            with self.assertRaises(ValueError): m.news_source("missing", path)
            for bad in ("http://example.org", "https://u:p@example.org", "https://localhost/x"):
                path.write_text(json.dumps({"items":[{"id":"old-news-1965","title":"Topic","sourceUrl":bad}]}))
                with self.assertRaises(ValueError): m.news_source("old-news-1965", path)

    def test_catalogue_is_unverified_and_not_news(self):
        src = m.catalogue_source("hist-src-gak-pieria")
        self.assertIn("ΜΗ ΕΠΑΛΗΘΕΥΜΕΝΗ", src["text_content"]["content"])
        self.assertEqual(src["mime_type"], "text/markdown")

    def test_explicit_oauth_only_on_live_path(self):
        notebook = "notebooks/550e8400-e29b-41d4-a716-446655440000"
        def fake(request, timeout):
            self.assertEqual(timeout, 20)
            self.assertEqual(request.full_url, "https://notebook.googleapis.com/v1/" + notebook + "/sources")
            self.assertEqual(json.loads(request.data)["web_content"]["url"], "https://example.org/1965")
            self.assertEqual(request.get_header("X-goog-user-project"), "archelaos-research")
            return Reply(request.full_url, {"name":notebook + "/sources/770e8400-e29b-41d4-a716-446655440111",
                                            "state":"PROCESSING"})
        src = {"display_name":"Test", "web_content":{"url":"https://example.org/1965"}}
        actual = m.add_to_notebook(notebook, src, "synthetic-long-not-a-valid-token", "archelaos-research", fake)
        self.assertEqual(actual["state"], "PROCESSING")
        with self.assertRaises(ValueError): m.add_to_notebook("invalid", src, "synthetic-long-not-a-valid-token", "archelaos-research", fake)
        with self.assertRaises(ValueError): m.add_to_notebook(notebook, src, "", "archelaos-research", fake)


if __name__ == "__main__":
    unittest.main()
