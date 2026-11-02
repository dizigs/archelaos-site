#!/usr/bin/env python3
"""Extract candidate facts and web-search queries from contributed Greek text.

Offline, standard-library only. This produces *unverified* research leads,
never approved news, biographies, or public website content.
Usage: python rebuild/tools/contribution_research.py input.txt > leads.json
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

DATE = re.compile(r"\b(?:[0-3]?\d[/-][01]?\d[/-](?:19|20)\d{2}|(?:19|20)\d{2})\b")
SCORE = re.compile(r"\b\d{1,3}\s*[-–:]\s*\d{1,3}\b")
KEYWORDS = ("αγών", "κύπελλ", "πρωτάθλη", "εκδήλω", "δράσ", "τουρνουά", "βράβευ", "προπονητ", "αθλητ", "συμμετοχ", "διοργάνω", "νίκ", "ήττ", "μεταγραφ")
MAX_CHARS = 120_000
MAX_LEADS = 40


def analyze(text):
    if len(text) > MAX_CHARS:
        raise ValueError("Input exceeds safe character limit")
    paragraphs = [re.sub(r"\s+", " ", p).strip() for p in re.split(r"\n\s*\n", text)]
    leads = []
    seen = set()
    for p in paragraphs:
        if len(p) < 25:
            continue
        for sentence in re.split(r"(?<=[.!;;])\s+", p):
            sentence = sentence.strip()
            if len(sentence) < 25 or not (DATE.search(sentence) or SCORE.search(sentence) or any(k in sentence.casefold() for k in KEYWORDS)):
                continue
            key = hashlib.sha256(sentence.casefold().encode("utf-8")).hexdigest()[:16]
            if key in seen:
                continue
            seen.add(key)
            dates = DATE.findall(sentence)
            # Never place private sentence text or identities into even a suggested search query.\n            query = "ΓΑΣ Αρχέλαος Κατερίνης " + " ".join(dates[:2])
            leads.append({"id": key, "excerpt": sentence[:1000], "dates": dates,
                          "scores": SCORE.findall(sentence), "search_query": query.strip(),
                          "verification_status": "pending", "editor_approval_status": "pending"})
            if len(leads) >= MAX_LEADS:
                break
        if len(leads) >= MAX_LEADS:
            break
    return {"schema_version": 1, "source_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
            "privacy": "internal_only", "research_leads": leads,
            "note": "Search queries are suggestions only. Do not send private text to external search services without authorization."}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input", type=Path, help="UTF-8 text extracted from a contribution")
    args = ap.parse_args()
    print(json.dumps(analyze(args.input.read_text(encoding="utf-8")), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
