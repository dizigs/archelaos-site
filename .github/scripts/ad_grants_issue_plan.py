#!/usr/bin/env python3
"""Offline, public-safe Issue planning only. No HTTP client or write-token path."""
from __future__ import annotations
import argparse
import json
from pathlib import Path

CODES = frozenset(("AD_DISAPPROVED", "URL_BROKEN", "URL_UNCHECKED", "KEYWORD_LOW_QUALITY",
                   "KEYWORD_QUALITY_UNAVAILABLE", "KEYWORD_SINGLE_WORD", "CTR_BELOW_TARGET", "CTR_DATA_UNAVAILABLE"))
TRUSTED_AUTHORS = frozenset(("github-actions[bot]", "dizigs"))
ROOT = Path(__file__).resolve().parents[2]


def inventory(fetch_page):
    """Future read-only GitHub adapter: all states, complete pages, fail closed."""
    result = []
    for page in range(1, 11):
        batch = fetch_page(state="all", page=page, per_page=100)
        if not isinstance(batch, list) or len(batch) > 100:
            raise ValueError("Invalid Issue inventory page")
        result.extend(batch)
        if len(batch) < 100:
            return result
    raise ValueError("Incomplete Issue inventory; no create plan is safe")


def plan(report, existing):
    if (report.get("schema_version") != 1 or report.get("mode") != "dry-run"
            or report.get("source_kind") not in ("synthetic-fixture", "google-ads-readonly")
            or report.get("policy_status") != "current-policy-review-required"
            or not isinstance(report.get("findings"), list) or not isinstance(existing, list)):
        raise ValueError("Unsupported dry-run report or inventory")
    findings = {}
    for item in report["findings"]:
        if (set(item) != {"code", "count"} or item["code"] not in CODES
                or type(item["count"]) is not int or not 1 <= item["count"] <= 10000
                or item["code"] in findings):
            raise ValueError("Invalid or duplicate public finding")
        findings[item["code"]] = item["count"]
    actions = []
    for code, count in sorted(findings.items()):
        marker = "<!-- archelaos-ad-grants:v1:" + code + " -->"
        matches = [issue for issue in existing if not issue.get("pull_request")
                   and issue.get("user", {}).get("login") in TRUSTED_AUTHORS
                   and marker in str(issue.get("body") or "")]
        open_matches = [issue for issue in matches if issue.get("state") == "open"]
        if open_matches:
            actions.append({"code":code, "action":"already_open", "number":min(i["number"] for i in open_matches)})
        elif matches:
            actions.append({"code":code, "action":"would_reopen", "number":max(i["number"] for i in matches)})
        else:
            actions.append({"code":code, "action":"would_create",
                            "title":"Ad Grants dry-run review: " + code,
                            "body":marker + "\n\nSource: " + report["source_kind"] +
                            "\nCount: " + str(count) +
                            "\nDry-run evidence only. Current policy, P0, consent and live preview checks remain required. "
                            "Do not enable ads or alter budgets from this finding."})
    return {"schema_version":1, "mode":"dry-run", "can_publish":False,
            "source_kind":report["source_kind"], "actions":actions}


def read_json(name):
    # Bounded local reads; never copy raw input paths or values into a public plan.
    with Path(name).open("rb") as stream:
        payload = stream.read(1_000_001)
    if len(payload) > 1_000_000:
        raise ValueError("Input exceeds local planning limit")
    return json.loads(payload)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixture", action="store_true", help="Use committed synthetic evidence only")
    args = parser.parse_args()
    # Fixed slots avoid introducing another arbitrary-path CLI while #66 is P0.
    folder = ROOT / "rebuild" / ("ads/fixtures" if args.fixture else "test-artifacts/ad-grants")
    print(json.dumps(plan(read_json(folder / "audit-report.json"), read_json(folder / "existing-issues.json")), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
