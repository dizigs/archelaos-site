#!/usr/bin/env python3
"""Search public sources for internally extracted contribution event leads.

Reads JSON from contribution_research.py. Sends ONLY club name, year and
generic sport/event terms to Firecrawl; never sends excerpts or identities.
Requires FIRECRAWL_API_KEY and explicit --allow-external-search.
Results are unverified candidates, not publication-ready evidence.
"""
import argparse
import ipaddress
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit

API = "https://api.firecrawl.dev/v1/search"
SPORTS = ("χάντμπολ", "χειροσφαίριση", "τοξοβολία", "πετοσφαίριση", "βόλεϊ", "πάλη", "στίβος", "μπάσκετ", "καλαθοσφαίριση")
EVENTS = ("κύπελλο", "πρωτάθλημα", "εκδήλωση", "αγώνας", "τουρνουά", "βράβευση", "κοινωνική δράση")


def safe_query(lead):
    excerpt = str(lead.get("excerpt", "")).casefold()
    # Basketball belongs to a merged/separate club context. Never attribute
    # these discovery leads to G.A.S. Archelaos or send automatic searches.
    if any(token in excerpt for token in (
            "μπάσκετ", "μπασκετ", "καλαθοσφαίριση", "καλαθοσφαιριση",
            "σφκ", "πιερικός αρχέλαος", "πιερικος αρχελαος")):
        return None
    years = re.findall(r"\b(?:19|20)\d{2}\b", " ".join(map(str, lead.get("dates", []))))[:2]
    terms = [s for s in SPORTS if s in excerpt][:1] + [s for s in EVENTS if s in excerpt][:1]
    return " ".join(["ΓΑΣ Αρχέλαος Κατερίνης", *years, *terms])


def safe_public_source_url(value):
    """Reject local/private/credential-bearing or non-HTTPS source links."""
    if not isinstance(value, str) or len(value) > 2048:
        return False
    try:
        parsed = urlsplit(value)
        hostname = parsed.hostname
        if parsed.scheme != "https" or not hostname or parsed.username or parsed.password:
            return False
        if hostname == "localhost" or hostname.endswith((".localhost", ".local", ".internal")):
            return False
        if "." not in hostname:
            return False
        try:
            ip = ipaddress.ip_address(hostname)
        except ValueError:
            return True
        return ip.is_global
    except ValueError:
        return False


def search(query, api_key, limit=5):
    body = json.dumps({"query": query, "limit": limit}).encode()
    request = urllib.request.Request(API, data=body, headers={
        "Authorization": "Bearer " + api_key,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }, method="POST")
    with urllib.request.urlopen(request, timeout=25) as response:
        payload = json.load(response)
    if not payload.get("success", False):
        raise RuntimeError("Search provider reported failure")
    results = payload.get("data", [])
    if isinstance(results, dict):
        results = results.get("web", [])
    return [{"url": r.get("url"), "title": r.get("title", ""),
             "description": str(r.get("description", ""))[:500]}
            for r in results[:limit] if isinstance(r, dict) and
            safe_public_source_url(r.get("url"))]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("leads", type=Path)
    ap.add_argument("--allow-external-search", action="store_true",
                    help="Explicitly authorize sending generic queries to Firecrawl")
    ap.add_argument("--max-leads", type=int, default=10)
    args = ap.parse_args()
    if not args.allow_external_search:
        ap.error("External searches require --allow-external-search")
    key = os.environ.get("FIRECRAWL_API_KEY")
    if not key:
        ap.error("FIRECRAWL_API_KEY is missing")
    source = json.loads(args.leads.read_text(encoding="utf-8"))
    if source.get("privacy") != "internal_only":
        ap.error("Unexpected input schema/privacy")
    output = []
    for lead in source.get("research_leads", [])[:max(0, min(args.max_leads, 40))]:
        query = safe_query(lead)
        if query is None:
            output.append({"lead_id": lead.get("id"), "query": None, "sources": [],
                           "verification_status": "affiliation_review_required",
                           "editor_approval_status": "pending",
                           "reason": "merged_basketball_not_assumed_gas"})
            continue
        try:
            hits = search(query, key)
            output.append({"lead_id": lead["id"], "query": query,
                           "sources": hits, "verification_status": "pending",
                           "editor_approval_status": "pending"})
        except (urllib.error.URLError, TimeoutError, ValueError, RuntimeError) as error:
            print("Search failed for lead " + str(lead.get("id")) + ": " + type(error).__name__, file=sys.stderr)
            output.append({"lead_id": lead.get("id"), "query": query, "sources": [],
                           "error": "search_unavailable", "verification_status": "pending"})
    print(json.dumps({"schema_version": 1, "privacy": "internal_only",
                      "results": output, "note": "Search hits are not independently verified facts."},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
