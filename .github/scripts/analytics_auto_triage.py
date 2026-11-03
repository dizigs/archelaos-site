#!/usr/bin/env python3
"""Privacy-minimized daily analytics anomaly triage; no content changes or tracking."""
import json
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import re
from urllib.request import Request, urlopen

REPORT = Path("google-analytics-aggregate.json")
PREFIX = "[analytics:auto]"
REPO = "dizigs/archelaos-site"
SOURCES = {
    "search_console": (("clicks", 40), ("impressions", 300)),
    "ga4": (("sessions", 40), ("pageViews", 80)),
}


def parse_day(value):
    if not isinstance(value, str):
        raise ValueError("Date must be text")
    return datetime.strptime(value, "%Y%m%d" if len(value) == 8 else "%Y-%m-%d").date()


def series_windows(rows, metric, today):
    if not isinstance(rows, list):
        return {"state": "insufficient_data"}
    values = {}
    for item in rows:
        if not isinstance(item, dict):
            continue
        try:
            d = parse_day(item.get("date"))
            val = item.get(metric)
            if isinstance(val, bool) or not isinstance(val, (int, float)) or val < 0:
                continue
            if d <= today:
                values[d] = float(val)
        except (TypeError, ValueError):
            continue
    if not values:
        return {"state": "insufficient_data"}
    last = max(values)
    if (today - last).days > 5:
        return {"state": "stale", "last_date": last.isoformat()}
    recent = [last - timedelta(days=i) for i in range(6, -1, -1)]
    previous = [last - timedelta(days=i) for i in range(13, 6, -1)]
    if not all(d in values for d in recent + previous):
        return {"state": "insufficient_data", "last_date": last.isoformat()}
    a = sum(values[d] for d in recent)
    b = sum(values[d] for d in previous)
    return {"state": "ready", "last_date": last.isoformat(),
            "previous": round(b, 2), "recent": round(a, 2)}


def evaluate(raw, today=None):
    today = today or date.today()
    alerts, signals = [], []
    for source, specs in SOURCES.items():
        section = raw.get(source, {}) if isinstance(raw, dict) else {}
        rows = section.get("daily", []) if isinstance(section, dict) else []
        for metric, minimum in specs:
            window = series_windows(rows, metric, today)
            item = {"source": source, "metric": metric, **window}
            if window["state"] == "ready" and window["previous"] >= minimum:
                delta = (window["recent"] - window["previous"]) / window["previous"]
                item["change_percent"] = round(100 * delta, 1)
                if delta <= -0.35:
                    item["state"] = "alert"
                    alerts.append(item)
                elif delta >= -0.10:
                    item["state"] = "recovered"
            signals.append(item)
    return {"generated_utc": datetime.now(timezone.utc).isoformat(),
            "comparison": "latest complete 7 days vs preceding 7 days",
            "status": "attention" if alerts else "no_confirmed_anomaly",
            "alerts": alerts, "signals": signals,
            "note": "Aggregates only; low-volume, incomplete and stale data never trigger traffic-drop issues."}


# These are the ONLY remote endpoints. Issue metadata never becomes part of a URL.
ISSUES_ENDPOINT = "https://api.github.com/repos/dizigs/archelaos-site/issues"
GRAPHQL_ENDPOINT = "https://api.github.com/graphql"
CLOSE_ISSUE_MUTATION = (
    "mutation CloseAnalyticsIssue($issueId: ID!) { "
    "closeIssue(input: {issueId: $issueId, stateReason: COMPLETED}) "
    "{ issue { state } } }"
)


