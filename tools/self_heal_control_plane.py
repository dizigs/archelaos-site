"""Bounded incident state transitions; stores/publishers are explicit dependencies.

No DNS, deployment, consent, identity, history or merge operation exists here.
The foundation supplies policy/triage and the deterministic repair implementation.
"""
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from hashlib import sha256
import re
from urllib.parse import urlsplit

HEX64 = re.compile(r"[0-9a-f]{64}")
SHA = re.compile(r"[0-9a-f]{40}")
RUN = re.compile(r"https://github\.com/dizigs/archelaos-site/actions/runs/[0-9]{1,20}")
PHASES = {"OBSERVED", "DIAGNOSED", "REPAIR_RESERVED", "REPAIR_FAILED", "TESTED",
          "PUBLISH_BLOCKED", "DRAFT_PR_PROPOSED", "ESCALATED"}
TARGETS = {"fixture": "self-heal-fixtures/archery-preview.html",
           "preview": "prototypes/sport-site/index.html"}
REPAIR_TARGETS = {("archery", "link_failure", scope): path for scope, path in TARGETS.items()}
REPAIR_TARGETS.update({("club", "ci_failure", "fixture"): "self-heal-fixtures/news-head.html",
                       ("club", "ci_failure", "public"): "news.html"})
REQUIRED_DENIALS = {"bypass_branch_protection", "expose_secrets", "auto_merge_athlete_identities",
                   "fabricate_deployment_success"}


def instant(value):
    if not isinstance(value, str) or len(value) > 40:
        raise ValueError("Invalid evidence timestamp")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Evidence timestamps must include a timezone")
    return parsed.astimezone(timezone.utc)


def eligible_target(observation):
    target = REPAIR_TARGETS.get((observation.sport, observation.kind, observation.scope))
    parsed = urlsplit(observation.resource)
    if not target or parsed.hostname != "archelaos.club" or parsed.fragment:
        return None
    if observation.scope == "public":
        return target if observation.resource == "https://archelaos.club/news.html" else None
    if observation.scope == "preview":
        return target if parsed.path == "/prototypes/sport-site/index.html" else None
    filename = target.rsplit("/", 1)[1]
    return target if re.fullmatch(r"/__self-heal-fixture__/[a-z0-9-]{1,60}/" + re.escape(filename), parsed.path) else None


@dataclass(frozen=True)
class Policy:
    failure_classes: frozenset
    cooldown_minutes: int
    max_actions: int
    identical_attempts: int
    proposals_allowed: bool

    @classmethod
    def from_foundation(cls, data):
        if (not isinstance(data, dict) or data.get("schemaVersion") != 1 or data.get("mode") != "observe-and-propose-only"
                or data.get("createNewCron") is not False):
            raise ValueError("Unsupported or expanding foundation policy")
        actions = data.get("actions", {})
        if not isinstance(actions, dict) or not isinstance(actions.get("alwaysForbidden"), list):
            raise ValueError("Invalid action policy")
        if not REQUIRED_DENIALS.issubset(set(actions.get("alwaysForbidden", []))):
            raise ValueError("Foundation lacks required prohibitions")
        limits = data.get("limits", {})
        if not isinstance(limits, dict):
            raise ValueError("Invalid policy limits")
        values = [limits.get(name) for name in
                  ("cooldownMinutes", "maxSuggestedChangesPerRun", "maxRepeatedIdenticalAttempts")]
        if any(type(value) is not int or value < 1 for value in values):
            raise ValueError("Invalid bounded policy limits")
        classes = data.get("failureClasses")
        if not isinstance(classes, list) or not classes or any(not isinstance(c, str) for c in classes):
            raise ValueError("Invalid policy classes")
        # A policy may tighten the compiled ceiling, never silently expand it.
        return cls(frozenset(classes), max(180, values[0]), min(3, values[1]), min(1, values[2]),
                   "propose_scoped_draft_pr_with_tests" in actions.get("autoAllowed", []))


