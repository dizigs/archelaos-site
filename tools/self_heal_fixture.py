"""Controlled central-site repair drill. Never deploys, merges or creates sport pages."""
import argparse
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "rebuild" / "tools"))
from auto_fix_html_escapes import repair_news_head
from guard_html_escaped_text import find_visible_escapes
from self_heal_control_plane import (Observation, Policy, TestedPatch, process_incident,
                                     repair_branch, resume_publication)
from self_heal_github import (API, REPO, FIXTURE_BRANCH, GitHub, IncidentStore, DraftPublisher,
                              assert_no_other_pr_owner, branch_head, create_changed_ref, tree_file,
                              full_sha)

PATH = "self-heal-fixtures/news-head.html"
FOUNDATION = "d59363d333f9837da0c16e3fc776146fd89bbefa"
POLICY_PATH = "config/sport-self-heal-policy.json"
BASELINE = ('<!doctype html><html lang="el"><head><meta charset="utf-8">\n'
            '<title>Self-heal technical fixture</title></head><body><main>Fixture</main></body></html>')
FAULT = BASELINE.replace('>\n<title>', r'>\n<title>', 1)
GUARD_PROGRAM = ("import json,sys; from rebuild.tools.guard_html_escaped_text import find_visible_escapes; "
                 "n=len(find_visible_escapes(sys.stdin.read())); print(json.dumps({'findings':n})); "
                 "sys.exit(1 if n else 0)")


def guard_process(content):
    result = subprocess.run([sys.executable, "-c", GUARD_PROGRAM], input=content, text=True,
                            capture_output=True, timeout=30, cwd=ROOT, check=False)
    if result.returncode not in {0, 1} or len(result.stdout) > 200:
        raise RuntimeError("Independent guard process failed")
    data = json.loads(result.stdout)
    if type(data.get("findings")) is not int or (result.returncode == 0) != (data["findings"] == 0):
        raise ValueError("Guard result inconsistent")
    return {"exitCode": result.returncode, "findings": data["findings"]}


def verify_fixed(content):
    if guard_process(content)["exitCode"] != 0:
        raise ValueError("Remote candidate failed independent regression")
    if repair_news_head(content) != (content, 0):
        raise ValueError("Remote repair is not idempotent")


def tested_patch(content, signature, path=PATH):
    before = guard_process(content)
    fixed, changes = repair_news_head(content)
    after = guard_process(fixed)
    if before["exitCode"] != 1 or after["exitCode"] != 0 or not 1 <= changes <= 3:
        raise ValueError("No proven red-to-green allowlisted repair")
    verify_fixed(fixed)
    return (TestedPatch(path, fixed, sha256(content.encode()).hexdigest(), signature, changes, True),
            {"before": before, "after": after, "idempotent": True, "changes": changes})


def load_policy(client, source_commit):
    source = tree_file(client, source_commit, POLICY_PATH, optional=True)
    policy_commit = source_commit
    if source is None:
        policy_commit = FOUNDATION
        source = tree_file(client, FOUNDATION, POLICY_PATH)
    data = json.loads(source["content"])
    return Policy.from_foundation(data), data, policy_commit


def source_signature(content, policy):
    digest = sha256(content.encode())
    for path in ("rebuild/tools/auto_fix_html_escapes.py", "rebuild/tools/guard_html_escaped_text.py",
                 "tools/self_heal_control_plane.py", "tools/self_heal_fixture.py"):
        digest.update(path.encode()); digest.update((ROOT / path).read_bytes())
    digest.update(json.dumps(policy, sort_keys=True, separators=(",", ":")).encode())
    return digest.hexdigest()


def validate_run(client, run_id, branch, commit):
    if not isinstance(run_id, str) or not re.fullmatch(r"[0-9]{1,20}", run_id):
        raise ValueError("Exact GitHub run ID required")
    full_sha(commit)
    if not FIXTURE_BRANCH.fullmatch(branch): raise ValueError("Isolated fixture ref required")
    run = client.request(API + "/actions/runs/" + run_id)
    if ((run.get("repository") or {}).get("full_name") != REPO
            or (run.get("head_repository") or {}).get("full_name") != REPO
            or run.get("path") != ".github/workflows/site-watch-and-repair.yml"
            or run.get("event") != "workflow_dispatch" or run.get("head_branch") != branch
            or run.get("head_sha") != commit or branch_head(client, branch) != commit):
        raise ValueError("Run provenance/ref changed or untrusted")
    return "https://github.com/" + REPO + "/actions/runs/" + run_id