def api_request(token, operation, payload=None, page=None):
    """Restrict requests to preselected GitHub operations and fixed host paths."""
    if operation == "list":
        if type(page) is not int or not 1 <= page <= 10 or payload is not None:
            raise ValueError("Invalid issue inventory request")
        url = ISSUES_ENDPOINT + "?state=open&per_page=100&page=" + str(page)
        method = "GET"
    elif operation == "create":
        if (page is not None or not isinstance(payload, dict)
                or set(payload) != {"title", "body"}):
            raise ValueError("Invalid issue creation request")
        url = ISSUES_ENDPOINT
        method = "POST"
    elif operation == "close":
        if (page is not None or not isinstance(payload, dict)
                or set(payload) != {"issueId"}):
            raise ValueError("Invalid issue close request")
        node_id = payload["issueId"]
        if (not isinstance(node_id, str)
                or not re.fullmatch(r"[A-Za-z0-9_=-]{8,256}", node_id)):
            raise ValueError("Unsafe GitHub GraphQL issue ID")
        url = GRAPHQL_ENDPOINT
        method = "POST"
        payload = {"query": CLOSE_ISSUE_MUTATION, "variables": {"issueId": node_id}}
    else:
        raise ValueError("Unsupported GitHub API operation")

    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"Accept": "application/vnd.github+json",
               "Authorization": "Bearer " + token,
               "X-GitHub-Api-Version": "2022-11-28"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    request = Request(url, data=body, headers=headers, method=method)
    with urlopen(request, timeout=20) as response:
        result = json.load(response)
    if operation == "close":
        if (not isinstance(result, dict) or result.get("errors")
                or result.get("data", {}).get("closeIssue", {}).get("issue", {}).get("state") != "CLOSED"):
            raise RuntimeError("GitHub GraphQL did not confirm issue closure")
    return result


def existing_issues(token):
    found = {}
    titles = {PREFIX + " " + source + " " + metric
              for source, specs in SOURCES.items() for metric, _ in specs}
    for page in range(1, 11):
        rows = api_request(token, "list", page=page)
        if not isinstance(rows, list) or len(rows) > 100:
            raise ValueError("Unexpected GitHub issues response")
        for issue in rows:
            if not isinstance(issue, dict):
                raise ValueError("Invalid GitHub issue metadata")
            title = issue.get("title")
            if "pull_request" in issue or title not in titles:
                continue
            # Untrusted issue metadata may be displayed, but may never form a URL,
            # a filesystem path, a mutation query or a raw HTTP method.
            number = issue.get("number")
            node_id = issue.get("node_id")
            if (type(number) is not int or not 1 <= number <= 2_147_483_647
                    or not isinstance(node_id, str)
                    or not re.fullmatch(r"[A-Za-z0-9_\-=]{8,256}", node_id)):
                raise ValueError("Untrusted analytics issue identifier")
            if title not in found:
                found[title] = {"number": number, "node_id": node_id}
        if len(rows) < 100:
            return found
    raise ValueError("Issue pagination limit reached; refusing to create duplicates")


def synchronize(token, assessment):
    issues = existing_issues(token)
    actions = []
    for item in assessment["signals"]:
        name = PREFIX + " " + item["source"] + " " + item["metric"]
        state = item["state"]
        old = issues.get(name)
        if state == "alert" and old is None:
            body = (
                "Daily automated, **aggregate-only** alert (not a confirmed site outage).\n\n"
                "Source: **" + item["source"] + "**; metric: **" + item["metric"] + "**.\n"
                "Previous 7 days: **" + str(item["previous"]) + "**; latest 7 days: **"
                + str(item["recent"]) + "**; change: **" + str(item["change_percent"])
                + "%**; last reporting date: **" + item["last_date"] + "**.\n\n"
                "Check data freshness, site availability, seasonality, consent and relevant "
                "content before acting. No visitor identifiers or search terms are included. "
                "Never rewrite biographies or enable ads solely from this signal.\n"
            )
            created = api_request(token, "create", {"title": name, "body": body})
            number = created.get("number") if isinstance(created, dict) else None
            if type(number) is not int or not 1 <= number <= 2_147_483_647:
                raise ValueError("GitHub did not confirm created issue")
            actions.append({"action": "opened", "number": number, "signal": name})
        elif state == "recovered" and old is not None:
            api_request(token, "close", {"issueId": old["node_id"]})
            actions.append({"action": "closed", "number": old["number"], "signal": name})
    return actions



def main():
    if not REPORT.is_file() or REPORT.is_symlink():
        raise SystemExit("Google aggregate report missing or unsafe")
    with REPORT.open(encoding="utf-8") as file:
        report = json.load(file)
    assessment = evaluate(report)
    token = os.getenv("ANALYTICS_ISSUE_TOKEN", "")
    if not token or os.getenv("GITHUB_REPOSITORY") != REPO:
        raise SystemExit("Expected main-repo issue permissions not available")
    assessment["issue_actions"] = synchronize(token, assessment)
    print("Analytics triage: %s, %d alerts, %d issue state changes." %
          (assessment["status"], len(assessment["alerts"]),
           len(assessment["issue_actions"])))


if __name__ == "__main__":
    main()
