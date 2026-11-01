#!/usr/bin/env python3
"""Read-only Cloudflare Pages deployment audit (never print credentials)."""
import json
import os
import sys
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
ACCOUNT = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "").strip()
PROJECT = os.environ.get("CLOUDFLARE_PAGES_PROJECT", "").strip()
API = "https://api.cloudflare.com/client/v4"

def api(path):
    req = Request(API + path, headers={"Authorization": "Bearer " + TOKEN, "Accept": "application/json"})
    try:
        with urlopen(req, timeout=18) as res:
            data = json.load(res)
    except HTTPError as err:
        raise RuntimeError(f"Cloudflare API HTTP {err.code}; check token permissions and account/project IDs") from None
    except (URLError, ValueError) as err:
        raise RuntimeError("Cloudflare API unavailable or invalid JSON response") from None
    if not data.get("success"):
        codes = [str(x.get("code")) for x in data.get("errors", [])]
        raise RuntimeError("Cloudflare API error code(s): " + ", ".join(codes))
    return data.get("result")

def main():
    if not TOKEN:
        raise RuntimeError("Missing CLOUDFLARE_API_TOKEN GitHub Actions secret")
    account = ACCOUNT
    if not account:
        accounts = api("/accounts?per_page=50")
        if len(accounts) != 1:
            raise RuntimeError("Set CLOUDFLARE_ACCOUNT_ID GitHub Actions variable (account not uniquely discoverable)")
        account = accounts[0]["id"]
    project = PROJECT
    if not project:
        projects = api("/accounts/" + account + "/pages/projects?per_page=100")
        match = [p for p in projects if p.get("subdomain") == "archelaos.club" or p.get("name") == "archelaos-site" or "archelaos.club" in (p.get("domains") or [])]
        if len(match) != 1:
            raise RuntimeError("Set CLOUDFLARE_PAGES_PROJECT GitHub Actions variable (project not uniquely discoverable)")
        project = match[0]["name"]
    deployments = api("/accounts/" + account + "/pages/projects/" + project + "/deployments?per_page=10")
    results = []
    for d in deployments:
        deploy = d.get("deployment_trigger") or {}
        metadata = deploy.get("metadata") or {}
        results.append({
            "id": d.get("id"),
            "created_on": d.get("created_on"),
            "environment": d.get("environment"),
            "latest_stage": (d.get("latest_stage") or {}).get("name"),
            "status": (d.get("latest_stage") or {}).get("status"),
            "url": d.get("url"),
            "commit_hash": metadata.get("commit_hash"),
        })
    report = {"project": project, "deployments": results}
    with open("cloudflare-pages-status.json", "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print("Cloudflare project:", project)
    for d in results[:5]:
        print(d["created_on"], d["environment"], d["latest_stage"], d["status"], (d["commit_hash"] or "")[:10])
    if not results:
        raise RuntimeError("No Pages deployments returned")
    if results[0]["status"] not in ("success",):
        print("WARNING: Most recent deployment status is not success (may be in progress)")
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print("Cloudflare status check:", exc, file=sys.stderr)
        sys.exit(1)
