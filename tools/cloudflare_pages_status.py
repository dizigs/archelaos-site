#!/usr/bin/env python3
"""Read-only Cloudflare deployment proof. Never deploy or publish raw build logs."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

from cloudflare_deployment_evidence import verify_deployment, deployment_metadata, SHA

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from rebuild.tools.public_snapshot import output_directory, replace_report

TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
ACCOUNT = (os.environ.get("CLOUDFLARE_ACCOUNT_ID") or "898359728b3dfe8c3a3f56e3d19eecd1").strip()
PROJECT = (os.environ.get("CLOUDFLARE_PAGES_PROJECT") or "archelaos-site").strip()
API = "https://api.cloudflare.com/client/v4"
MAIN_ENDPOINT = "repos/dizigs/archelaos-site/git/ref/heads/main"
MAX_API_BODY = 8 * 1024 * 1024


class ProviderFailure(RuntimeError):
    def __init__(self, path, status=None, codes=(), layer="UNKNOWN"):
        self.evidence = {"endpoint": "GET " + API + path, "httpStatus": status,
                         "errorCodes": list(codes), "responseLayer": layer}
        super().__init__(f"Cloudflare GET {path}: HTTP {status}; layer {layer}; error codes {list(codes)}")


class GitHubAccessFailure(RuntimeError):
    pass


class NoProviderRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward the Authorization header to a redirect destination.
        raise ProviderFailure(req.full_url.removeprefix(API), code, (), "redirect_refused")


def provider_open(request):
    return build_opener(NoProviderRedirects()).open(request, timeout=18)


def error_codes(data):
    if not isinstance(data, dict) or not isinstance(data.get("errors"), list):
        return []
    return [str(row["code"]) for row in data["errors"][:8] if isinstance(row, dict)
            and re.fullmatch(r"[0-9]{1,12}", str(row.get("code", "")))]


def api(path):
    request = Request(API + path, headers={"Authorization": "Bearer " + TOKEN, "Accept": "application/json"})
    try:
        with provider_open(request) as response:
            payload = response.read(MAX_API_BODY + 1)
            if len(payload) > MAX_API_BODY:
                raise ValueError("Provider response exceeds limit")
            data = json.loads(payload)
    except HTTPError as error:
        server = (error.headers.get("Server") or "").lower() if error.headers else ""
        layer = "provider_http" if server == "cloudflare" else "proxy_http" if server == "envoy" else "UNKNOWN"
        try:
            codes = error_codes(json.loads(error.read(16384)))
        except (ValueError, OSError):
            codes = []
        raise ProviderFailure(path, error.code, codes, layer) from None
    except OSError as error:
        connect = re.search(r"(?:CONNECT tunnel failed|Tunnel connection failed)[^\n]*\b(403)\b", str(error))
        raise ProviderFailure(path, 403 if connect else None, (),
                              "transport_connect" if connect else "transport_unavailable") from None
    if not isinstance(data, dict) or data.get("success") is not True:
        raise ProviderFailure(path, 200, error_codes(data), "provider_application")
    return data.get("result")


def current_main():
    result = subprocess.run(["gh", "api", MAIN_ENDPOINT, "--jq", ".object.sha"],
                            capture_output=True, text=True, timeout=30, check=False)
    if result.returncode:
        known = "Resource not accessible by integration" if "Resource not accessible by integration" in result.stderr else "unclassified response"
        status = re.search(r"HTTP\s+(\d{3})", result.stderr)
        raise GitHubAccessFailure("GET https://api.github.com/" + MAIN_ENDPOINT + ": " + known +
                           (" HTTP " + status[1] if status else ""))
    sha = result.stdout.strip()
    if not SHA.fullmatch(sha):
        raise ValueError("GitHub did not return a full main SHA")
    return sha


def write_report(report):
    payload = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    with output_directory(()) as directory:
        replace_report(directory, "cloudflare-pages-status.json", payload)


def main():
    project_label = PROJECT if re.fullmatch(r"[a-z0-9][a-z0-9-]{0,57}", PROJECT) else "INVALID_CONFIG"
    report = {"project": project_label, "deployments": [], "verification":
              {"schemaVersion": 1, "status": "NOT_VERIFIED", "productionMutationPerformed": False}}
    try:
        if not TOKEN:
            report["verification"]["reason"] = "missing_runtime_credential"
        else:
            if not re.fullmatch(r"[0-9a-f]{32}", ACCOUNT) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,57}", PROJECT):
                raise ValueError("Invalid configured provider identifiers")
            expected = current_main()
            report["verification"]["expectedCommit"] = expected
            deployments = api("/accounts/" + ACCOUNT + "/pages/projects/" + PROJECT + "/deployments?per_page=10")
            if not isinstance(deployments, list) or len(deployments) > 100:
                raise ValueError("Invalid deployment listing")
            for item in deployments[:10]:
                if not isinstance(item, dict):
                    raise ValueError("Invalid deployment record")
                report["deployments"].append(deployment_metadata(item, PROJECT))
            report["verification"] = verify_deployment(deployments, api, ACCOUNT, PROJECT, expected)
            if report["verification"]["status"] == "VERIFIED" and current_main() != expected:
                report["verification"].update(status="NOT_VERIFIED", reason="main_advanced_during_verification")
    except ProviderFailure as error:
        report["verification"].update(status="NOT_VERIFIED", reason="provider_api_error", access=error.evidence)
    except GitHubAccessFailure as error:
        report["verification"].update(status="NOT_VERIFIED", reason="github_evidence_unavailable", githubAccess=str(error))
    except (OSError, ValueError, RuntimeError, URLError, subprocess.TimeoutExpired) as error:
        report["verification"].update(status="NOT_VERIFIED", reason="evidence_unavailable", errorClass=type(error).__name__)
    write_report(report)
    evidence = report["verification"]
    notice = {key: evidence.get(key) for key in
              ("status", "reason", "expectedCommit", "observedCommit", "deploymentId", "environment", "stages", "access")}
    if "buildLogs" in evidence:
        notice["buildLogMilestones"] = evidence["buildLogs"]["milestones"]
        notice["normalizedLogSha256"] = evidence["buildLogs"]["normalizedLogSha256"]
    if "httpHealth" in evidence:
        notice["httpHealth"] = evidence["httpHealth"]
    message = json.dumps(notice, ensure_ascii=True).replace("%", "%25")
    if os.environ.get("GITHUB_ACTIONS") == "true":
        print("::notice title=Cloudflare production evidence::" + message)
    else:
        print(message)
    return 0 if evidence["status"] == "VERIFIED" else 1


if __name__ == "__main__":
    sys.exit(main())
