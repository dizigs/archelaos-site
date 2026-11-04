#!/usr/bin/env python3
"""Local-only Greek OCR for permitted historic scans; no network, no auto-publication.

Place authorized scans under rebuild/research/historical-scans/ (gitignored).
Never upload original scans or OCR text to the public repository.
"""
from __future__ import annotations

import argparse
from pathlib import Path
import shutil
import subprocess
import tempfile
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
SCAN_DIR = ROOT / "research" / "historical-scans"
EXTENSIONS = {".png", ".jpg", ".jpeg", ".tif", ".tiff"}
MAX_IMAGE = 12_000_000


def recognize_local_scan(path: Path, scan_dir=SCAN_DIR) -> str:
    base = scan_dir.resolve()
    item = path.resolve(strict=True)
    if item.parent != base or path.is_symlink() or not item.is_file() or item.suffix.lower() not in EXTENSIONS:
        raise ValueError("OCR input must be a direct authorized scan under historical-scans")
    if item.stat().st_size == 0 or item.stat().st_size > MAX_IMAGE:
        raise ValueError("OCR image size outside limit")
    if not shutil.which("tesseract"):
        raise RuntimeError("Tesseract not installed")
    result = subprocess.run(["tesseract", str(item), "stdout", "-l", "ell", "--psm", "6"],
                            capture_output=True, text=True, check=False, timeout=30)
    if result.returncode:
        raise RuntimeError("Greek Tesseract OCR unsuccessful (check ell language data)")
    if len(result.stdout) > 300_000:
        raise ValueError("OCR output unreasonably large")
    return result.stdout


def self_test() -> bool:
    # Synthetic public test text; never a real person's private scan.
    from PIL import Image, ImageDraw, ImageFont
    font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    if not Path(font_path).is_file():
        raise RuntimeError("Greek test font missing from runner")
    with tempfile.TemporaryDirectory(prefix="archelaos-ocr-") as folder:
        root = Path(folder)
        image = Image.new("RGB", (1450, 220), "white")
        draw = ImageDraw.Draw(image)
        font = ImageFont.truetype(font_path, size=68)
        draw.text((45, 57), "ΑΡΧΕΛΑΟΣ ΚΑΤΕΡΙΝΗΣ 1965", fill="black", font=font)
        target = root / "synthetic-public.png"
        image.save(target)
        raw = recognize_local_scan(target, scan_dir=root)
        normalized = "".join(c for c in unicodedata.normalize("NFD", raw.upper())
                             if unicodedata.category(c) != "Mn")
        if "ΑΡΧΕΛΑΟΣ" not in normalized or "ΚΑΤΕΡΙΝΗΣ" not in normalized:
            raise RuntimeError("OCR smoke failed to recognize synthetic Greek club name")
        print("GREEK TESSERACT OCR: REAL synthetic page PASS; no archival facts asserted")
        return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    cmd = parser.add_mutually_exclusive_group(required=True)
    cmd.add_argument("--self-test", action="store_true")
    cmd.add_argument("--image", type=Path, help="Existing authorized scan under historical-scans")
    args = parser.parse_args()
    if args.self_test:
        return 0 if self_test() else 1
    # Local invocation only. This output must NEVER be uploaded by a CI action.
    print(recognize_local_scan(args.image))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
