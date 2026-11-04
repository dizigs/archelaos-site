#!/usr/bin/env python3
"""Evidence-based self-heal triage, NOT an autonomous code executor.

Local-first incident memory, confidence calibration, contradiction detection,
recurrence suppression and safe escalation. No network, shell, Git or AI calls.
External knowledge is data, never authority to execute a repair.
"""
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import sqlite3

MAX_EVIDENCE = 40
MAX_TEXT = 600
TRUST = {
    "exact_ci": 1.0,
    "deployment_log": 0.98,
    "reproduced_test": 0.95,
    "verified_lockfile": 0.93,
    "reviewed_incident": 0.85,
    "provider_documentation": 0.7,
    "osv_advisory": 0.7,
    "web_article": 0.35,
    "ai_suggestion": 0.2,
}
NON_EXECUTABLE = {"provider_documentation", "osv_advisory", "web_article", "ai_suggestion"}
VALID_OUTCOMES = {"resolved", "failed", "regressed", "unknown"}
SAFE_STATUSES = {"DIAGNOSE_ONLY", "REVIEW_REQUIRED", "REPRODUCE_FIRST", "QUARANTINED"}
SHA = re.compile(r"^[0-9a-f]{40}$")
FINGERPRINT = re.compile(r"^[a-f0-9]{64}$")
CODE = re.compile(r"^[A-Za-z0-9._:-]{2,90}$")


class TriageError(ValueError):
    pass


def _time(value):
    if not isinstance(value, str):
        raise TriageError("Invalid UTC timestamp")
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise TriageError("Invalid UTC timestamp") from exc
    if dt.tzinfo is None:
        raise TriageError("Timezone required")
    return dt.astimezone(timezone.utc)


def _text(value, limit=MAX_TEXT):
    if not isinstance(value, str) or len(value) > limit or not value.strip():
        raise TriageError("Missing/oversized evidence text")
    return value.strip()


def fingerprint(incident):
    """Stable across CI run retries; scoped by repo, fault class and resource."""
    repo = _text(incident.get("repository"), 120)
    if repo != "dizigs/archelaos-site":
        raise TriageError("Untrusted repository scope")
    fault = _text(incident.get("failureCode"), 90)
    if not CODE.fullmatch(fault):
        raise TriageError("Invalid failure code")
    resource = _text(incident.get("resource"), 200)
    if ".." in resource or "\\" in resource:
        raise TriageError("Unsafe resource path")
    canonical = json.dumps([repo, fault, resource], separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode()).hexdigest()


def _evidence(raw, observed_at, head):
    if not isinstance(raw, dict):
        raise TriageError("Evidence must be an object")
    kind = raw.get("kind")
    if kind not in TRUST:
        raise TriageError("Unknown evidence source")
    ref = _text(raw.get("ref"), 350)
    claim = _text(raw.get("claim"), 120)
    if not CODE.fullmatch(claim):
        raise TriageError("Invalid evidence claim")
    polarity = raw.get("supports")
    if not isinstance(polarity, bool):
        raise TriageError("Evidence must explicitly support or contradict")
    timestamp = _time(raw.get("observedAt"))
    if timestamp > observed_at:
        raise TriageError("Future evidence is not reliable")
    age_days = max(0.0, (observed_at - timestamp).total_seconds() / 86400)
    freshness = 1.0 if age_days <= 1 else 0.8 if age_days <= 7 else 0.5 if age_days <= 30 else 0.2
    exact_head = raw.get("headSha") == head
    if kind in {"exact_ci", "deployment_log", "reproduced_test", "verified_lockfile"} and not exact_head:
        # Evidence from an old commit can help explain history, but cannot
        # assert the current commit's behavior.
        freshness *= 0.15
    if raw.get("withdrawn") is True:
        freshness = 0.0
    weight = round(TRUST[kind] * freshness, 6)
    return {"kind": kind, "ref": ref, "claim": claim, "supports": polarity,
            "weight": weight, "exactHead": exact_head, "observedAt": timestamp.isoformat(),
            "external": kind in NON_EXECUTABLE}


