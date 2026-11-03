"""Bounded, read-only proof of a production deployment; no release operations."""
from datetime import datetime, timezone
from hashlib import sha256
import json
import re
from urllib.parse import urlsplit
from urllib.error import HTTPError
from urllib.request import HTTPRedirectHandler, Request, build_opener

SHA = re.compile(r"[0-9a-f]{40}")
UUID = re.compile(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}")
STAGES = {"queued", "initialize", "clone_repo", "build", "deploy"}
SITE = "https://archelaos.club/"
MAX_HTML = 2 * 1024 * 1024


def official_url(value):
    try:
        parsed = urlsplit(value)
        return (parsed.scheme == "https" and parsed.hostname in
                {"archelaos.club", "www.archelaos.club"} and not parsed.username
                and not parsed.password and parsed.port is None and not parsed.query
                and not parsed.fragment and parsed.path in ("/", "/index.html"))
    except (ValueError, TypeError):
        return False


class OfficialRedirects(HTTPRedirectHandler):
    max_redirections = 2
    max_repeats = 1

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not official_url(newurl):
            raise ValueError("Public verification redirected outside the approved site")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def public_http_health():
    """Check one public page, without credentials, cookies, retries or raw HTML logs."""
    request = Request(SITE, headers={"Accept": "text/html", "User-Agent": "ArchelaosDeploymentEvidence/1.0"})
    try:
        with build_opener(OfficialRedirects()).open(request, timeout=12) as response:
            if not official_url(response.geturl()) or response.status != 200:
                raise ValueError("Public verification did not return the approved page with HTTP 200")
            body = response.read(MAX_HTML + 1)
            if len(body) > MAX_HTML:
                raise ValueError("Public HTML exceeds verification limit")
            html = body.decode("utf-8", errors="replace")
            healthy = "<main" in html.lower() and "/assets/site/js/shell.js" in html and "</html>" in html.lower()
            return {"healthy": healthy, "status": response.status, "url": response.geturl(),
                    "bytes": len(body), "htmlSha256": sha256(body).hexdigest(),
                    "scope": "HTTP and static page landmarks only; no browser interaction claim"}
    except HTTPError as error:
        server = (error.headers.get("Server") or "").lower() if error.headers else ""
        return {"healthy": False, "status": error.code, "url": SITE,
                "endpoint": "GET " + SITE, "errorClass": "HTTPError",
                "responseLayer": "proxy_http" if server == "envoy" else "site_http" if server == "cloudflare" else "UNKNOWN"}
    except (OSError, ValueError) as error:
        connect = re.search(r"(?:CONNECT tunnel failed|Tunnel connection failed)[^\n]*\b(403)\b", str(error))
        return {"healthy": False, "status": 403 if connect else None, "url": SITE,
                "endpoint": "GET " + SITE, "errorClass": type(error).__name__,
                "responseLayer": "transport_connect" if connect else "transport_or_validation_unavailable"}


def commit_of(deployment):
    trigger = deployment.get("deployment_trigger") or {}
    if not isinstance(trigger, dict):
        raise ValueError("Unexpected provider trigger schema")
    metadata = trigger.get("metadata") or {}
    if not isinstance(metadata, dict):
        raise ValueError("Unexpected provider commit metadata")
    return metadata.get("commit_hash"), metadata.get("branch")


def deployment_metadata(deployment, project):
    """Preserve the existing report fields using bounded public provider metadata."""
    commit, _ = commit_of(deployment)
    if not isinstance(commit, str) or not SHA.fullmatch(commit):
        raise ValueError("Invalid provider metadata commit")
    stage = deployment.get("latest_stage") or {}
    if not isinstance(stage, dict):
        raise ValueError("Unexpected latest-stage metadata")
    url = deployment.get("url")
    try:
        parsed = urlsplit(url) if isinstance(url, str) else None
        trusted_url = (parsed and parsed.scheme == "https" and not parsed.username and not parsed.password
                       and parsed.port is None and not parsed.query and not parsed.fragment
                       and (parsed.hostname == project + ".pages.dev" or re.fullmatch(
                           r"[a-z0-9-]{1,63}\." + re.escape(project) + r"\.pages\.dev", parsed.hostname or "")))
    except ValueError:
        trusted_url = False
    identifier = deployment.get("id")
    environment = deployment.get("environment")
    stage_name, stage_status = stage.get("name"), stage.get("status")
    known_statuses = {"success", "failure", "active", "idle", "queued", "canceled", "cancelled"}
    return {"id": identifier if isinstance(identifier, str) and UUID.fullmatch(identifier) else None,
            "created_on": timestamp(deployment.get("created_on")).isoformat(),
            "environment": environment if environment in ("production", "preview") else "UNKNOWN",
            "latest_stage": stage_name if isinstance(stage_name, str) and stage_name in STAGES else "UNKNOWN",
            "status": stage_status if isinstance(stage_status, str) and stage_status in known_statuses else "UNKNOWN",
            "url": url if trusted_url else None, "commit_hash": commit}


def timestamp(value):
    if not isinstance(value, str):
        raise ValueError("Provider timestamp missing")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Provider timestamp has no timezone")
    return parsed


def safe_log_time(value):
    try:
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            parsed = datetime.fromtimestamp(value / 1000 if value > 10**12 else value, timezone.utc)
        else:
            parsed = timestamp(value)
        return parsed.astimezone(timezone.utc).isoformat() if 2000 <= parsed.year <= 2100 else None
    except (ValueError, TypeError, OverflowError, OSError):
        return None


