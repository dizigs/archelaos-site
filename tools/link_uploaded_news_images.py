#!/usr/bin/env python3
"""Attach an explicitly uploaded article image to a matching news record.

Only files whose basename exactly matches an existing article ID are linked.
The uploader is responsible for verifying provenance and reuse permission.
"""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
NEWS = ROOT / "news.json"
PHOTOS = ROOT / "images" / "news"
VALID_EXT = {".jpg", ".jpeg", ".png", ".webp"}

def main():
    data = json.loads(NEWS.read_text(encoding="utf-8"))
    by_id = {item["id"]: item for item in data["items"]}
    updated = []
    for path in sorted(PHOTOS.iterdir()):
        if not path.is_file() or path.suffix.lower() not in VALID_EXT:
            continue
        item = by_id.get(path.stem)
        if item is None:
            continue
        with Image.open(path) as photo:
            photo.verify()
        rel = path.relative_to(ROOT).as_posix()
        old = item.get("image", "")
        if old == rel:
            continue
        # Explicit, same-ID uploads take precedence over remote hotlinks.
        # Do not silently replace another locally verified article image.
        if old.startswith("images/news/") and old != rel:
            print("SKIPPED existing local image:", item["id"])
            continue
        item["image"] = rel
        item["imageNote"] = (
            "Φωτογραφία του γεγονότος από το αρχείο του Αρχέλαου."
            if item["id"] == "gymnastics-renovated-hall-opening-2019"
            else "Φωτογραφία που προστέθηκε στο αρχείο της είδησης."
        )
        updated.append(item["id"])
    if updated:
        NEWS.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Linked manually uploaded images:", ", ".join(updated) if updated else "none")

if __name__ == "__main__":
    main()
