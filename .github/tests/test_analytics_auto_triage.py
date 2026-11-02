"""Offline regressions for fully automatic, privacy-safe GA4/GSC anomaly triage."""
import importlib.util
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / ".github/scripts/analytics_auto_triage.py"
spec = importlib.util.spec_from_file_location("analytics_auto_triage", SCRIPT)
triage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(triage)
TODAY = date(2026, 11, 3)


def daily(start=date(2026, 10, 4), count=28, early=20, recent=10, field="clicks",
          format_compact=False):
    out = []
    for i in range(count):
        d = start + timedelta(days=i)
        value = recent if i >= count - 7 else early
        out.append({"date": d.strftime("%Y%m%d") if format_compact else d.isoformat(),
                    field: value})
    return out


class AnalyticsTriageTests(unittest.TestCase):
    def test_detects_actual_drops_from_complete_windows(self):
        # Last period ends 2026-10-31, within the expected three-day export lag.
        rows = daily(field="clicks", early=20, recent=5)
        result = triage.series_windows(rows, "clicks", TODAY)
        self.assertEqual(result["state"], "ready")
        self.assertEqual(result["previous"], 140)
        self.assertEqual(result["recent"], 35)
        summary = triage.evaluate({"search_console": {"daily": rows}}, TODAY)
        self.assertEqual(len(summary["alerts"]), 1)
        self.assertEqual(summary["alerts"][0]["metric"], "clicks")

    def test_no_false_alert_from_low_volume_or_incomplete_days(self):
        few = daily(field="clicks", early=2, recent=0)
        self.assertFalse(triage.evaluate(
            {"search_console": {"daily": few}}, TODAY)["alerts"])
        missing = daily(field="clicks", early=20, recent=0)[:-2]
        self.assertEqual(triage.series_windows(
            missing, "clicks", TODAY)["state"], "ready")
        missing.pop()
        # Removing the latest row by itself slides the 14-day window, but we still
        # have 14 contiguous dates. Remove an interior date to test a genuine gap.
        missing.pop(-5)
        self.assertEqual(triage.series_windows(
            missing, "clicks", TODAY)["state"], "insufficient_data")

    def test_stale_and_incomplete_data_do_not_create_issues(self):
        rows = daily(start=date(2026, 9, 1), count=28, early=30, recent=0)
        state = triage.series_windows(rows, "clicks", TODAY)
        self.assertEqual(state["state"], "stale")
        self.assertEqual(triage.evaluate({}, TODAY)["status"], "no_confirmed_anomaly")

    def test_aggregate_ga4_compact_dates(self):
        rows = daily(field="sessions", early=14, recent=4, format_compact=True)
        result = triage.evaluate({"ga4": {"daily": rows}}, TODAY)
        self.assertEqual(len(result["alerts"]), 1)
        self.assertEqual(result["alerts"][0]["source"], "ga4")

    def test_invalid_or_boolean_values_are_not_counted(self):
        rows = daily(field="clicks", early=20, recent=2)
        rows[-4]["clicks"] = True
        self.assertEqual(triage.series_windows(
            rows, "clicks", TODAY)["state"], "insufficient_data")

    def test_opens_one_issue_without_raw_visitor_data(self):
        result = triage.evaluate({
            "ga4": {"daily": daily(field="sessions", early=20, recent=1,
                                  format_compact=True)}}, TODAY)
        calls = []

        def fake(token, method, path, payload=None):
            calls.append((method, path, payload))
            if method == "GET":
                return []
            return {"number": 123}

        with patch.object(triage, "api_request", side_effect=fake):
            actions = triage.synchronize("test-token", result)
        self.assertEqual(actions[0]["action"], "opened")
        self.assertEqual(len([c for c in calls if c[0] == "POST"]), 1)
        body = calls[-1][2]["body"]
        self.assertNotIn("email", body)
        self.assertNotIn("sourceUrl", body)

    def test_does_not_duplicate_existing_issue(self):
        result = triage.evaluate({
            "search_console": {"daily": daily(field="clicks", early=20, recent=1)}}, TODAY)
        expected_title = triage.PREFIX + " search_console clicks"
        with patch.object(triage, "api_request", return_value=[
            {"number": 67, "title": expected_title}]) as api:
            actions = triage.synchronize("test-token", result)
        self.assertEqual(actions, [])
        self.assertEqual(api.call_count, 1)

    def test_closes_only_when_genuine_recovery_is_proven(self):
        rows = daily(field="clicks", early=20, recent=20)
        result = triage.evaluate({"search_console": {"daily": rows}}, TODAY)
        existing = {"number": 67, "title": triage.PREFIX + " search_console clicks"}
        def fake(token, method, path, payload=None):
            return [existing] if method == "GET" else {"number": 67}
        with patch.object(triage, "api_request", side_effect=fake) as api:
            actions = triage.synchronize("test-token", result)
        self.assertEqual(actions[0]["action"], "closed")
        self.assertEqual(api.call_args_list[-1].args[1], "PATCH")


if __name__ == "__main__":
    unittest.main()
