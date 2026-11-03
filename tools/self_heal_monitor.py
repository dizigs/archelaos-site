"""Adapter for the existing main monitor; unknown problems never select a repair."""
import argparse
from datetime import datetime, timezone
from hashlib import sha256
import json

from self_heal_control_plane import Observation, process_incident, repair_branch
from self_heal_fixture import load_policy, source_signature, tested_patch, verify_fixed
from self_heal_github import (API, REPO, GitHub, IncidentStore, DraftPublisher,
                              assert_no_other_pr_owner, branch_head, tree_file, full_sha)


def validate_main_run(client, run_id, commit):
    if not isinstance(run_id, str) or not run_id.isdecimal() or not 1 <= len(run_id) <= 20:
        raise ValueError("Exact workflow run ID required")
    full_sha(commit)
    run = client.request(API + "/actions/runs/" + run_id)
    if ((run.get("repository") or {}).get("full_name") != REPO
            or (run.get("head_repository") or {}).get("full_name") != REPO
            or run.get("path") != ".github/workflows/site-watch-and-repair.yml"
            or run.get("event") not in {"schedule", "workflow_dispatch"}
            or run.get("head_branch") != "main" or run.get("head_sha") != commit
            or branch_head(client, "main") != commit):
        raise ValueError("Only the unchanged trusted main monitor may propose repairs")
    return "https://github.com/" + REPO + "/actions/runs/" + run_id


def observe(client, commit, run_id, live, escapes):
    if live not in {"success", "failure"} or escapes not in {"success", "failure"}:
        raise ValueError("Incomplete monitoring cannot report healthy")
    run = validate_main_run(client, run_id, commit)
    if live == escapes == "success":
        return {"status": "HEALTHY_OBSERVATION", "sourceRun": run, "results": [],
                "productionVerified": False, "automaticMergePerformed": False}
    policy, data, policy_commit = load_policy(client, commit)
    now = datetime.now(timezone.utc)
    results = []
    store = IncidentStore(client, aggregate=True)
    if live == "failure":
        observation = Observation("club", "unknown", "https://archelaos.club/", now.isoformat(),
                                  run, commit, sha256(b"live_site_health_failed").hexdigest(), "public",
                                  "Existing live_site_health check failed; details in source workflow report")
        results.append(process_incident(observation, policy, {"club"}, store, None, None, now))
    if escapes == "failure":
        original = tree_file(client, commit, "news.html")
        signature = source_signature(original["content"], data)
        from self_heal_fixture import find_visible_escapes
        news_failed = bool(find_visible_escapes(original["content"]))
        observation = Observation("club", "ci_failure" if news_failed else "unknown",
                                  "https://archelaos.club/news.html" if news_failed else "https://archelaos.club/",
                                  now.isoformat(), run, commit, signature, "public",
                                  "HTML_ESCAPED_TEXT in news source" if news_failed else
                                  "Source HTML guard failed outside news; no allowlisted diagnosis")
        repair = None
        ownership = "not_needed"
        ownership_failure = None
        if news_failed:
            try:
                assert_no_other_pr_owner(client, "news.html", repair_branch(observation.fingerprint, signature))
            except RuntimeError as error:
                # Record diagnostic state; do not compete with another owner or
                # treat an incomplete/failed API lookup as permission to publish.
                ownership = "blocked_or_incomplete"
                ownership_failure = getattr(error, "evidence", None)
            else:
                ownership = "clear"
                def repair(item):
                    candidate, _ = tested_patch(original["content"], item.source_signature, "news.html")
                    return candidate
        result = process_incident(observation, policy, {"club"}, store, repair,
                                  DraftPublisher(client, "main", original["sha"], verify_fixed), now)
        result["ownership"] = ownership
        if ownership_failure is not None: result["accessFailure"] = ownership_failure
        if result["action"] == "DRAFT_PR_PROPOSED":
            from self_heal_ci import dispatch_checks
            result["ci"] = dispatch_checks(client, store, observation.fingerprint)
        results.append(result)
    return {"status": "ISSUES_REMAIN_OPEN", "sourceRun": run, "policyCommit": policy_commit,
            "results": results, "productionVerified": False, "automaticMergePerformed": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--live", required=True)
    parser.add_argument("--escapes", required=True)
    args = parser.parse_args()
    result = observe(GitHub(), args.source_commit, args.run_id, args.live, args.escapes)
    encoded = json.dumps(result, sort_keys=True, separators=(",", ":"))
    print(encoded)
    print("::notice title=Self-heal monitor decisions::" + encoded.replace("%", "%25").replace("\n", "%0A").replace("\r", "%0D"))


if __name__ == "__main__": main()
