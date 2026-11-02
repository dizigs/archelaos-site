#!/usr/bin/env python3
"""Privacy-minimized daily analytics anomaly triage; no content changes or tracking."""
import json
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

REPORT = Path("google-analytics-aggregate.json")
RESULT = Path("analytics-auto-triage.json")
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


def api_request(token, method, path, payload=None):
    url = "https://api.github.com/repos/" + REPO + "/" + path
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"Accept": "application/vnd.github+json",
               "Authorization": "Bearer " + token,
               "X-GitHub-Api-Version": "2022-11-28"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    request = Request(url, data=body, headers=headers, method=method)
    with urlopen(request, timeout=20) as response:
        return json.load(response)


def existing_issues(token):
    found = {}
    for page in range(1, 11):
        rows = api_request(token, "GET", "issues?" + urlencode(
            {"state": "open", "per_page": 100, "page": page}))
        if not isinstance(rows, list):
            raise ValueError("Unexpected GitHub issues response")
        for issue in rows:
            if ("pull_request" not in issue and isinstance(issue.get("title"), str)
                    and issue["title"].startswith(PREFIX)):
                found[issue["title"]] = issue["number"]
        if len(rows) < 100:
            return found
    raise ValueError("Issue pagination limit reached; refusing to create duplicates")


def synchronize(token, assessment):
    issues = existing_issues(token)
    actions = []
    for item in assessment["signals"]:
        name = PREFIX + " " + item["source"] + " " + item["metric"]
        state = item["state"]
        old_number = issues.get(name)
        if state == "alert" and old_number is None:
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
            created = api_request(token, "POST", "issues",
                                  {"title": name, "body": body})
            actions.append({"action": "opened", "number": created["number"], "signal": name})
        elif state == "recovered" and old_number is not None:
            api_request(token, "PATCH", "issues/" + str(old_number),
                        {"state": "closed", "state_reason": "completed"})
            actions.append({"action": "closed", "number": old_number, "signal": name})
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
    RESULT.write_text(json.dumps(assessment, ensure_ascii=False, indent=2) + "\n",
                      encoding="utf-8")
    print("Analytics triage: %s, %d alerts, %d issue state changes." %
          (assessment["status"], len(assessment["alerts"]),
           len(assessment["issue_actions"])))


if __name__ == "__main__":
    main()