def _historical_penalty(outcomes):
    # Failed or regressed fixes to the SAME incident signature suppress repeats.
    if not isinstance(outcomes, list) or len(outcomes) > 50:
        raise TriageError("Invalid incident history")
    bad = 0
    seen = set()
    for item in outcomes:
        if not isinstance(item, dict) or item.get("outcome") not in VALID_OUTCOMES:
            raise TriageError("Invalid historical outcome")
        revision = _text(item.get("attemptId"), 120)
        if revision in seen:
            continue
        seen.add(revision)
        if item["outcome"] in {"failed", "regressed"}:
            bad += 1
    return min(0.7, 0.2 * bad), bad


def evaluate(incident, *, now=None):
    """Pure deterministic triage. Output is diagnostic, never a repair approval."""
    if not isinstance(incident, dict):
        raise TriageError("Incident must be an object")
    now = _time(now or datetime.now(timezone.utc).isoformat())
    observed = _time(incident.get("observedAt"))
    if observed > now:
        raise TriageError("Incident timestamp in future")
    if (now - observed).total_seconds() > 30 * 86400:
        stale_incident = True
    else:
        stale_incident = False
    head = incident.get("headSha")
    if not isinstance(head, str) or not SHA.fullmatch(head):
        raise TriageError("Missing exact commit SHA")
    fp = fingerprint(incident)
    raw = incident.get("evidence")
    if not isinstance(raw, list) or len(raw) > MAX_EVIDENCE:
        raise TriageError("Unbounded evidence list")
    evidence = [_evidence(item, now, head) for item in raw]
    # Multiple copies of the same link/ref are not independent corroboration.
    unique = {}
    for item in evidence:
        key = (item["kind"], item["ref"], item["claim"])
        if key in unique and unique[key]["supports"] != item["supports"]:
            raise TriageError("Same evidence reference makes contradictory claims")
        if key not in unique or item["weight"] > unique[key]["weight"]:
            unique[key] = item
    evidence = list(unique.values())
    claims = {}
    for item in evidence:
        group = claims.setdefault(item["claim"], {"support": [], "contradict": []})
        group["support" if item["supports"] else "contradict"].append(item)
    ranking = []
    for code, group in claims.items():
        # Combine independent sources using bounded probabilistic OR;
        # no number of weak web/AI opinions can become repair authority.
        positive = 1.0 - math.prod(1 - x["weight"] for x in group["support"])
        negative = 1.0 - math.prod(1 - x["weight"] for x in group["contradict"])
        confidence = max(0.0, min(1.0, positive * (1 - negative)))
        corroborated = len({x["kind"] for x in group["support"] if x["weight"] >= 0.65})
        exact = any(x["exactHead"] and x["weight"] >= 0.65 and x["kind"] in
                    {"exact_ci", "reproduced_test", "deployment_log"} and x["supports"]
                    for x in group["support"])
        contradictory = negative >= 0.5
        ranking.append({"claim": code, "confidence": round(confidence, 4),
                        "positive": round(positive, 4), "negative": round(negative, 4),
                        "contradicted": contradictory, "trustedSourceTypes": corroborated,
                        "exactHeadReproduction": exact})
    ranking.sort(key=lambda x: (-x["confidence"], x["claim"]))
    penalty, failures = _historical_penalty(incident.get("history", []))
    for item in ranking:
        item["confidence"] = round(max(0.0, item["confidence"] - penalty), 4)
    ranking.sort(key=lambda x: (-x["confidence"], x["claim"]))
    best = ranking[0] if ranking else None
    uncertain = (not best or best["confidence"] < 0.75 or best["contradicted"]
                 or (len(ranking) > 1 and best["confidence"] - ranking[1]["confidence"] < 0.15))
    if failures >= 3:
        status, reason = "QUARANTINED", "REPEATED_FIX_FAILURES"
    elif stale_incident:
        status, reason = "REPRODUCE_FIRST", "STALE_INCIDENT"
    elif uncertain:
        status, reason = "REPRODUCE_FIRST", "INSUFFICIENT_OR_CONFLICTING_EVIDENCE"
    elif not best["exactHeadReproduction"]:
        status, reason = "REPRODUCE_FIRST", "NO_EXACT_HEAD_REPRODUCTION"
    elif best["trustedSourceTypes"] < 2:
        status, reason = "REVIEW_REQUIRED", "NEEDS_INDEPENDENT_CORROBORATION"
    else:
        status, reason = "REVIEW_REQUIRED", "CANDIDATE_FOR_HUMAN_REVIEW"
    return {
        "schemaVersion": 1, "fingerprint": fp, "headSha": head,
        "status": status, "reason": reason, "rankedHypotheses": ranking[:8],
        "evidenceCount": len(evidence), "historyFailures": failures,
        "externalContentMayAuthorizeRepair": False, "autoMerge": False,
        "productionVerified": False, "remoteMutationPerformed": False,
    }


