#!/usr/bin/env python3
"""Opt-in public Archelaos news/archival catalogue -> Gemini Notebook source.

DRY-RUN by default. The only live mode requires explicit OAuth env variables.
No private documents, scans, credentials or OCR texts are accepted here.
"""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import re
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
NOTEBOOK = "https://notebook.googleapis.com/v1"
ID_RE = re.compile(r"[A-Za-z0-9_.-]{3,140}\Z")
NOTEBOOK_RE = re.compile(r"notebooks/[A-Za-z0-9-]{8,128}\Z")


def public_url(link):
    if not isinstance(link, str) or len(link) > 1400:
        raise ValueError("Invalid public URL")
    u = urlsplit(link)
    if (u.scheme != "https" or not u.hostname or u.username or u.password or u.port
            or u.fragment or u.hostname.lower() in {"localhost", "127.0.0.1", "::1"}):
        raise ValueError("Only public HTTPS links without credentials allowed")
    return link


def news_source(news_id, path=ROOT.parent / "news.json"):
    if not isinstance(news_id, str) or not ID_RE.fullmatch(news_id):
        raise ValueError("Invalid news id")
    data = json.loads(path.read_text(encoding="utf-8"))
    matches = [x for x in data["items"] if x.get("id") == news_id]
    if len(matches) != 1:
        raise ValueError("Missing or duplicate canonical news ID")
    article = matches[0]
    title = " ".join(str(article.get("title", "")).split())[:200]
    if not title:
        raise ValueError("Missing article title")
    return {"display_name": ("ARCHELAOS NEWS [" + news_id + "] " + title)[:500],
            "web_content": {"url": public_url(article.get("sourceUrl", ""))}}


def catalogue_source(source_id, path=ROOT / "research/historical-source-ledger.json"):
    if not isinstance(source_id, str) or not source_id.startswith("hist-src-") or not ID_RE.fullmatch(source_id):
        raise ValueError("Invalid archive source ID")
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("scope", {}).get("site_news_publication") is not False:
        raise ValueError("Invalid non-publishing registry")
    matches = [x for x in data.get("sources", []) if x.get("id") == source_id]
    if len(matches) != 1 or matches[0].get("contains_archelaos_evidence") != "not_verified":
        raise ValueError("Unknown source or unexpected verification")
    item = matches[0]
    url = public_url(item["url"])
    title = " ".join(item["title"].split())[:200]
    note = ("# Αρχέλαος — Υποψήφια αρχειακή πηγή\n\nSource ID: " + source_id
            + "\nΚατάλογος: " + title + "\nURL: " + url
            + "\nΚατάσταση: ΜΗ ΕΠΑΛΗΘΕΥΜΕΝΗ ένδειξη. Δεν επιβεβαιώνει ιστορικό γεγονός.\n"
            + "Απαιτείται πρωτότυπο φύλλο, ημερομηνία, σελίδα και έλεγχος ονομάτων.\n")
    return {"display_name": ("ARCHELAOS ARCHIVE [" + source_id + "] " + title)[:500],
            "mime_type": "text/markdown", "text_content": {"content": note}}


def add_to_notebook(notebook, source, access_token, cloud_project, opener=urlopen):
    if not isinstance(notebook, str) or not NOTEBOOK_RE.fullmatch(notebook):
        raise ValueError("Invalid notebook name")
    if not isinstance(cloud_project, str) or not re.fullmatch(r"[a-z][a-z0-9-]{4,60}\Z", cloud_project):
        raise ValueError("Invalid Google Cloud project ID")
    if not isinstance(access_token, str) or len(access_token) < 20:
        raise ValueError("Missing OAuth token")
    data = json.dumps(source, ensure_ascii=False).encode("utf-8")
    if len(data) > 100_000:
        raise ValueError("Source payload too large")
    url = NOTEBOOK + "/" + notebook + "/sources"
    request = Request(url, data=data, method="POST", headers={
        "Authorization": "Bearer " + access_token,
        "x-goog-user-project": cloud_project,
        "Content-Type": "application/json",
        "Accept": "application/json",
    })
    try:
        with opener(request, timeout=20) as response:
            resolved = urlsplit(response.geturl())
            if (resolved.scheme != "https" or resolved.hostname != "notebook.googleapis.com"
                    or resolved.path != "/v1/" + notebook + "/sources"):
                raise ValueError("Disallowed API redirect")
            raw = response.read(1_000_001)
    except HTTPError as exc:
        raise ValueError("Gemini Notebook API returned HTTP " + str(exc.code)) from None
    except URLError:
        raise ValueError("Gemini Notebook API unavailable") from None
    if len(raw) > 1_000_000:
        raise ValueError("Response too large")
    result = json.loads(raw)
    name = result.get("name", "") if isinstance(result, dict) else ""
    if not re.fullmatch(re.escape(notebook) + r"/sources/[A-Za-z0-9-]{8,128}", name):
        raise ValueError("Invalid API source identity")
    return {"source_name": name, "state": result.get("state", "PROCESSING"),
            "note": "Check GetSource for ACTIVE or FAILED before marking ingested."}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    choice = p.add_mutually_exclusive_group(required=True)
    choice.add_argument("--news-id")
    choice.add_argument("--archive-source-id")
    p.add_argument("--notebook")
    p.add_argument("--live", action="store_true")
    args = p.parse_args()
    source = news_source(args.news_id) if args.news_id else catalogue_source(args.archive_source_id)
    if not args.live:
        print(json.dumps({"status":"DRY_RUN", "writes":0, "source":source}, ensure_ascii=False))
        return 0
    if not args.notebook:
        p.error("--notebook required for --live")
    output = add_to_notebook(args.notebook, source, os.getenv("GOOGLE_NOTEBOOK_ACCESS_TOKEN", ""),
                             os.getenv("GOOGLE_CLOUD_PROJECT", ""))
    print(json.dumps(output, ensure_ascii=False))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
