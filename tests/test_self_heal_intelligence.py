"""Intelligent self-heal diagnosis: exact evidence, stable memory, no autonomous mutation."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import self_heal_intelligence as ai
import self_heal_knowledge as kb
import self_heal_monitor as monitor
from self_heal_control_plane import Observation, Policy
from test_self_heal_control_plane import JsonStore, foundation


COMMIT = "a" * 40
MAIN = "https://archelaos.club/"
NEWS = "https://archelaos.club/news.html"


def evaluate(kind="unknown", resource=MAIN, signal="Public health check failed", **kwargs):
    return ai.triage(sport="club", kind=kind, resource=resource, signal=signal,
                     source_commit=COMMIT, **kwargs)


class Intelligence(unittest.TestCase):
    def test_exact_verified_fixture_only_proposes_reviewed_draft(self):
        result = evaluate("ci_failure", NEWS, "HTML_ESCAPED_TEXT in news source",
                          marker="HTML_ESCAPED_TEXT")
        self.assertEqual(result["decision"], "REVIEW_TESTED_DRAFT_CANDIDATE")
        self.assertEqual(result["confidence"], "ISOLATED_REPAIR_KNOWN")
        self.assertEqual(result["localVerifiedReferences"][0]["code"],
                         "ARCH-HTML-ESCAPES-001")
        self.assertEqual(result["localVerifiedReferences"][0]["evidence"],
                         "ISOLATED_RED_GREEN")
        self.assertFalse(result["automaticMergeAuthorized"])
        self.assertFalse(result["productionRecoveryVerified"])
        self.assertTrue(result["localVerifiedReferences"][0]["diagnosisOnly"])

    def test_near_miss_signal_never_borrows_known_fix(self):
        no_marker = evaluate("ci_failure", NEWS, "HTML guard failure")
        wrong_resource = evaluate("ci_failure", MAIN, "HTML_ESCAPED_TEXT in news source",
                                  marker="HTML_ESCAPED_TEXT")
        self.assertEqual(no_marker["localVerifiedReferences"], [])
        self.assertEqual(wrong_resource["localVerifiedReferences"], [])
        self.assertNotEqual(no_marker["decision"], "REVIEW_TESTED_DRAFT_CANDIDATE")

    def test_explicit_provider_code_has_source_but_no_root_cause_proof(self):
        cloudflare = evaluate(signal="Cloudflare Error 522 returned at origin")
        self.assertEqual(cloudflare["providerReferences"][0]["code"], "CF-522")
        self.assertEqual(cloudflare["confidence"], "PROVIDER_SYMPTOM")
        self.assertEqual(cloudflare["decision"], "INSPECT_PROVIDER_DIAGNOSTICS")
        self.assertTrue(cloudflare["providerReferences"][0]["sourceUrl"].startswith("https://"))
        github = evaluate(signal="GitHub API HTTP 403 returned by integration")
        self.assertEqual(github["providerReferences"][0]["code"], "GH-403")
        unknown = evaluate(signal="HTTP 403")
        self.assertEqual(unknown["providerReferences"], [])

    def test_health_report_distinguishes_identity_from_general_outage(self):
        signals = ai.health_signals({"errors": [
            "Person IDs are missing or duplicated",
            "Published asset fingerprint mismatch: /news.json",
            "Published asset fingerprint mismatch: /news.json",
            "/news.html: missing main element"
        ]})
        self.assertEqual([x["code"] for x in signals],
                         ["IDENTITY_INTEGRITY", "BROKEN_FUNCTIONALITY", "PUBLISHED_ASSET_DRIFT"])
        self.assertEqual(signals[0]["priority"], 0)
        risk = evaluate(report={"state": "READ", "signals": signals})
        self.assertEqual(risk["riskPriority"], "P0")
        self.assertEqual(risk["decision"], "ESCALATE_SECURITY_OR_IDENTITY")
        self.assertFalse(risk["automaticMergeAuthorized"])

    def test_live_report_never_leaks_secret_bearing_error_text(self):
        signals = ai.health_signals({"errors": [
            "/news.json: HTTP 500 token=abcSECRETPRIVATE",
            "News controls missing",
            "News controls missing",
        ]})
        self.assertEqual({row["code"] for row in signals},
                         {"UNTRUSTED_REPORT_MESSAGE", "BROKEN_FUNCTIONALITY"})
        self.assertEqual(len(signals), 2)
        self.assertNotIn("abcSECRETPRIVATE", json.dumps(signals))
        self.assertNotIn("token=", json.dumps(signals))
        with self.assertRaises(ValueError):
            ai.health_signals({"errors": ["error"] * 81})

    def test_untrusted_preclassified_findings_are_rejected(self):
        for report in (
            {"state": "READ", "signals": [{"code": "UNREGISTERED", "priority": 0, "route": None}]},
            {"state": "READ", "signals": [{"code": "ARCHIVE_CORRUPTION", "priority": "0", "route": None}]},
            {"state": "READ", "signals": ["arbitrary"]},
        ):
            with self.subTest(report=report), self.assertRaises(ValueError):
                evaluate(report=report)

    def test_repeated_escalation_uses_prior_incident_memory_but_cannot_authorize_fix(self):
        result = evaluate(journal={"phase": "ESCALATED", "attempts": 3, "occurrences": 5})
        self.assertEqual(result["decision"], "RECONCILE_REPEATED_INCIDENT")
        self.assertEqual(result["priorHistory"]["attempts"], 3)
        self.assertEqual(result["riskPriority"], "P1")
        self.assertFalse(result["productionRecoveryVerified"])
        untrusted = evaluate(journal={"phase": "PRODUCTION_VERIFIED", "attempts": -2,
                                      "occurrences": "one thousand"})
        self.assertEqual(untrusted["priorHistory"],
                         {"phase": "UNKNOWN", "attempts": 0, "occurrences": 0})
        self.assertFalse(untrusted["productionRecoveryVerified"])

    def test_security_and_identity_do_not_attempt_auto_fixes(self):
        issue = evaluate(kind="security_quality_gate",
                         resource="https://github.com/dizigs/archelaos-site/issues/66",
                         signal="Sonar Security C on main")
        self.assertEqual(issue["riskPriority"], "P0")
        self.assertEqual(issue["decision"], "ESCALATE_SECURITY_OR_IDENTITY")
        self.assertFalse(issue["automaticMergeAuthorized"])
        self.assertEqual(issue["localVerifiedReferences"][0]["allowedProposal"], "NONE")

    def test_osv_explicit_cve_requires_index_and_suppresses_withdrawn(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "knowledge.sqlite3"
            with kb.connect(path) as con:
                kb.upsert(con, {"id": "GHSA-abcd-1234-abcd", "aliases": ["CVE-2026-5555"],
                                "modified": "2026-11-03T10:00:00Z",
                                "summary": "Fixture issue", "details": "A fake parser issue",
                                "affected": [{"package": {"ecosystem": "PyPI", "name": "demo"}}]})
                kb.upsert(con, {"id": "GHSA-abcd-1234-ffff", "aliases": ["CVE-2026-6666"],
                                "modified": "2026-11-03T10:00:00Z",
                                "withdrawn": "2026-11-03T11:00:00Z",
                                "summary": "Withdrawn fixture", "details": "No longer applicable"})
                con.commit()
            r = evaluate(signal="CVE-2026-5555 and CVE-2026-6666", db_path=path)
            self.assertEqual(r["osv"]["status"], "READ_ONLY_REFERENCE")
            self.assertEqual([x["id"] for x in r["osv"]["advisories"]],
                             ["GHSA-abcd-1234-abcd"])
            self.assertFalse(r["osv"]["advisories"][0]["packageImpactVerified"])
            self.assertFalse(r["automaticMergeAuthorized"])

    def test_no_index_is_reported_explicitly_without_network(self):
        with tempfile.TemporaryDirectory() as folder:
            r = evaluate(signal="CVE-2026-5555", db_path=Path(folder) / "absent.sqlite3")
        self.assertEqual(r["osv"]["status"], "INDEX_NOT_AVAILABLE")
        self.assertEqual(r["osv"]["advisories"], [])
        self.assertEqual(r["confidence"], "INCOMPLETE")

    def test_invalid_untrusted_scope_and_sensitive_logs_fail_closed(self):
        for kwargs in (
            {"resource": "https://attacker.example.com/"},
            {"signal": "Cloudflare Error 522 token=VERY_SECRET"},
            {"source_commit": "main"},
            {"kind": "unapproved"},
        ):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                args = {"sport": "club", "kind": "unknown", "resource": MAIN,
                        "signal": "Public health check failed"}
                args.update(kwargs)
                ai.triage(**args)

    def test_monitor_integration_keeps_incident_red_and_no_extra_repair(self):
        store = JsonStore()
        report = {"state": "READ", "signals": ai.health_signals(
            {"errors": ["Person IDs are missing or duplicated"]})}
        with patch.object(monitor, "validate_main_run", return_value="https://github.com/dizigs/archelaos-site/actions/runs/123"), \
                patch.object(monitor, "load_policy", return_value=(Policy.from_foundation(foundation()), {}, COMMIT)), \
                patch.object(monitor, "IncidentStore", return_value=store), \
                patch.object(monitor, "read_live_report", return_value=report), \
                patch.object(monitor, "DraftPublisher") as publisher:
            result = monitor.observe(None, COMMIT, "123", "failure", "success")
        self.assertEqual(result["status"], "ISSUES_REMAIN_OPEN")
        self.assertEqual(result["results"][0]["phase"], "DIAGNOSED")
        intelligence = result["results"][0]["intelligence"]
        self.assertEqual(intelligence["riskPriority"], "P0")
        self.assertEqual(intelligence["healthReportState"], "READ")
        self.assertEqual(intelligence["decision"], "ESCALATE_SECURITY_OR_IDENTITY")
        self.assertFalse(intelligence["automaticMergeAuthorized"])
        publisher.assert_not_called()

    def test_knowledge_failure_never_masks_original_failed_health(self):
        incident = {"phase": "DIAGNOSED", "action": "DIAGNOSED"}
        observation = Observation("club", "unknown", MAIN, "2026-11-03T10:00:00Z",
                                  "https://github.com/dizigs/archelaos-site/actions/runs/123",
                                  COMMIT, "b" * 64, "public", "Public health check failed")
        with patch.object(monitor, "triage_monitor_observation", side_effect=ValueError("broken catalog")):
            result = monitor.add_intelligence(observation, incident,
                                              {"state": "MISSING_OR_INVALID", "signals": []})
        self.assertEqual(result["phase"], "DIAGNOSED")
        self.assertEqual(result["intelligence"]["status"], "KNOWLEDGE_UNAVAILABLE")
        self.assertFalse(result["intelligence"]["productionRecoveryVerified"])


if __name__ == "__main__":
    unittest.main()