@dataclass(frozen=True)
class Observation:
    sport: str
    kind: str
    resource: str
    observed_at: str
    source_run: str
    source_commit: str
    source_signature: str
    scope: str

    @property
    def fingerprint(self):
        # Compatible with #90 triage's established stable key, not a second ID scheme.
        return sha256("|".join((self.sport, self.kind, self.resource)).encode()).hexdigest()[:12]

    def validate(self, policy, sport_keys, now):
        if (not isinstance(now, datetime) or now.tzinfo is None
                or any(not isinstance(value, str) for value in
                       (self.sport, self.kind, self.resource, self.source_run, self.source_commit,
                        self.source_signature, self.scope))):
            raise ValueError("Invalid typed observation or clock")
        if self.sport not in sport_keys or self.kind not in policy.failure_classes:
            raise ValueError("Unregistered sport or failure class")
        if self.scope not in {"public", "preview", "fixture"} or not isinstance(self.resource, str) or len(self.resource) > 512:
            raise ValueError("Invalid observation scope/resource")
        parsed = urlsplit(self.resource)
        public = (parsed.scheme == "https" and parsed.hostname in
                  {"archelaos.club", f"{self.sport}.archelaos.club"}
                  and not parsed.username and not parsed.password and parsed.port is None
                  and not parsed.query)
        if not public and self.resource not in {"live-health.yml", "automation-health.yml"}:
            raise ValueError("Unapproved or potentially sensitive resource")
        if not RUN.fullmatch(self.source_run) or not SHA.fullmatch(self.source_commit) or not HEX64.fullmatch(self.source_signature):
            raise ValueError("Missing exact source provenance")
        observed = instant(self.observed_at)
        if observed > now + timedelta(minutes=5) or observed < now - timedelta(days=7):
            raise ValueError("Stale or future evidence")


@dataclass(frozen=True)
class TestedPatch:
    path: str
    content: str
    before_sha256: str
    source_signature: str
    changes: int
    tests_passed: bool

    @property
    def after_sha256(self):
        return sha256(self.content.encode()).hexdigest()

    def validate(self, observation, policy):
        if self.path != eligible_target(observation):
            raise ValueError("Repair path/class is outside the approved pilot")
        if (not isinstance(self.content, str) or len(self.content.encode()) > 200000
                or not HEX64.fullmatch(self.before_sha256)
                or self.source_signature != observation.source_signature
                or self.before_sha256 == self.after_sha256 or self.tests_passed is not True
                or type(self.changes) is not int or not 1 <= self.changes <= policy.max_actions):
            raise ValueError("Repair lacks bounded change and regression evidence")


def checked_state(state, observation):
    if not isinstance(state, dict):
        raise ValueError("Invalid persisted state")
    expected = {"fingerprint": observation.fingerprint, "sportKey": observation.sport,
                "failureClass": observation.kind, "resource": observation.resource}
    if any(state.get(key) != value for key, value in expected.items()):
        raise ValueError("Persisted incident identity mismatch")
    attempts = state.get("attempts")
    signatures = state.get("attemptSignatures")
    if (state.get("schemaVersion") != 1 or state.get("phase") not in PHASES
            or state.get("productionVerified") is not False
            or type(attempts) is not int or not 0 <= attempts <= 3
            or not isinstance(signatures, list) or len(signatures) != attempts
            or any(not isinstance(s, str) or not HEX64.fullmatch(s) for s in signatures)
            or type(state.get("occurrences")) is not int or not 1 <= state["occurrences"] <= 1000
            or not isinstance(state.get("seenRuns"), list) or not 1 <= len(state["seenRuns"]) <= 3
            or any(not isinstance(run, str) or not RUN.fullmatch(run) for run in state["seenRuns"])):
        raise ValueError("Invalid persisted counters/phase")
    if state.get("lastAttemptAt") is not None:
        instant(state["lastAttemptAt"])
    instant(state.get("lastObservedAt"))
    return dict(state, attemptSignatures=list(signatures))


def initial_state(observation):
    return {"schemaVersion": 1, "fingerprint": observation.fingerprint,
            "sportKey": observation.sport, "failureClass": observation.kind,
            "resource": observation.resource, "phase": "OBSERVED", "attempts": 0,
            "attemptSignatures": [], "lastAttemptAt": None,
            "occurrences": 1, "seenRuns": [observation.source_run], "lastObservedAt": observation.observed_at,
            "sourceRunUrl": observation.source_run, "sourceCommit": observation.source_commit,
            "productionVerified": False}


def result(state, action, reason):
    return {"fingerprint": state["fingerprint"], "action": action, "reason": reason,
            "phase": state["phase"], "attempts": state["attempts"],
            "pr": state.get("pr"), "productionVerified": state.get("productionVerified") is True}


