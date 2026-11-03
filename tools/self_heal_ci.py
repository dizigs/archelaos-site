"""Dispatch existing exact-head repair checks once, with durable reservations."""
import argparse
import json
import re

from self_heal_control_plane import validate_proposal, repair_branch
from self_heal_github import API, CI_WORKFLOWS, GitHub, IncidentStore, branch_head, tree_file
from self_heal_fixture import verify_fixed


def dispatch_checks(client, store, fingerprint):
    state = store.load(fingerprint)
    if not state or state.get("phase") != "DRAFT_PR_PROPOSED":
        raise ValueError("No tested draft proposal to dispatch")
    previous = state.get("ciDispatch", {})
    if (not isinstance(previous, dict) or any(name not in CI_WORKFLOWS or value not in
            {"RESERVED", "DISPATCHED", "BLOCKED", "EXISTING_RUN"} for name, value in previous.items())):
        raise ValueError("Invalid CI dispatch journal")
    if any(value in {"RESERVED", "BLOCKED"} for value in previous.values()):
        return {"dispatched": [], "journal": previous, "failure": state.get("ciDispatchFailure"),
                "checksPassed": False, "reason": "reconcile_interrupted_or_blocked_dispatch"}
    proposal = state.get("pr")
    branch = repair_branch(fingerprint, state["attemptSignatures"][-1])
    validate_proposal(proposal, branch)
    pull = client.request(API + "/pulls/" + str(proposal["number"]))
    if (pull.get("state") != "open" or pull.get("draft") is not True
            or (pull.get("head") or {}).get("sha") != proposal["commit"]
            or (pull.get("head") or {}).get("ref") != branch
            or branch_head(client, branch) != proposal["commit"]):
        raise ValueError("Repair PR changed; CI dispatch requires reconciliation")
    source = tree_file(client, proposal["commit"], state["path"])
    from hashlib import sha256
    if sha256(source["content"].encode()).hexdigest() != state["afterSha256"]:
        raise ValueError("Candidate changed after its tests")
    verify_fixed(source["content"])
    runs = client.request(API + "/actions/runs?head_sha=" + proposal["commit"] + "&per_page=100")
    if type(runs.get("total_count")) is not int or runs["total_count"] > 100:
        raise ValueError("Incomplete existing CI lookup; no duplicate dispatch")
    existing = {row.get("path"): row for row in runs.get("workflow_runs", [])
                if row.get("head_sha") == proposal["commit"] and row.get("head_branch") == branch
                and row.get("event") == "workflow_dispatch"}
    state["ciDispatch"] = dict(previous)
    sent = []
    for workflow in CI_WORKFLOWS:
        if workflow in state["ciDispatch"]: continue
        if ".github/workflows/" + workflow in existing:
            state["ciDispatch"][workflow] = "EXISTING_RUN"
            store.save(state)
            continue
        state["ciDispatch"][workflow] = "RESERVED"
        store.save(state)  # A crash/timeout must not generate duplicate runs.
        try:
            client.request(API + "/actions/workflows/" + workflow + "/dispatches", "POST", {"ref": branch})
        except (OSError, ValueError, RuntimeError) as error:
            state["ciDispatch"][workflow] = "BLOCKED"
            state["ciDispatchFailure"] = getattr(error, "evidence", {"errorClass": type(error).__name__})
            store.save(state)
            break
        state["ciDispatch"][workflow] = "DISPATCHED"
        store.save(state); sent.append(workflow)
    return {"commit": proposal["commit"], "dispatched": sent, "journal": state["ciDispatch"],
            "failure": state.get("ciDispatchFailure"), "checksPassed": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--issue", type=int, required=True)
    parser.add_argument("--fingerprint", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9a-f]{12}", args.fingerprint): raise ValueError("Invalid fingerprint")
    client = GitHub()
    result = dispatch_checks(client, IncidentStore(client, known_container=args.issue), args.fingerprint)
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__": main()