def log_evidence(logs):
    """Retain only known terminal phrases, never arbitrary build lines or credentials."""
    if not isinstance(logs, dict) or not isinstance(logs.get("data"), list):
        raise ValueError("Unexpected provider build-log schema")
    rows = logs["data"]
    if not rows or len(rows) > 10000:
        raise ValueError("Provider log record count outside bounds")
    excerpts = []
    terminal = False
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("line"), str) or len(row["line"]) > 65536:
            raise ValueError("Unexpected provider build-log record")
        line = row["line"].strip()
        deployed = re.fullmatch(r"(?:Success:\s*)?Your site was deployed!?", line) is not None
        assets = re.fullmatch(r"(?:Success:\s*)?Assets published!?", line) is not None
        if deployed or assets:
            excerpts.append({"message": "Your site was deployed!" if deployed else "Assets published!",
                             "observedAt": safe_log_time(row.get("ts"))})
            terminal = terminal or deployed
        elif terminal and re.match(r"(?:error:|failed\b|failure:)", line, re.I):
            raise ValueError("Provider reports failure after the deployment milestone")
    return {"terminalSuccessSeen": terminal, "observedLines": len(rows),
            "milestones": excerpts[-4:],
            "normalizedLogSha256": sha256(json.dumps(logs, sort_keys=True).encode()).hexdigest()}


def verify_deployment(deployments, api, account, project, expected_sha, http_check=public_http_health):
    """Verify the newest production deployment, never fall back to an older success."""
    if not isinstance(expected_sha, str) or not SHA.fullmatch(expected_sha):
        raise ValueError("A full current-main SHA is required")
    if not re.fullmatch(r"[0-9a-f]{32}", account) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,57}", project):
        raise ValueError("Invalid configured account/project identifiers")
    evidence = {"schemaVersion": 1, "status": "NOT_VERIFIED", "expectedCommit": expected_sha,
                "productionMutationPerformed": False, "attempts": 1}
    if not isinstance(deployments, list) or len(deployments) > 100:
        raise ValueError("Unexpected provider deployment listing")
    production = [d for d in deployments if isinstance(d, dict) and d.get("environment") == "production"]
    if not production:
        return {**evidence, "reason": "no_production_deployment"}
    latest = max(production, key=lambda d: timestamp(d.get("created_on")))
    sha, branch = commit_of(latest)
    if sha != expected_sha or branch not in (None, "main"):
        return {**evidence, "reason": "latest_production_commit_mismatch"}
    identifier = latest.get("id")
    if not isinstance(identifier, str) or not UUID.fullmatch(identifier):
        raise ValueError("Invalid production deployment ID")
    prefix = "/accounts/" + account + "/pages/projects/" + project + "/deployments/" + identifier
    detail = api(prefix)
    if not isinstance(detail, dict) or detail.get("id") != identifier:
        raise ValueError("Unexpected provider deployment detail")
    sha, branch = commit_of(detail)
    if not isinstance(sha, str) or not SHA.fullmatch(sha):
        raise ValueError("Invalid provider commit identifier")
    evidence.update({"deploymentId": identifier, "observedCommit": sha, "environment": detail.get("environment")})
    if sha != expected_sha or branch not in (None, "main") or detail.get("environment") != "production":
        return {**evidence, "reason": "deployment_detail_mismatch"}
    stages = detail.get("stages")
    if not isinstance(stages, list) or any(not isinstance(s, dict) for s in stages):
        return {**evidence, "reason": "deployment_stages_unavailable"}
    if len(stages) != len(STAGES) or any(not isinstance(s.get("name"), str) or s["name"] not in STAGES for s in stages):
        return {**evidence, "reason": "deployment_stage_schema_mismatch"}
    statuses = {s["name"]: s.get("status") for s in stages}
    allowed_statuses = {"success", "failure", "active", "idle", "queued", "canceled", "cancelled"}
    evidence["stages"] = {name: statuses.get(name) if isinstance(statuses.get(name), str) and statuses[name] in allowed_statuses else "UNKNOWN"
                          for name in sorted(STAGES)}
    if set(statuses) != STAGES or any(s != "success" for s in statuses.values()):
        return {**evidence, "reason": "production_stages_not_all_successful"}
    logs = log_evidence(api(prefix + "/history/logs"))
    evidence["buildLogs"] = logs
    if not logs["terminalSuccessSeen"]:
        return {**evidence, "reason": "terminal_provider_log_missing"}
    health = http_check()
    if isinstance(health, dict):
        evidence["httpHealth"] = {key: health.get(key) for key in
            ("healthy", "status", "url", "endpoint", "bytes", "htmlSha256", "scope", "errorClass", "responseLayer")}
    if (not isinstance(health, dict) or health.get("healthy") is not True or health.get("status") != 200
            or not official_url(health.get("url"))
            or not isinstance(health.get("htmlSha256"), str)
            or not re.fullmatch(r"[0-9a-f]{64}", health["htmlSha256"])
            or not isinstance(health.get("bytes"), int) or not 0 < health["bytes"] <= MAX_HTML):
        return {**evidence, "reason": "post_deployment_http_failed"}
    return {**evidence, "status": "VERIFIED", "reason": "exact_commit_stages_real_logs_and_http"}
