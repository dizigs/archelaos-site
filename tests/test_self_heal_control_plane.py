"""Controller state/failure injection; fake persistence is deliberately reloaded JSON."""
import copy
from dataclasses import replace
from datetime import datetime, timezone, timedelta
from hashlib import sha256
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import self_heal_control_plane as m

NOW = datetime(2026, 11, 3, 12, 0, tzinfo=timezone.utc)
KEYS = {"archery", "wrestling", "club"}


def foundation():
    return {"schemaVersion": 1, "mode": "observe-and-propose-only", "createNewCron": False,
            "actions": {"alwaysForbidden": ["bypass_branch_protection", "expose_secrets",
                         "auto_merge_athlete_identities", "fabricate_deployment_success"],
                        "autoAllowed": ["propose_scoped_draft_pr_with_tests"]},
            "failureClasses": ["link_failure", "http_error", "ci_failure", "unknown"],
            "limits": {"cooldownMinutes": 180, "maxSuggestedChangesPerRun": 3,
                       "maxRepeatedIdenticalAttempts": 1}}


def observation(**updates):
    item = m.Observation("archery", "link_failure", "https://archelaos.club/__self-heal-fixture__/unit/archery-preview.html",
                         NOW.isoformat(), "https://github.com/dizigs/archelaos-site/actions/runs/123",
                         "a" * 40, "b" * 64, "fixture")
    return replace(item, **updates)


class JsonStore:
    def __init__(self): self.rows = {}; self.writes = 0
    def load(self, key): return json.loads(self.rows[key]) if key in self.rows else None
    def create(self, state):
        if state["fingerprint"] in self.rows: raise RuntimeError("duplicate incident")
        self.save(state)
    def save(self, state):
        self.rows[state["fingerprint"]] = json.dumps(state); self.writes += 1


class Publisher:
    def __init__(self): self.calls = 0
    def propose(self, observation, patch):
        self.calls += 1
        return {"number": 123, "url": "https://github.com/dizigs/archelaos-site/pull/123", "commit": "d" * 40}


