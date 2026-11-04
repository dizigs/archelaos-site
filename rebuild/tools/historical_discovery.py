#!/usr/bin/env python3
"""Read-only discovery of historic book/archive METADATA, not verified club facts.

Only two fixed public APIs. Never downloads scanned books, news articles or
private sources; never edits the website or canonical Hall/news registries.
"""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path
import re
import unicodedata
from urllib.parse import urlencode, quote, urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "research" / "historical-source-ledger.json"
REVIEW_FILE = ROOT / "test-artifacts" / "historical-search-review.json"
MAX_RESPONSE = 600_000
SOURCES = {
    "books": {"host": "www.googleapis.com", "path": "/books/v1/volumes", "source_id": "hist-src-books"},
    "archive": {"host": "archive.org", "path": "/advancedsearch.php", "source_id": "hist-src-archive"},
}


def _normalize(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", value.casefold())
                   if unicodedata.category(c) != "Mn").replace("ς", "σ")


def _clean(value, maximum=180) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(value.split())[:maximum]


def _validate_query(query: str) -> str:
    if not isinstance(query, str) or not 3 <= len(query.strip()) <= 120:
        raise ValueError("Query length invalid")
    normalized = _normalize(query)
    if not any(word in normalized for word in ("αρχελα", "archela", "arhela")):
        raise ValueError("Only research about Archelaos is permitted")
    if any(ord(c) < 32 for c in query):
        raise ValueError("Unsafe query control character")
    return query.strip()


def _validate_limit(limit: int) -> int:
    if type(limit) is not int or limit < 1 or limit > 10:
        raise ValueError("Maximum ten results per public query")
    return limit


def _api_url(provider: str, query: str, limit: int) -> str:
    if provider == "books":
        params = {"q": query, "maxResults": limit, "printType": "books"}
    elif provider == "archive":
        # Quoted literal phrase, rather than allowing query-language operators.
        safe_phrase = query.replace("\\", " ").replace('"', " ").strip()
        params = {"q": f'title:("{safe_phrase}") OR description:("{safe_phrase}")',
                  "fl[]": ["identifier", "title", "date", "year"],
                  "rows": limit, "page": 1, "output": "json"}
    else:
        raise ValueError("Unknown or unauthorized provider")
    source = SOURCES[provider]
    return "https://" + source["host"] + source["path"] + "?" + urlencode(params, doseq=True)


def _read_json(url: str, provider: str, opener=urlopen) -> dict:
    config = SOURCES[provider]
    request = Request(url, headers={"User-Agent": "ArchelaosHistoricalResearch/1.0",
                                     "Accept": "application/json"})
    with opener(request, timeout=12) as response:
        effective = urlsplit(response.geturl())
        if (effective.scheme != "https" or effective.hostname != config["host"]
                or effective.path != config["path"] or effective.username or effective.password):
            raise ValueError("Search API redirect outside approved host/path")
        raw = response.read(MAX_RESPONSE + 1)
    if len(raw) > MAX_RESPONSE:
        raise ValueError("Provider response too large")
    obj = json.loads(raw.decode("utf-8"))
    if not isinstance(obj, dict):
        raise ValueError("Provider response shape invalid")
    return obj


def _candidate(provider: str, row: dict) -> dict | None:
    if not isinstance(row, dict):
        return None
    if provider == "books":
        item_id = row.get("id")
        detail = row.get("volumeInfo") or {}
        if not isinstance(detail, dict):
            return None
        title = _clean(detail.get("title"))
        date = _clean(detail.get("publishedDate"), 40)
    else:
        item_id = row.get("identifier")
        title = _clean(row.get("title"))
        date = _clean(row.get("date") or row.get("year"), 40)
    if not isinstance(item_id, str) or not re.fullmatch(r"[A-Za-z0-9_.-]{2,120}", item_id) or not title:
        return None
    url = ("https://books.google.com/books?id=" + quote(item_id, safe="")
           if provider == "books" else "https://archive.org/details/" + quote(item_id, safe=""))
    digest = sha256((provider + "|" + item_id).encode("utf-8")).hexdigest()[:16]
    return {
        "id": "histcand-" + provider + "-" + digest,
        "source_id": SOURCES[provider]["source_id"],
        "source_item_id": item_id,
        "title": title, "date": date, "url": url,
        "publication": None, "issue_date": None, "page": None,
        "status": "discovery_only_unverified", "person_ids": [], "event_ids": [],
        "ocr_checked": False, "public_site_eligible": False,
    }


def search_metadata(provider: str, query: str, limit=10, opener=urlopen) -> dict:
    query = _validate_query(query)
    limit = _validate_limit(limit)
    if provider not in SOURCES:
        raise ValueError("Unknown provider")
    data = _read_json(_api_url(provider, query, limit), provider, opener)
    rows = data.get("items", []) if provider == "books" else (data.get("response") or {}).get("docs", [])
    if not isinstance(rows, list):
        raise ValueError("Provider items shape invalid")
    candidates, seen = [], set()
    for row in rows[:limit]:
        item = _candidate(provider, row)
        if item is not None and item["id"] not in seen:
            candidates.append(item)
            seen.add(item["id"])
    return {
        "schema_version": 1, "purpose": "review_only_historical_metadata",
        "provider": provider, "query": query, "source_id": SOURCES[provider]["source_id"],
        "candidate_count": len(candidates), "candidates": candidates,
        "verified_club_achievements": 0, "website_writes": 0,
    }


def validate_source_ledger():
    data = json.loads(LEDGER.read_text(encoding="utf-8"))
    if data.get("schema_version") != 1 or data.get("scope", {}).get("site_news_publication") is not False:
        raise ValueError("Historical sources must be separate and nonpublishing")
    sources = data.get("sources") or []
    ids = [s.get("id") for s in sources]
    if len(ids) != len(set(ids)) or not all(SOURCES[p]["source_id"] in ids for p in SOURCES):
        raise ValueError("Source registry IDs missing or duplicated")
    all_ids = [x.get("id") for x in data.get("leads", [])]
    if len(all_ids) != len(set(all_ids)):
        raise ValueError("Historical lead IDs duplicated")
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--provider", choices=("books", "archive"))
    parser.add_argument("--query", default="Αρχέλαος Κατερίνης")
    parser.add_argument("--max-results", type=int, default=10)
    parser.add_argument("--check-registry", action="store_true")
    args = parser.parse_args()
    validate_source_ledger()
    if args.check_registry:
        print("HISTORICAL REGISTRY: review-only IDs and source keys valid")
        return 0
    if args.provider is None:
        parser.error("--provider is required unless --check-registry is used")
    result = search_metadata(args.provider, args.query, args.max_results)
    # Fixed review artifact. No raw provider response or secrets are retained.
    REVIEW_FILE.parent.mkdir(parents=True, exist_ok=True)
    if REVIEW_FILE.is_symlink() or REVIEW_FILE.parent.is_symlink():
        raise ValueError("Refusing redirected output path")
    REVIEW_FILE.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("HISTORICAL DISCOVERY:", result["candidate_count"], "UNVERIFIED metadata candidates, published: 0")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
