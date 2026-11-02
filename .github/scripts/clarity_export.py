#!/usr/bin/env python3
"""Fetch privacy-minimized Microsoft Clarity aggregate metrics; never store raw response."""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

TOKEN = os.environ.get("CLARITY_API_TOKEN", "")
OUT = Path("clarity-aggregate-report.json")
FIELDS = {"totalSessionCount", "totalBotSessionCount", "distantUserCount",
          "PagesPerSessionPercentage", "scrollDepth", "engagementTime",
          "deadClickCount", "rageClickCount", "quickbackClickCount",
          "scriptErrorCount", "errorClickCount", "excessiveScrollCount"}
DEVICES = {"Desktop", "Mobile", "Tablet", "Other"}
if not TOKEN:
    sys.exit("CLARITY_API_TOKEN not available: configure repository Actions secret.")
url = "https://www.clarity.ms/export-data/api/v1/project-live-insights?" + urlencode(
    {"numOfDays": 1, "dimension1": "Device"})
req = Request(url, headers={"Authorization": "Bearer " + TOKEN, "Accept": "application/json"})
try:
    with urlopen(req, timeout=30) as res:
        raw = json.load(res)
except HTTPError as exc:
    sys.exit("Clarity export failed: HTTP %s (no token or response logged)" % exc.code)
except (URLError, TimeoutError, ValueError) as exc:
    sys.exit("Clarity export unavailable or invalid JSON (details suppressed)")
if not isinstance(raw, list):
    sys.exit("Clarity export returned an unexpected schema")
report = {"date_utc": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
          "range": "previous 24 hours", "breakdown": "Device", "metrics": []}
for metric in raw:
    if not isinstance(metric, dict):
        continue
    metric_name = metric.get("metricName")
    if not isinstance(metric_name, str) or not metric_name.replace(" ", "").isalpha():
        continue
    rows = []
    for item in metric.get("information", []):
        if not isinstance(item, dict):
            continue
        device = item.get("Device", "Other")
        device = device if device in DEVICES else "Other"
        values = {"Device": device}
        for key in FIELDS:
            value = item.get(key)
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                values[key] = value
            elif isinstance(value, str):
                try:
                    values[key] = float(value) if "." in value else int(value)
                except ValueError:
                    pass
        if len(values) > 1:
            rows.append(values)
    if rows:
        report["metrics"].append({"metric": metric_name[:64], "rows": rows[:15]})
OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("Clarity aggregate report saved: %d metric groups; no raw response, URLs, or identifiers." %
      len(report["metrics"]))