class Controller(unittest.TestCase):
    def setUp(self):
        self.policy = m.Policy.from_foundation(foundation())
        self.store = JsonStore(); self.publisher = Publisher(); self.repairs = 0
    def repair(self, item):
        self.repairs += 1
        return m.TestedPatch(m.TARGETS["fixture"], "fixed canonical fixture", "e" * 64, item.source_signature, 1, True)
    def run_one(self, item=None, now=NOW, repair=None):
        return m.process_incident(item or observation(), self.policy, KEYS, self.store,
                                  self.repair if repair is None else repair, self.publisher, now)

    def test_persisted_reservation_tests_and_one_draft_then_zero_write_replay(self):
        result = self.run_one()
        self.assertEqual(result["phase"], "DRAFT_PR_PROPOSED")
        self.assertEqual(result["attempts"], 1)
        self.assertFalse(result["productionVerified"])
        before = self.store.writes
        replay = self.run_one(now=NOW + timedelta(hours=4))
        self.assertEqual(replay["action"], "SUPPRESSED")
        self.assertEqual(self.store.writes, before)
        self.assertEqual((self.repairs, self.publisher.calls), (1, 1))

    def test_failed_regression_does_not_publish_or_repeat_identical_attempt(self):
        def failed(item): self.repairs += 1; raise RuntimeError("synthetic failed regression")
        self.assertEqual(self.run_one(repair=failed)["phase"], "REPAIR_FAILED")
        self.assertEqual(self.run_one(now=NOW + timedelta(hours=4), repair=failed)["reason"], "identical_condition_attempt_cap")
        self.assertEqual((self.repairs, self.publisher.calls), (1, 0))

    def test_changed_source_requires_cooldown_then_can_attempt(self):
        def failed(item): raise ValueError("synthetic bad markup")
        self.run_one(repair=failed)
        changed = observation(source_signature="c" * 64)
        self.assertEqual(self.run_one(changed, NOW + timedelta(minutes=10))["reason"], "cooldown")
        self.assertEqual(self.run_one(changed, NOW + timedelta(minutes=181))["phase"], "DRAFT_PR_PROPOSED")

    def test_total_cap_escalates_after_three_different_conditions(self):
        def failed(item): raise ValueError("synthetic unrepairable markup")
        for index, signature in enumerate(("b", "c", "d")):
            result = self.run_one(observation(source_signature=signature * 64), NOW + timedelta(hours=4 * index), failed)
            self.assertEqual(result["phase"], "REPAIR_FAILED")
        result = self.run_one(observation(source_signature="e" * 64), NOW + timedelta(hours=12), failed)
        self.assertEqual(result["phase"], "ESCALATED")
        self.assertEqual(result["attempts"], 3)
        self.assertEqual(self.publisher.calls, 0)

    def test_unknown_http_failures_never_execute_a_repair(self):
        result = self.run_one(observation(kind="http_error"))
        self.assertEqual(result["phase"], "DIAGNOSED")
        self.assertEqual((self.repairs, self.publisher.calls), (0, 0))

    def test_existing_central_news_repair_can_use_a_separate_isolated_fixture(self):
        item = observation(sport="club", kind="ci_failure",
                           resource="https://archelaos.club/__self-heal-fixture__/unit/news-head.html")
        def central_repair(observed):
            return m.TestedPatch("self-heal-fixtures/news-head.html", "repaired fixture", "e" * 64,
                                 observed.source_signature, 1, True)
        self.assertEqual(self.run_one(item, repair=central_repair)["phase"], "DRAFT_PR_PROPOSED")
        self.assertFalse(self.run_one(item)["productionVerified"])

    def test_other_sport_cannot_inherit_archery_repair(self):
        self.assertEqual(self.run_one(observation(sport="wrestling"))["phase"], "DIAGNOSED")
        self.assertEqual(self.repairs, 0)

    def test_unrelated_resource_cannot_borrow_a_known_safe_central_repair(self):
        item = observation(sport="club", kind="ci_failure", scope="public",
                           resource="https://archelaos.club/hall-of-fame.html")
        self.assertEqual(self.run_one(item)["phase"], "DIAGNOSED")
        self.assertEqual(self.repairs, 0)

    def test_repeated_unknown_failure_escalates_once_after_distinct_cooled_down_runs(self):
        item = observation(kind="http_error")
        self.run_one(item)
        for index in (1, 2):
            item = replace(item, source_run=f"https://github.com/dizigs/archelaos-site/actions/runs/{123+index}",
                           observed_at=(NOW + timedelta(hours=4 * index)).isoformat())
            result = self.run_one(item, NOW + timedelta(hours=4 * index))
        self.assertEqual(result["phase"], "ESCALATED")
        writes = self.store.writes
        self.assertEqual(self.run_one(item, NOW + timedelta(hours=9))["action"], "SUPPRESSED")
        self.assertEqual(self.store.writes, writes)
        self.assertEqual(self.repairs, 0)

    def test_unapproved_path_or_missing_regression_blocks_publisher(self):
        for updates in ({"path": "hall-of-fame-people.json"}, {"tests_passed": False},
                        {"changes": 4}, {"source_signature": "c" * 64}):
            with self.subTest(updates=updates):
                self.store = JsonStore()
                def unsafe(item): return replace(self.repair(item), **updates)
                self.assertEqual(self.run_one(repair=unsafe)["phase"], "REPAIR_FAILED")
        self.assertEqual(self.publisher.calls, 0)

    def test_publication_failure_is_durable_and_not_retried(self):
        class FailedPublisher:
            calls = 0
            def propose(self, item, patch): self.calls += 1; raise RuntimeError("synthetic permissions failure")
        self.publisher = FailedPublisher()
        self.assertEqual(self.run_one()["phase"], "PUBLISH_BLOCKED")
        self.assertEqual(self.run_one()["action"], "BLOCKED")
        self.assertEqual(self.publisher.calls, 1)

    def test_lookup_failure_stops_before_repair_or_issue_creation(self):
        class MissingStore(JsonStore):
            def load(self, key): raise OSError("synthetic API unavailable")
        self.store = MissingStore()
        with self.assertRaises(OSError): self.run_one()
        self.assertEqual((self.store.writes, self.repairs, self.publisher.calls), (0, 0, 0))

    def test_crash_after_reservation_cannot_execute_twice(self):
        class InterruptedStore(JsonStore):
            def save(self, state):
                super().save(state)
                if state["phase"] == "REPAIR_RESERVED": raise OSError("synthetic interruption")
        self.store = InterruptedStore()
        with self.assertRaises(OSError): self.run_one()
        self.assertEqual(self.run_one()["action"], "BLOCKED")
        self.assertEqual((self.repairs, self.publisher.calls), (0, 0))

    def test_untrusted_private_or_forged_observations_do_not_write(self):
        for updates in ({"resource": "https://archelaos.club/?token=fixture"},
                        {"resource": "https://user@archelaos.club/"}, {"resource": "https://example.org/"},
                        {"source_run": "https://github.com/dizigs/archelaos-site/actions/runs/123?token=fixture"},
                        {"source_commit": "short"}, {"observed_at": "2026-10-01T00:00:00Z"}):
            with self.subTest(updates=updates), self.assertRaises(ValueError): self.run_one(observation(**updates))
        self.assertEqual(self.store.writes, 0)

    def test_tampered_state_cannot_reset_or_fabricate_production_success(self):
        for changes in ({"attempts": -1}, {"attempts": True}, {"resource": "https://example.org/"},
                        {"phase": "VERIFIED", "productionVerified": True}):
            with self.subTest(changes=changes):
                state = m.initial_state(observation()); state.update(changes)
                self.store.rows[observation().fingerprint] = json.dumps(state)
                with self.assertRaises(ValueError): self.run_one()
        self.assertEqual(self.repairs, 0)

    def test_batch_dedup_and_budget_report_all_deferred_incidents(self):
        items = [observation(resource=f"https://archelaos.club/__self-heal-fixture__/{index}/archery-preview.html") for index in range(5)]
        report = m.process_batch(items + [items[0]], self.policy, KEYS, self.store, self.repair, self.publisher, NOW)
        self.assertEqual(len(report["results"]), 3)
        self.assertEqual(report["deferred"], 2)
        self.assertEqual(self.publisher.calls, 3)
        self.assertFalse(report["automaticMergePerformed"])

    def test_invalid_batch_is_rejected_before_any_earlier_incident_mutates(self):
        with self.assertRaises(ValueError):
            m.process_batch([observation(), observation(source_commit="bad")], self.policy, KEYS,
                            self.store, self.repair, self.publisher, NOW)
        self.assertEqual(self.store.writes, 0)

    def test_foundation_can_tighten_but_never_expand_compiled_limits(self):
        data = foundation(); data["limits"].update(cooldownMinutes=1, maxSuggestedChangesPerRun=99, maxRepeatedIdenticalAttempts=99)
        policy = m.Policy.from_foundation(data)
        self.assertEqual((policy.cooldown_minutes, policy.max_actions, policy.identical_attempts), (180, 3, 1))
        data["actions"]["alwaysForbidden"] = []
        with self.assertRaises(ValueError): m.Policy.from_foundation(data)


if __name__ == "__main__": unittest.main()
