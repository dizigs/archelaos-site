#!/usr/bin/env python3
"""Read-only GitHub Actions evidence. Never downloads logs, secrets or artifacts."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import secrets
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
SELF = ".github/workflows/automation-health.yml"
REPORT_PARTS = ("rebuild", "test-artifacts", "automation-health")


class EvidenceError(Exception):
    pass


class GitHub:
    def __init__(self, repository, token):
        if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
            raise EvidenceError("Invalid owner/repository")
        self.base = f"https://api.github.com/repos/{repository}/"
        self.token = token

    def get(self, path, **query):
        url = (self.base + path if path else self.base.rstrip("/"))
        url += "?" + urlencode(query) if query else ""
        headers = {"Accept": "application/vnd.github+json",
                   "X-GitHub-Api-Version": "2022-11-28"}
        if self.token:
            headers["Authorization"] = "Bearer " + self.token
        try:
            with urlopen(Request(url, headers=headers), timeout=30) as response:
                data = json.load(response)
            if not isinstance(data, dict):
                raise EvidenceError(f"GET {path}: unexpected JSON shape")
            return data
        except HTTPError as exc:
            # Never echo response bodies, credentials or signed redirects.
            raise EvidenceError(f"GET {path}: HTTP {exc.code}") from None
        except (URLError, TimeoutError, ValueError):
            raise EvidenceError(f"GET {path}: unavailable or invalid JSON") from None

    def workflows(self):
        result = []
        for page in range(1, 11):
            data = self.get("actions/workflows", per_page=100, page=page)
            items = data.get("workflows")
            if (not isinstance(items, list) or not all(isinstance(item, dict) for item in items)
                    or not isinstance(data.get("total_count"), int)):
                raise EvidenceError("Invalid workflow inventory")
            result.extend(items)
            if len(result) >= data["total_count"]:
                return result
            if not items:
                break
        raise EvidenceError("Workflow inventory incomplete; no health conclusion")

    def latest(self, workflow_id, branch, event=None):
        if not isinstance(workflow_id, int) or isinstance(workflow_id, bool) or workflow_id <= 0:
            raise EvidenceError("Invalid workflow ID")
        query = {"branch": branch, "per_page": 1}
        if event:
            query["event"] = event
        data = self.get(f"actions/workflows/{workflow_id}/runs", **query)
        runs = data.get("workflow_runs")
        if not isinstance(runs, list) or any(not isinstance(run, dict) for run in runs):
            raise EvidenceError("Invalid workflow-run response")
        return runs[0] if runs else None


def stamp(value):
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if result.tzinfo is None:
            raise ValueError
        return result
    except (AttributeError, TypeError, ValueError):
        raise EvidenceError("Missing/invalid run timestamp") from None


def run_evidence(run):
    if run is None:
        return None
    return {key: run.get(key) for key in
            ("id", "status", "conclusion", "created_at", "head_sha", "html_url", "event")}


def scheduled_state(run, now, max_age_hours):
    if run is None:
        return "missing"
    age = (now - stamp(run.get("created_at"))).total_seconds() / 3600
    if age < -0.1:
        raise EvidenceError("Run timestamp is in the future")
    if age > max_age_hours:
        return "stale"
    if run.get("status") in {"queued", "in_progress", "pending", "waiting", "requested"}:
        return "running"
    if run.get("status") != "completed":
        raise EvidenceError("Unknown run status")
    if run.get("conclusion") == "success":
        return "healthy"
    if run.get("conclusion") in {"failure", "timed_out", "action_required", "startup_failure"}:
        return "failed"
    if run.get("conclusion") in {"skipped", "cancelled", "neutral", "stale"}:
        return run["conclusion"]
    raise EvidenceError("Unknown run conclusion")


def validate_policy(root, policy):
    if (not isinstance(policy, dict) or policy.get("schema_version") != 1
            or not isinstance(policy.get("scheduled_workflows"), dict)):
        raise EvidenceError("Unsupported health policy")
    found = {}
    for path in (root / ".github/workflows").glob("*.y*ml"):
        relative = path.relative_to(root).as_posix()
        if relative == SELF:
            continue
        text = path.read_text()
        crons = re.findall(r"^\s*-\s*cron:\s*['\"]([^'\"\n]+)['\"]\s*$", text, re.M)
        # Fail closed when a schedule uses YAML syntax this small reader doesn't support.
        if re.search(r"^\s+schedule:", text, re.M) and not crons:
            raise EvidenceError(f"Unsupported schedule syntax: {relative}")
        if crons:
            found[relative] = crons
    expected = policy["scheduled_workflows"]
    if set(found) != set(expected):
        raise EvidenceError("Scheduled workflow inventory differs from health policy")
    for path, item in expected.items():
        if not isinstance(item, dict):
            raise EvidenceError(f"Invalid schedule policy: {path}")
        hours = item.get("max_age_hours")
        if (item.get("cron") != found[path] or isinstance(hours, bool)
                or not isinstance(hours, (int, float)) or not 0 < hours <= 24 * 31):
            raise EvidenceError(f"Invalid/drifted schedule policy: {path}")


def build_report(api, root, policy, now):
    validate_policy(root, policy)
    repo = api.get("")
    branch = repo.get("default_branch")
    if not isinstance(branch, str) or not branch:
        raise EvidenceError("Missing default branch")
    inventory = api.workflows()
    rows = []
    paths = set()
    access_error = None
    local_paths = {p.relative_to(root).as_posix()
                   for p in (root / ".github/workflows").glob("*.y*ml")}
    for workflow in sorted(inventory, key=lambda item: item.get("path", "")):
        path = workflow.get("path")
        if not isinstance(path, str):
            raise EvidenceError("Missing workflow path")
        paths.add(path)
        if path == SELF or path not in local_paths:
            continue
        row = {"path": path, "name": workflow.get("name", path),
               "workflow_state": workflow.get("state"), "latest_main": None,
               "latest_scheduled": None, "state": "unknown"}
        if workflow.get("state") != "active":
            row["state"] = "disabled" if workflow.get("state") else "unknown"
            rows.append(row)
            continue
        if access_error:
            row["error"] = "Not queried after previous API error"
            rows.append(row)
            continue
        try:
            latest = api.latest(workflow["id"], branch)
            scheduled = (api.latest(workflow["id"], branch, "schedule")
                         if path in policy["scheduled_workflows"] else None)
        except EvidenceError as exc:
            access_error = str(exc)
            row["error"] = access_error
            rows.append(row)
            continue
        row["latest_main"] = run_evidence(latest)
        if path in policy["scheduled_workflows"]:
            expected = policy["scheduled_workflows"][path]
            row["latest_scheduled"] = run_evidence(scheduled)
            row["max_age_hours"] = expected["max_age_hours"]
            row["state"] = scheduled_state(scheduled, now, expected["max_age_hours"])
        elif latest:
            row["state"] = scheduled_state(latest, now, float("inf"))
        else:
            row["state"] = "not_observed"  # No periodic deadline for event-driven jobs.
        # A successful old schedule cannot hide a newer failed main/manual run.
        if latest and latest.get("status") == "completed" and latest.get("conclusion") in {
                "failure", "timed_out", "action_required", "startup_failure"}:
            row["state"] = "failed"
        elif latest and latest.get("status") != "completed" and row["state"] == "healthy":
            row["state"] = "running"
        rows.append(row)
    for path in policy["scheduled_workflows"]:
        if path not in paths:
            rows.append({"path": path, "name": path, "state": "missing_workflow"})
    attention = [row["path"] for row in rows
                 if row["state"] not in {"healthy", "running", "not_observed"}]
    pending = any(row["state"] in {"running", "not_observed"} for row in rows)
    return {"schema_version": 1, "generated_utc": now.isoformat(), "default_branch": branch,
            "ok": not attention, "attention": attention, "workflows": rows,
            "assessment": "attention" if attention else "incomplete" if pending else "verified",
            "limitations": ["Running is pending evidence, not a pass.",
                            "This observer cannot prove its own liveness.",
                            "No secret inventory, external Sonar gate, deployment logs or private sources read."]}


def markdown(report):
    clean = lambda value: str(value).replace("|", "\\|").replace("\n", " ").replace("\r", " ")
    lines = ["## Automation health evidence", "", f"Generated: {report['generated_utc']}",
             "Assessment: " + report.get("assessment", "unavailable"), "",
             "| Workflow | State | Latest main run | Latest schedule run |",
             "| --- | --- | --- | --- |"]
    for row in report["workflows"]:
        main = (row.get("latest_main") or {}).get("id", "—")
        scheduled = (row.get("latest_scheduled") or {}).get("id", "—")
        lines.append(f"| {clean(row['path'])} | {row['state']} | {main} | {scheduled} |")
        if row.get("error"):
            lines.append(f"| {clean(row['error'])} | unknown | — | — |")
    lines += ["", "Running is not a pass. Missing/stale/disabled/failed/unknown evidence needs attention.",
              "No automatic repair, retries, PRs, source publication or deployment is performed."]
    if report.get("error"):
        lines += ["", "Evidence unavailable: " + clean(report["error"])]
    return "\n".join(lines) + "\n"


def write_report(name, content):
    """Write only fixed report names below an anchored, non-symlink directory."""
    if name not in {"automation-health-report.json", "automation-health-summary.md"}:
        raise EvidenceError("Unsupported report name")
    directory = os.open(ROOT, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for component in REPORT_PARTS:
            try:
                os.mkdir(component, mode=0o700, dir_fd=directory)
            except FileExistsError:
                pass
            child = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                            dir_fd=directory)
            os.close(directory)
            directory = child
        temporary = ".report-" + secrets.token_hex(16)
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                             0o600, dir_fd=directory)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as output:
                output.write(content)
            # Replace rather than follow any pre-existing report symlink/hardlink.
            os.replace(temporary, name, src_dir_fd=directory, dst_dir_fd=directory)
        finally:
            try:
                os.unlink(temporary, dir_fd=directory)
            except FileNotFoundError:
                pass
    finally:
        os.close(directory)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", default=os.getenv("GITHUB_REPOSITORY", "dizigs/archelaos-site"))
    args = parser.parse_args()
    now = datetime.now(timezone.utc)
    try:
        policy = json.loads((ROOT / ".github/automation-health-policy.json").read_text())
        api = GitHub(args.repository, os.getenv("GH_TOKEN") or os.getenv("GITHUB_TOKEN", ""))
        report = build_report(api, ROOT, policy, now)
    except (EvidenceError, OSError, ValueError, KeyError, TypeError) as exc:
        error = str(exc) if isinstance(exc, EvidenceError) else "Invalid local policy or API metadata"
        report = {"schema_version": 1, "generated_utc": now.isoformat(), "ok": False,
                  "workflows": [], "attention": ["evidence_unavailable"], "error": error}
    try:
        write_report("automation-health-report.json", json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        write_report("automation-health-summary.md", markdown(report))
    except OSError:
        print("Cannot safely write fixed report directory; no alternate path attempted.")
        return 1
    print(f"Automation health: {len(report['workflows'])} workflows, {len(report['attention'])} need attention.")
    if os.getenv("GITHUB_ACTIONS") == "true":
        counts = Counter(row["state"] for row in report["workflows"])
        details = "; ".join(f"{state}={count}" for state, count in sorted(counts.items()))
        print("::notice title=Automation health evidence::"
              f"total={len(report['workflows'])}; attention={len(report['attention'])}; " + details)
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
