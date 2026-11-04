#!/usr/bin/env python3
"""Offline P0 security regression checks for media paths and sitemap semantics."""
from __future__ import annotations

from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from xml.etree import ElementTree as ET

TOOLS = Path(__file__).resolve().parents[1] / "tools"
sys.path.insert(0, str(TOOLS))
import build_release
import media_inventory
import verify_release


class SitemapNamespaceTests(unittest.TestCase):
    def test_pages_sitemap_keeps_standard_http_namespace_and_https_locations(self):
        url = build_release.SITE + "/test.html?x=1&y=2"
        tree = ET.fromstring(build_release.sitemap_xml(["/test.html?x=1&y=2"]))
        namespace = "http://www.sitemaps.org/schemas/sitemap/0.9"
        self.assertEqual(tree.tag, f"{{{namespace}}}urlset")
        self.assertEqual(
            [node.text for node in tree.findall(".//s:loc", {"s": namespace})],
            [url],
        )
        self.assertEqual(verify_release.NS["s"], namespace)
        self.assertTrue(url.startswith("https://"))
        self.assertNotIn("http://www.archelaos.club", url)

    def test_sitemap_index_keeps_standard_namespace_and_https_locations(self):
        namespace = "http://www.sitemaps.org/schemas/sitemap/0.9"
        tree = ET.fromstring(build_release.sitemap_index(["pages.xml", "people.xml"]))
        self.assertEqual(tree.tag, f"{{{namespace}}}sitemapindex")
        self.assertEqual(
            [node.text for node in tree.findall(".//s:loc", verify_release.NS)],
            [
                build_release.SITE + "/sitemaps/pages.xml",
                build_release.SITE + "/sitemaps/people.xml",
            ],
        )


class MediaInventoryBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.parent = Path(self.temporary.name)
        self.root = self.parent / "repo"
        self.stage = self.root / "rebuild"
        (self.stage / "data").mkdir(parents=True)
        (self.root / "assets").mkdir()
        self.old_root, self.old_stage = media_inventory.ROOT, media_inventory.STAGE
        media_inventory.ROOT = self.root
        media_inventory.STAGE = self.stage
        self.addCleanup(self.restore_paths)

    def restore_paths(self):
        media_inventory.ROOT = self.old_root
        media_inventory.STAGE = self.old_stage

    def write_images(self, *urls):
        (self.stage / "data" / "images.json").write_text(
            json.dumps({"items": [{"image": url} for url in urls]}),
            encoding="utf-8",
        )

    def test_valid_local_and_external_http_references_are_only_inventoried(self):
        (self.root / "assets" / "valid.png").write_bytes(b"valid-image-content")
        self.write_images(
            "/assets/valid.png",
            "/assets/missing.png",
            "https://cdn.example.org/photo.png",
            "http://legacy.example.org/photo.png",
            "//cdn.example.org/second.png",
        )
        result = media_inventory.inventory()
        self.assertEqual(result["scanned"], 5)
        self.assertEqual(len(result["local_assets"]), 1)
        self.assertEqual(result["local_assets"][0]["bytes"], len(b"valid-image-content"))
        self.assertEqual(len(result["missing_local_assets"]), 1)
        self.assertEqual(len(result["external_image_references"]), 3)
        self.assertEqual(
            {entry["url"] for entry in result["external_image_references"]},
            {
                "https://cdn.example.org/photo.png",
                "http://legacy.example.org/photo.png",
                "//cdn.example.org/second.png",
            },
        )
        self.assertEqual(result["external_unique_domains"]["legacy.example.org"], 1)
        self.assertIn("no network checks", result["notes"])

    def test_dot_segments_encoded_traversal_and_external_symlink_are_rejected(self):
        outside = self.parent / "private.png"
        outside.write_bytes(b"private-sentinel-bytes")
        (self.root / "assets" / "linked.png").symlink_to(outside)
        self.write_images(
            "/assets/../../private.png",
            "/assets/%2e%2e/%2e%2e/private.png",
            "/assets/linked.png",
            "/assets/%2F..%2F..%2Fprivate.png",
        )
        result = media_inventory.inventory()
        self.assertEqual(len(result["local_assets"]), 0)
        self.assertEqual(len(result["missing_local_assets"]), 4)
        self.assertTrue(
            all(item.get("reason") == "outside_checkout"
                for item in result["missing_local_assets"])
        )
        self.assertNotIn(outside.read_bytes().decode(), json.dumps(result))

    def test_normalized_in_root_path_and_internal_symlink_still_work(self):
        target = self.root / "assets" / "valid.png"
        target.write_bytes(b"fixture")
        (self.root / "assets" / "internal.png").symlink_to(target)
        self.write_images(
            "/assets/../assets/valid.png",
            "/assets/%76alid.png",
            "/assets/internal.png",
        )
        result = media_inventory.inventory()
        self.assertEqual(len(result["local_assets"]), 3)
        self.assertEqual(result["missing_local_assets"], [])

    def test_strict_local_cli_exits_nonzero_and_json_preserves_diagnostics(self):
        outside = self.parent / "outside.png"
        outside.write_bytes(b"outside")
        self.write_images("/assets/../../outside.png")
        output = self.parent / "inventory.json"
        with patch.object(sys, "argv", [
            "media_inventory.py", "--json", str(output), "--strict-local"
        ]), redirect_stdout(io.StringIO()):
            with self.assertRaises(SystemExit) as raised:
                media_inventory.main()
        self.assertEqual(raised.exception.code, 1)
        data = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(data["missing_local_assets"][0]["reason"], "outside_checkout")
        self.assertEqual(data["local_assets"], [])


if __name__ == "__main__":
    unittest.main()
