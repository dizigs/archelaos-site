#!/usr/bin/env python3
"""Mirror public GitHub PR/issue lifecycle facts into existing issue #71.

No private ChatGPT data or Google credentials. Intended for GitHub Actions
pull_request_target/issues events. One idempotent [TRACKER-EVENT] comment per
public PR or issue, so the existing ChatGPT daily job can reconcile Sheets.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any

INBOX_ISSUE = 71
EXPECTED_REPO = "dizigs/archelaos-site"
API = "https://api.github.com"
MAX_PAGES = 20


def compact_title(title: str) -> str:
    # Public title only, never descriptions, comments, author data or private URLs.
    return " ".join(title.split())[:160]


def build_record(event_name: str, payload: dict[str, Any]) -> dict[str, str] | None:
    if event_name == "pull_request_target":
        obj = payload.get("pull_request") or {}
        kind = "PR"
        number = obj.get("number") or payload.get("number")
        state = "merged" if obj.get("merged") else obj.get("state", "unknown")
        if state == "open" and obj.get("draft"):
            state = "draft"
        sha = (obj.get("head") or {}).get("sha") or "unknown"
        url = obj.get("html_url") or ""
    elif event_name == "issues":
        obj = payload.get("issue") or {}
        kind = "ISS"
        number = obj.get("number") or payload.get("number")
        # Pull requests are issues in the REST API; handle only their PR event.
        if obj.get("pull_request"):
            return None
        state = obj.get("state") or "unknown"
        sha = "-"
        url = obj.get("html_url") or ""
    else:
        return None

    if not isinstance(number, int) or number <= 0 or (kind == "ISS" and number == INBOX_ISSUE):
        return None

    if not url.startswith(f"https://github.com/{EXPECTED_REPO}/"):
        raise ValueError("unexpected PR/issue URL host or repository")
    action = str(payload.get("action") or "unknown")
    updated = str(obj.get("updated_at") or obj.get("closed_at") or "")
    title = compact_title(str(obj.get("title") or "(untitled)"))
    marker = f"<!-- archelaos-tracker-event:v1:{kind}:{number} -->"
    body = (
        f"{marker}\n"
        f"[TRACKER-EVENT] **{kind}-{number}** — {state}\n\n"
        f"- Public source: {url}\n"
        f"- Title: {json.dumps(title, ensure_ascii=False)}\n"
        f"- Last GitHub action: \`{action}\`\n"
        f"- GitHub updated_at (UTC): \`{updated}\`\n"
        f"- PR head SHA: \`{sha}\`\n"
        f"- Reconciliation: **pending**. The daily ChatGPT audit may upsert this "
        "public event to the private Live Sheet using an authorized connector.\n\n"
        "This is a public GitHub event record, **not** a confirmed Sheet update, "
        "completed task, successful CI run or Cloudflare production deployment."
    )
    return {"marker": marker, "body": body, "task_id": f"{kind}-{number}"}


def api_request(token: str, path: str, method: str = "GET", data: dict | None = None) -> Any:
    body = json.dumps(data, ensure_ascii=False).encode("utf-8") if data is not None else None
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "archelaos-tracker-mirror",
    }
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(API + path, headers=headers, data=body, method=method)
    with urllib.request.urlopen(req, timeout=25) as response:
        payload = response.read()
    return json.loads(payload) if payload else None


def upsert_comment(token: str, record: dict[str, str]) -> str:
    comment_id = None
    old_body = None
    for page in range(1, MAX_PAGES + 1):
        comments = api_request(
            token, f"/repos/{EXPECTED_REPO}/issues/{INBOX_ISSUE}/comments?per_page=100&page={page}"
        )
        for comment in comments:
            if record["marker"] in (comment.get("body") or ""):
                comment_id = comment["id"]
                old_body = comment["body"]
                break
        if comment_id is not None or len(comments) < 100:
            break
    else:
        raise RuntimeError("Issue #71 comment search exceeded safe pagination bound")

    if comment_id is not None and old_body == record["body"]:
        return "unchanged"
    if comment_id is not None:
        api_request(
            token, f"/repos/{EXPECTED_REPO}/issues/comments/{comment_id}",
            method="PATCH", data={"body": record["body"]},
        )
        return "updated"
    api_request(
        token, f"/repos/{EXPECTED_REPO}/issues/{INBOX_ISSUE}/comments",
        method="POST", data={"body": record["body"]},
    )
    return "created"


def main() -> int:
    if os.environ.get("GITHUB_REPOSITORY") != EXPECTED_REPO:
        print("Error: unexpected repository", file=sys.stderr)
        return 2
    path = os.environ.get("GITHUB_EVENT_PATH")
    token = os.environ.get("GH_TOKEN")
    if not path or not token:
        print("Error: missing GitHub Actions event path or token", file=sys.stderr)
        return 2
    with open(path, encoding="utf-8") as handle:
        payload = json.load(handle)
    rec = build_record(os.environ.get("GITHUB_EVENT_NAME", ""), payload)
    if rec is None:
        print("Skipped: not a supported tracking event")
        return 0
    result = upsert_comment(token, rec)
    print(f"Tracker inbox for {rec['task_id']}: {result}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