def process_incident(observation, policy, sport_keys, store, repair, publisher, now):
    """Caller serializes writers; store failures stop before any repair/publish."""
    observation.validate(policy, sport_keys, now)
    loaded = store.load(observation.fingerprint)
    if loaded is None:
        state = initial_state(observation)
        store.create(state)
    else:
        state = checked_state(loaded, observation)
    if state["phase"] in {"DRAFT_PR_PROPOSED", "VERIFIED", "ESCALATED"}:
        return result(state, "SUPPRESSED", "incident_already_handled")
    if state["phase"] in {"REPAIR_RESERVED", "TESTED", "PUBLISH_BLOCKED"}:
        return result(state, "BLOCKED", "reconcile_interrupted_or_blocked_attempt_first")
    if (observation.source_run not in state["seenRuns"] and
            now >= instant(state["lastObservedAt"]) + timedelta(minutes=policy.cooldown_minutes)):
        state.update(occurrences=min(1000, state["occurrences"] + 1), lastObservedAt=observation.observed_at,
                     seenRuns=(state["seenRuns"] + [observation.source_run])[-3:])
        if state["occurrences"] >= 3 and (state["phase"] == "DIAGNOSED" or
                                          observation.source_signature in state["attemptSignatures"]):
            state["phase"] = "ESCALATED"; store.save(state)
            return result(state, "ESCALATED", "repeated_failure_without_new_repair_conditions")
        store.save(state)
    if state["attemptSignatures"].count(observation.source_signature) >= policy.identical_attempts:
        return result(state, "SUPPRESSED", "identical_condition_attempt_cap")
    if state["lastAttemptAt"] and now < instant(state["lastAttemptAt"]) + timedelta(minutes=policy.cooldown_minutes):
        return result(state, "SUPPRESSED", "cooldown")
    if state["attempts"] >= 3:
        state["phase"] = "ESCALATED"; store.save(state)
        return result(state, "ESCALATED", "total_attempt_cap")
    if (repair is None or not policy.proposals_allowed
            or eligible_target(observation) is None):
        if state["phase"] != "DIAGNOSED":
            state["phase"] = "DIAGNOSED"; store.save(state)
        return result(state, "DIAGNOSED", "no_proven_allowlisted_repair")
    state.update(phase="REPAIR_RESERVED", attempts=state["attempts"] + 1,
                 lastAttemptAt=now.astimezone(timezone.utc).isoformat(),
                 sourceRunUrl=observation.source_run, sourceCommit=observation.source_commit)
    state["attemptSignatures"].append(observation.source_signature)
    store.save(state)  # Durable reservation precedes execution, including crashes.
    try:
        patch = repair(observation)
        if not isinstance(patch, TestedPatch):
            raise ValueError("Unrecognized repair result")
        patch.validate(observation, policy)
    except (OSError, ValueError, RuntimeError) as error:
        state.update(phase="REPAIR_FAILED", errorClass=type(error).__name__)
        store.save(state)
        return result(state, "REPAIR_FAILED", "repair_or_regression_rejected")
    state.update(phase="TESTED", path=patch.path, beforeSha256=patch.before_sha256,
                 afterSha256=patch.after_sha256)
    store.save(state)
    try:
        proposal = publisher.propose(observation, patch)
        if (not isinstance(proposal, dict) or type(proposal.get("number")) is not int
                or not isinstance(proposal.get("commit"), str) or not SHA.fullmatch(proposal["commit"])
                or not isinstance(proposal.get("url"), str)
                or not re.fullmatch(r"https://github\.com/dizigs/archelaos-site/pull/[0-9]+", proposal["url"])):
            raise ValueError("Publisher did not return exact draft PR evidence")
    except (OSError, ValueError, RuntimeError) as error:
        state.update(phase="PUBLISH_BLOCKED", errorClass=type(error).__name__)
        store.save(state)
        return result(state, "BLOCKED", "publication_failed_no_retry")
    state.update(phase="DRAFT_PR_PROPOSED", pr=proposal)
    store.save(state)
    return result(state, "DRAFT_PR_PROPOSED", "tested_repair_waiting_for_review")


def process_batch(observations, policy, sport_keys, store, repair, publisher, now):
    if not isinstance(observations, list) or len(observations) > 100:
        raise ValueError("Observation batch outside bounds")
    unique = {}
    for observation in observations:
        if not isinstance(observation, Observation):
            raise ValueError("Invalid observation")
        observation.validate(policy, sport_keys, now)
        unique.setdefault(observation.fingerprint, observation)
    results = []
    for observation in list(unique.values())[:policy.max_actions]:
        results.append(process_incident(observation, policy, sport_keys, store, repair, publisher, now))
    return {"results": results, "deferred": len(unique) - len(results),
            "productionMutationPerformed": False, "automaticMergePerformed": False}
