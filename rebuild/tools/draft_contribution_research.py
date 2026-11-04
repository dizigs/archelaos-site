#!/usr/bin/env python3
"""Create private, review-only article and biography research drafts.

Input: offline contribution leads JSON plus Firecrawl search result JSON.
Search hits are discovery leads, NOT verified evidence. Never publishes.
"""
import argparse
import json
from pathlib import Path


def build(leads, search):
    by_id = {str(r.get("lead_id")): r for r in search.get("results", [])}
    drafts = []
    for lead in leads.get("research_leads", []):
        found = by_id.get(str(lead.get("id")), {})
        sources = [s for s in found.get("sources", []) if s.get("url")]
        if not sources:
            continue
        excerpt = lead.get("excerpt", "")
        drafts.append({
            "candidate_id": lead["id"],
            "kind": "historical_news_candidate",
            "headline_draft": "Ιστορικό γεγονός του Αρχελάου — απαιτείται τεκμηρίωση",
            "original_contribution_excerpt_private": excerpt,
            "date_candidates": lead.get("dates", []),
            "score_candidates": lead.get("scores", []),
            "research_sources": sources,
            "research_tasks": [
                "Open each source and verify it refers to the same event, sport, date and participants",
                "Check independent corroboration; identify conflicts and unsupported claims",
                "Match named people to canonical Hall of Fame IDs; avoid homonyms",
                "Check existing news and event ledger for duplicates",
                "Produce publication text only from individually verified claims",
            ],
            "biography_enrichment_candidates": [],
            "event_ledger_status": "candidate_only",
            "verification_status": "pending",
            "editor_approval_status": "pending",
            "publishable": False,
        })
    return {"schema_version": 1, "privacy": "internal_only",
            "warning": "Search snippets and uploaded text do not establish historical truth.",
            "drafts": drafts}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("leads", type=Path)
    p.add_argument("search_results", type=Path)
    args = p.parse_args()
    leads = json.loads(args.leads.read_text(encoding="utf-8"))
    search = json.loads(args.search_results.read_text(encoding="utf-8"))
    if leads.get("privacy") != "internal_only" or search.get("privacy") != "internal_only":
        p.error("Unexpected input privacy marker")
    print(json.dumps(build(leads, search), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