def connect_journal(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=5)
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS triage_events(
            event_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL,
            head_sha TEXT NOT NULL, observed_at TEXT NOT NULL,
            status TEXT NOT NULL, payload TEXT NOT NULL,
            created_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_triage_fp ON triage_events(fingerprint,head_sha);
        CREATE TABLE IF NOT EXISTS triage_outcomes(
            attempt_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL,
            outcome TEXT NOT NULL, recorded_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_outcome_fp ON triage_outcomes(fingerprint);
    """)
    return conn


def record_incident(conn, incident, *, now=None):
    """Append-only, idempotent local journal. Same event ID cannot be redefined."""
    event_id = _text(incident.get("eventId"), 120)
    if not CODE.fullmatch(event_id):
        raise TriageError("Invalid event ID")
    result = evaluate(incident, now=now)
    payload = json.dumps(result, sort_keys=True, separators=(",", ":"))
    with conn:
        old = conn.execute("SELECT payload FROM triage_events WHERE event_id=?",
                           (event_id,)).fetchone()
        if old:
            if old[0] != payload:
                raise TriageError("Replay event ID conflicts with recorded evidence")
            return {"status": "REPLAY_SUPPRESSED", "fingerprint": result["fingerprint"]}
        conn.execute("INSERT INTO triage_events VALUES (?,?,?,?,?,?,?)",
                     (event_id, result["fingerprint"], result["headSha"],
                      incident["observedAt"], result["status"], payload,
                      datetime.now(timezone.utc).isoformat()))
    return result


def record_outcome(conn, fingerprint_value, attempt_id, outcome):
    if not FINGERPRINT.fullmatch(fingerprint_value) or not CODE.fullmatch(attempt_id):
        raise TriageError("Invalid outcome identity")
    if outcome not in VALID_OUTCOMES:
        raise TriageError("Invalid outcome")
    with conn:
        old = conn.execute("SELECT fingerprint,outcome FROM triage_outcomes WHERE attempt_id=?",
                           (attempt_id,)).fetchone()
        if old:
            if old != (fingerprint_value, outcome):
                raise TriageError("Conflicting outcome replay")
            return False
        conn.execute("INSERT INTO triage_outcomes VALUES (?,?,?,?)",
                     (attempt_id, fingerprint_value, outcome,
                      datetime.now(timezone.utc).isoformat()))
    return True


def history_for(conn, fingerprint_value):
    if not FINGERPRINT.fullmatch(fingerprint_value):
        raise TriageError("Invalid fingerprint")
    return [{"attemptId": row[0], "outcome": row[1]} for row in conn.execute(
        "SELECT attempt_id,outcome FROM triage_outcomes WHERE fingerprint=? ORDER BY recorded_at,attempt_id LIMIT 50",
        (fingerprint_value,))]


def main():
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("incident", type=Path, help="Locally supplied incident JSON, never a remote URL")
    parser.add_argument("--journal", action="store_true", help="Enable the fixed local append-only SQLite journal")
    args = parser.parse_args()
    if args.incident.stat().st_size > 64 * 1024:
        parser.error("Incident exceeds 64 KiB")
    incident = json.loads(args.incident.read_text(encoding="utf-8"))
    if args.journal:
        # Never pass an LLM/user-provided CLI path to the SQLite connection.
        # Journal location is a fixed private build artifact, not a public file.
        with connect_journal(Path(__file__).resolve().parents[1] / "rebuild" / "test-artifacts" / "self-heal" / "triage.sqlite3") as conn:
            incident["history"] = history_for(conn, fingerprint(incident))
            result = record_incident(conn, incident)
    else:
        result = evaluate(incident)
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
