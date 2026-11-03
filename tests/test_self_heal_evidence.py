"""Self-heal evidence decision engine: adversarial, offline regression suite."""
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import self_heal_evidence as e

HEAD = "a" * 40
NOW = "2026-11-03T12:00:00Z"


def evidence(kind="exact_ci", claim="HTML_ESCAPED_TEXT", supports=True,
             ref="https://github.com/dizigs/archelaos-site/actions/runs/123",
             sha=HEAD, at=NOW, withdrawn=False):
    return {"kind": kind, "claim": claim, "supports": supports, "ref": ref,
            "headSha": sha, "observedAt": at, "withdrawn": withdrawn}


def incident(items=None, history=None, **overrides):
    data = {"repository": "dizigs/archelaos-site", "failureCode": "HTML_ESCAPED_TEXT",
            "resource": "news.html", "headSha": HEAD, "observedAt": NOW,
            "eventId": "run-123", "evidence": items if items is not None else [],
            "history": history or []}
    data.update(overrides)
    return data


class EvidenceTests(unittest.TestCase):
    def test_unknown_fails_closed(self):
        result = e.evaluate(incident(), now=NOW)
        self.assertEqual(result["status"], "REPRODUCE_FIRST")
        self.assertFalse(result["remoteMutationPerformed"])
        self.assertFalse(result["autoMerge"])

    def test_verified_two_independent_sources_require_review_not_auto_execution(self):
        result = e.evaluate(incident([
            evidence(),
            evidence("reproduced_test", ref="test://fixture/1")
        ]), now=NOW)
        self.assertEqual(result["status"], "REVIEW_REQUIRED")
        self.assertEqual(result["reason"], "CANDIDATE_FOR_HUMAN_REVIEW")
        self.assertGreater(result["rankedHypotheses"][0]["confidence"], 0.99)
        self.assertFalse(result["externalContentMayAuthorizeRepair"])

    def test_many_web_ai_claims_cannot_trigger_repair(self):
        items = [evidence("ai_suggestion", ref=f"ai://{n}") for n in range(30)]
        result = e.evaluate(incident(items), now=NOW)
        self.assertEqual(result["status"], "REPRODUCE_FIRST")
        self.assertEqual(result["reason"], "NO_EXACT_HEAD_REPRODUCTION")

    def test_old_commit_evidence_is_downweighted(self):
        result = e.evaluate(incident([
            evidence("exact_ci", sha="b" * 40),
            evidence("reproduced_test", sha="b" * 40, ref="test://old")
        ]), now=NOW)
        self.assertEqual(result["status"], "REPRODUCE_FIRST")
        self.assertLess(result["rankedHypotheses"][0]["confidence"], 0.5)

    def test_conflicting_evidence_blocks_confident_diagnosis(self):
        result = e.evaluate(incident([
            evidence("exact_ci"),
            evidence("reproduced_test", ref="test://independent"),
            evidence("deployment_log", supports=False, ref="cloudflare://deploy")
        ]), now=NOW)
        self.assertEqual(result["status"], "REPRODUCE_FIRST")
        self.assertTrue(result["rankedHypotheses"][0]["contradicted"])

    def test_same_ref_cannot_vote_twice(self):
        item = evidence()
        result = e.evaluate(incident([item, dict(item)]), now=NOW)
        self.assertEqual(result["evidenceCount"], 1)
        self.assertEqual(result["status"], "REVIEW_REQUIRED")
        self.assertEqual(result["reason"], "NEEDS_INDEPENDENT_CORROBORATION")

    def test_same_ref_opposite_polarity_is_rejected(self):
        a = evidence()
        b = dict(a, supports=False)
        with self.assertRaises(e.TriageError):
            e.evaluate(incident([a, b]), now=NOW)

    def test_three_failed_fix_attempts_quarantine(self):
        history = [{"attemptId": f"attempt-{i}", "outcome": "regressed"} for i in range(3)]
        result = e.evaluate(incident([evidence()], history=history), now=NOW)
        self.assertEqual(result["status"], "QUARANTINED")
        self.assertEqual(result["historyFailures"], 3)

    def test_duplicate_failed_outcome_does_not_count_twice(self):
        history = [{"attemptId": "attempt-1", "outcome": "failed"}] * 3
        result = e.evaluate(incident(history=history), now=NOW)
        self.assertEqual(result["historyFailures"], 1)

    def test_stale_incident_cannot_be_actionable(self):
        result = e.evaluate(incident([evidence()], observedAt="2026-09-01T12:00:00Z"), now=NOW)
        self.assertEqual(result["status"], "REPRODUCE_FIRST")
        self.assertEqual(result["reason"], "STALE_INCIDENT")

    def test_withdrawn_external_advisory_has_no_weight(self):
        result = e.evaluate(incident([evidence("osv_advisory", withdrawn=True)]), now=NOW)
        self.assertEqual(result["rankedHypotheses"][0]["confidence"], 0)

    def test_fingerprint_ignores_retry_id_but_scopes_resource(self):
        a = incident(eventId="run-1")
        b = incident(eventId="run-2")
        self.assertEqual(e.fingerprint(a), e.fingerprint(b))
        self.assertNotEqual(e.fingerprint(a), e.fingerprint(incident(resource="hall.html")))
        with self.assertRaises(e.TriageError):
            e.fingerprint(incident(repository="outside/other"))

    def test_future_timestamp_and_missing_exact_sha_fail(self):
        with self.assertRaises(e.TriageError):
            e.evaluate(incident(observedAt="2026-11-04T00:00:00Z"), now=NOW)
        with self.assertRaises(e.TriageError):
            e.evaluate(incident(headSha="main"), now=NOW)

    def test_journal_replay_is_idempotent_and_conflict_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            with e.connect_journal(Path(tmp) / "triage.sqlite") as conn:
                original = incident([evidence()])
                first = e.record_incident(conn, original, now=NOW)
                second = e.record_incident(conn, original, now=NOW)
                self.assertEqual(second["status"], "REPLAY_SUPPRESSED")
                self.assertEqual(first["fingerprint"], second["fingerprint"])
                with self.assertRaises(e.TriageError):
                    e.record_incident(conn, incident([evidence("reproduced_test")]), now=NOW)
                count = conn.execute("SELECT COUNT(*) FROM triage_events").fetchone()[0]
                self.assertEqual(count, 1)

    def test_outcome_journal_prevents_duplicate_and_conflicting_replay(self):
        with tempfile.TemporaryDirectory() as tmp:
            with e.connect_journal(Path(tmp) / "triage.sqlite") as conn:
                fp = e.fingerprint(incident())
                self.assertTrue(e.record_outcome(conn, fp, "attempt-1", "failed"))
                self.assertFalse(e.record_outcome(conn, fp, "attempt-1", "failed"))
                with self.assertRaises(e.TriageError):
                    e.record_outcome(conn, fp, "attempt-1", "resolved")
                self.assertEqual(e.history_for(conn, fp),
                                 [{"attemptId": "attempt-1", "outcome": "failed"}])

    def test_untrusted_data_never_grants_execute_permissions(self):
        source = (Path(__file__).resolve().parents[1] / "tools/self_heal_evidence.py").read_text()
        for forbidden in ("subprocess.", "os.system(", "eval(", "exec(", "git push", "deploy(", "merge_pull_request"):
            self.assertNotIn(forbidden, source)
        result = e.evaluate(incident([evidence("ai_suggestion")]), now=NOW)
        self.assertFalse(result["autoMerge"])
        self.assertFalse(result["productionVerified"])


if __name__ == "__main__":
    unittest.main()