def prepare(client, case, source_commit):
    if not re.fullmatch(r"[a-z0-9-]{1,60}", case): raise ValueError("Invalid fixture case")
    full_sha(source_commit)
    current_main = branch_head(client, "main")
    comparison = client.request(API + "/compare/" + current_main + "..." + source_commit)
    if comparison.get("status") not in {"ahead", "identical"}:
        raise ValueError("Fixture source must include latest main")
    assert_no_other_pr_owner(client, PATH)
    branch = "codex/self-heal-staging-" + case
    existing = branch_head(client, branch, missing_ok=True)
    if existing:
        return {"action": "EXISTING_FIXTURE", "branch": branch, "commit": existing, "writes": 0}
    if find_visible_escapes(BASELINE) or len(find_visible_escapes(FAULT)) != 1:
        raise ValueError("Fixture injection baseline invalid")
    tested_patch(FAULT, "a" * 64)
    commit = create_changed_ref(client, source_commit, PATH, FAULT, branch,
                                "test(self-heal): inject one isolated news-head whitespace fault")
    return {"action": "FIXTURE_PREPARED", "branch": branch, "commit": commit,
            "sourceCommit": source_commit, "productionMutationPerformed": False}


def run_fixture(client, branch, commit, run_id, resume_issue=None):
    run_url = validate_run(client, run_id, branch, commit)
    source = tree_file(client, commit, PATH)
    policy, data, policy_commit = load_policy(client, commit)
    case = branch.removeprefix("codex/self-heal-staging-")
    now = datetime.now(timezone.utc)
    item = Observation("club", "ci_failure", "https://archelaos.club/__self-heal-fixture__/" + case + "/news-head.html",
                       now.isoformat(), run_url, commit, source_signature(source["content"], data), "fixture",
                       "Injected HTML_ESCAPED_TEXT; independent guard exit 1")
    own_branch = repair_branch(item.fingerprint, item.source_signature)
    assert_no_other_pr_owner(client, PATH, own_branch)
    store = IncidentStore(client, known_container=resume_issue)
    publisher = DraftPublisher(client, branch, source["sha"], verify_fixed)
    evidence = {}; calls = []
    def repair(observation):
        calls.append(observation.fingerprint)
        patch, tests = tested_patch(source["content"], observation.source_signature)
        evidence.update(tests)
        return patch
    if resume_issue:
        # Revalidate the already tested candidate; never run the repair again.
        previous = store.load(item.fingerprint)
        if not previous or previous.get("phase") != "PUBLISH_BLOCKED":
            raise ValueError("No blocked tested publication to resume")
        candidate = branch_head(client, own_branch)
        remote = tree_file(client, candidate, PATH)
        verify_fixed(remote["content"])
        patch = TestedPatch(PATH, remote["content"], sha256(source["content"].encode()).hexdigest(),
                            item.source_signature, 1, True)
        outcome = resume_publication(item, policy, {"club"}, store, patch, publisher, now, "runtime_connector")
    else:
        outcome = process_incident(item, policy, {"club"}, store, repair, publisher, now)
    issue = store.containers[item.fingerprint]
    ci = None
    if outcome["action"] == "DRAFT_PR_PROPOSED":
        from self_heal_ci import dispatch_checks
        ci = dispatch_checks(client, IncidentStore(client, known_container=issue), item.fingerprint)
    state = IncidentStore(client, known_container=issue).load(item.fingerprint)
    before_replay = client.write_attempts
    replay = process_incident(item, policy, {"club"}, IncidentStore(client, known_container=issue),
                              repair, publisher, now)
    replay_writes = client.write_attempts - before_replay
    if replay_writes or len(calls) > 1:
        raise RuntimeError("Replay attempted a repeated repair or API write")
    report = {"result": outcome, "replay": replay, "replayWriteAttempts": replay_writes,
              "repairExecutions": len(calls), "tests": evidence, "policyCommit": policy_commit,
              "ci": ci,
              "sourceRun": run_url, "sourceCommit": commit,
              "incident": "https://github.com/" + REPO + "/issues/" + str(issue),
              "apiRequests": client.requests, "apiWriteAttempts": client.write_attempts,
              "accessFailure": state.get("accessFailure"), "productionVerified": False,
              "automaticMergePerformed": False, "futureDepartmentSitesCreated": 0}
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prepare-case")
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--branch")
    parser.add_argument("--run-id")
    parser.add_argument("--resume-issue", type=int)
    args = parser.parse_args()
    client = GitHub()
    result = (prepare(client, args.prepare_case, args.source_commit) if args.prepare_case else
              run_fixture(client, args.branch or "", args.source_commit, args.run_id or "", args.resume_issue))
    encoded = json.dumps(result, sort_keys=True, separators=(",", ":"))
    print(encoded)
    print("::notice title=Self-heal controlled fixture::" + encoded.replace("%", "%25").replace("\n", "%0A").replace("\r", "%0D"))
    return 0 if result.get("result", {}).get("phase", "DRAFT_PR_PROPOSED") == "DRAFT_PR_PROPOSED" else 1


if __name__ == "__main__": sys.exit(main())
