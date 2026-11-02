"""Prove broken/missing news images are safely re-importable, but intact or unlicensed files are not."""
import tempfile
from pathlib import Path
import unittest
from PIL import Image
from tools.import_news_images import needs_archive, repair_candidates

class NewsPhotoSelfHealTest(unittest.TestCase):
    def test_missing_local_photo_detected(self):
        with tempfile.TemporaryDirectory() as root:
            article={"imageReuseAllowed": True, "image": "images/news/test.jpg"}
            self.assertTrue(needs_archive(article, Path(root)))

    def test_corrupt_photo_detected(self):
        with tempfile.TemporaryDirectory() as root:
            target=Path(root)/"images/news/test.jpg"
            target.parent.mkdir(parents=True)
            target.write_bytes(b"not a photograph")
            self.assertTrue(needs_archive({"imageReuseAllowed": True, "image":"images/news/test.jpg"},Path(root)))

    def test_valid_archive_left_untouched(self):
        with tempfile.TemporaryDirectory() as root:
            target=Path(root)/"images/news/test.jpg"
            target.parent.mkdir(parents=True)
            Image.new("RGB",(600,400)).save(target,format="JPEG")
            self.assertFalse(needs_archive({"imageReuseAllowed": True, "image":"images/news/test.jpg"},Path(root)))

    def test_nested_uppercase_valid_archive_preserved(self):
        with tempfile.TemporaryDirectory() as root:
            target=Path(root)/"images/news/season/TEST.JPG"
            target.parent.mkdir(parents=True)
            Image.new("RGB",(600,400)).save(target,format="JPEG")
            self.assertFalse(needs_archive({"imageReuseAllowed":True,"image":"images/news/season/TEST.JPG"},Path(root)))

    def test_existing_archive_repair_uses_only_recorded_source(self):
        html='<meta property="og:image" content="https://example.org/other.jpg">'
        row={"image":"images/news/missing.jpg","imageSourceUrl":"https://example.org/original.jpg"}
        self.assertEqual(repair_candidates(row,"https://example.org/story",html),["https://example.org/original.jpg"])
        with self.assertRaisesRegex(ValueError,"recorded HTTPS"):
            repair_candidates({"image":"images/news/missing.jpg"},"https://example.org/story",html)

    def test_unknown_permission_not_auto_repaired(self):
        with tempfile.TemporaryDirectory() as root:
            self.assertFalse(needs_archive({"image":"images/news/test.jpg"},Path(root)))
            self.assertFalse(needs_archive({"imageReuseAllowed": False, "image":"images/news/test.jpg"},Path(root)))

    def test_remote_photo_is_eligible_for_local_archiving(self):
        self.assertTrue(needs_archive({"imageReuseAllowed":True, "image":"https://example.com/article.jpg"}))

if __name__ == "__main__":
    unittest.main()
