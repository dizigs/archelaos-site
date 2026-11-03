"""Real subprocess red/green guard, isolated scope and trusted run provenance."""
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import self_heal_fixture as f
import self_heal_github as gh


class Fixture(unittest.TestCase):
    def test_real_guard_fails_injected_fault_and_passes_exact_original_repair(self):
        candidate, tests = f.tested_patch(f.FAULT, "a" * 64)
        self.assertEqual(candidate.content, f.BASELINE)
        self.assertEqual(tests, {"before": {"exitCode": 1, "findings": 1},
                                 "after": {"exitCode": 0, "findings": 0},
                                 "idempotent": True, "changes": 1})

    def test_healthy_source_cannot_be_used_to_fabricate_a_repair(self):
        with self.assertRaises(ValueError): f.tested_patch(f.BASELINE, "a" * 64)

    def test_unknown_body_fault_is_rejected_even_with_one_fixable_head_fault(self):
        faulty = f.FAULT.replace("</main>", r"\n</main>")
        with self.assertRaises(ValueError): f.tested_patch(faulty, "a" * 64)

    def test_remote_candidate_must_pass_real_independent_guard(self):
        with self.assertRaises(ValueError): f.verify_fixed(f.FAULT)

    def test_same_source_and_policy_signature_is_stable_across_run_ids(self):
        self.assertEqual(f.source_signature(f.FAULT, {"a": 1}), f.source_signature(f.FAULT, {"a": 1}))
        self.assertNotEqual(f.source_signature(f.FAULT, {"a": 1}), f.source_signature(f.FAULT, {"a": 2}))

    def test_untrusted_run_or_changed_ref_is_rejected_before_any_write(self):
        valid = {"repository": {"full_name": gh.REPO}, "head_repository": {"full_name": gh.REPO},
                 "event": "workflow_dispatch", "head_branch": "codex/self-heal-staging-test",
                 "head_sha": "a" * 40, "path": ".github/workflows/site-watch-and-repair.yml"}
        for field, value in (("head_repository", {"full_name": "foreign/repo"}),
                             ("event", "pull_request"), ("head_sha", "b" * 40),
                             ("path", ".github/workflows/unrelated.yml")):
            class Client:
                def request(self, path): return {**valid, field: value}
            with self.subTest(field=field), patch.object(f, "branch_head", return_value="a" * 40), self.assertRaises(ValueError):
                f.validate_run(Client(), "123", valid["head_branch"], "a" * 40)
        class Client:
            def request(self, path): return valid
        with patch.object(f, "branch_head", return_value="b" * 40), self.assertRaises(ValueError):
            f.validate_run(Client(), "123", valid["head_branch"], "a" * 40)

    def test_policy_read_allowlist_does_not_expand_writable_paths(self):
        client = gh.GitHub()
        with self.assertRaises(ValueError):
            gh.create_changed_ref(client, "a" * 40, f.POLICY_PATH, "{}", "codex/self-heal-staging-test", "forbidden")
        self.assertEqual(client.requests, 0)


if __name__ == "__main__": unittest.main()
