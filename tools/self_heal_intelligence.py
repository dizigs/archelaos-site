"""Evidence-ranked, explainable self-heal diagnosis; never publishes or runs repairs.

Works offline with the existing reviewed catalog, public health report and
optional locally indexed OSV evidence. External data is untrusted reference text.
No GitHub, Cloudflare, shell, model or write APIs are exposed here.
"""
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import re
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "docs/self-heal/error-solution-catalog.json"
TAXONOMY = ROOT / "docs/self-heal/provider-error-taxonomy.json"
CACHE = ROOT / "rebuild/test-artifacts/knowledge-cache/osv.sqlite3"
LIVE_REPORT = ROOT / "rebuild/test-artifacts/live-site-health.json"
MAX_REPORT = 256 * 1024
ROUTES = ("/", "/news.html", "/search.html", "/hall-of-fame.html",
          "/news.json", "/hall-of-fame-people.json", "/tmimata.html")
SHA = re.compile(r"[0-9a-f]{40}\Z")
CVE = re.compile(r"\bCVE-\d{4}-\d{4,12}\b", re.I)
GHSA = re.compile(r"\bGHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}\b", re.I)
REDUCT = re.compile(r"(?:gh[pousr]_[A-Za-z0-9_]+|(?:api[_-]?key|token|password|secret)\s*[:=]\s*\S+)", re.I)
CODE = re.compile(r"\b(?:CF|GH)-(\d{3,4})\b", re.I)

# Diagnostic rules are never repair permissions. Priority expresses impact,
# while evidence confidence is reported independently.
CLASSIFIERS = (
    ("IDENTITY_INTEGRITY", 0, ("person ids are missing or duplicated", "duplicate person id")),
    ("SECURITY_OR_AUTH", 0, ("unauthorized", "security", "credential", "token", "sonar")),
    ("PUBLISHED_ASSET_DRIFT", 1, ("published asset fingerprint mismatch", "fingerprint mismatch")),
    ("ARCHIVE_CORRUPTION", 1, ("invalid archive", "invalid json", "missing archive")),
    ("PUBLIC_HTTP_FAILURE", 1, ("http 5", "http 4", "timed out", "connection refused", "connection reset")),
    ("BROKEN_FUNCTIONALITY", 1, ("missing main element", "controls missing", "department cards missing")),
    ("ACCESSIBILITY_OR_UI", 2, ("responsive css", "common navigation", "aria", "a11y", "wcag")),
)
ESCAPE_CODE = "ARCH-HTML-ESCAPES-001"


def _read_reference(path, expected_mode):
    # Authoritative version-controlled definitions; never use an arbitrary
    # external URL or a path supplied in incident text.
    data = json.loads(path.read_text(encoding="utf-8"))
    if (not isinstance(data, dict) or data.get("schemaVersion") != 1 or
            data.get("mode") != expected_mode or not isinstance(data.get("entries"), list) or
            len(data["entries"]) > 3000):
        raise ValueError("Reviewed knowledge reference is invalid")
    return data["entries"]


def _clean_report_value(message):
    if not isinstance(message, str) or not 1 <= len(message) <= 1400:
        return None
    # Do not propagate report text into issue comments; only translate it
    # to compiled, recognizable signatures. This blocks token leakage and
    # instructions disguised as HTTP error output.
    if REDUCT.search(message):
        return None
    return message.casefold()


def _classify(message):
    text = _clean_report_value(message)
    if text is None:
        return {"code": "UNTRUSTED_REPORT_MESSAGE", "priority": 1, "route": None}
    route = next((r for r in ROUTES if r != "/" and r in text), None)
    for code, priority, needles in CLASSIFIERS:
        if any(needle in text for needle in needles):
            return {"code": code, "priority": priority, "route": route}
    return {"code": "UNKNOWN_PUBLIC_FAILURE", "priority": 1, "route": route}


def health_signals(report):
    """Extract only bounded, safe signatures from read-only live-site health JSON."""
    if not isinstance(report, dict) or not isinstance(report.get("errors"), list):
        raise ValueError("Invalid public health report")
    errors = report["errors"]
    if len(errors) > 80:
        raise ValueError("Oversized public health report")
    signals, seen = [], set()
    for error in errors:
        finding = _classify(error)
        key = (finding["code"], finding["route"])
        if key in seen:
            continue
        seen.add(key)
        signals.append(finding)
    return sorted(signals, key=lambda r: (r["priority"], r["code"], r["route"] or ""))[:16]


def read_live_report():
    """No user-supplied path and no arbitrary filesystem read; fail closed."""
    path = LIVE_REPORT
    try:
        if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_REPORT:
            return {"state": "MISSING_OR_INVALID", "signals": []}
        payload = json.loads(path.read_text(encoding="utf-8"))
        return {"state": "READ", "signals": health_signals(payload)}
    except (OSError, ValueError, json.JSONDecodeError):
        return {"state": "MISSING_OR_INVALID", "signals": []}


def provider_matches(signal, entries):
    if not isinstance(signal, str) or len(signal) > 400 or REDUCT.search(signal):
        return []
    text = signal.casefold()
    provider = "cloudflare" if re.search(r"\bcloudflare\b|\bcf-\d", text) else (
        "github" if re.search(r"\bgithub\b|\bgh-\d", text) else None)
    if provider is None:
        return []
    explicit = {match.group(1) for match in CODE.finditer(signal)}
    # "Cloudflare Error 522" and "GitHub API HTTP 403" are explicit contexts;
    # generic HTTP 403 alone cannot be attributed to GitHub or Cloudflare.
    explicit.update(re.findall(r"\b(?:error|http|status)\s+(\d{3,4})\b", text))
    out = []
    for item in entries:
        if (item.get("provider") != provider or item.get("status") != "DIAGNOSE_ONLY"
                or item.get("executionAllowed") is not False):
            continue
        suffix = str(item.get("code", "")).split("-")[-1]
        if suffix in explicit and isinstance(item.get("sourceUrl"), str) and \
                item["sourceUrl"].startswith("https://"):
            out.append({"code": item["code"], "category": item.get("category"),
                        "sourceUrl": item["sourceUrl"], "strength": "PROVIDER_ERROR_CODE",
                        "action": "INSPECT_OFFICIAL_DIAGNOSTICS"})
    return out[:4]


def local_matches(sport, kind, resource, marker, entries):
    # Exact identity matching prevents keyword coincidences from enabling fixes.
    matches = []
    for item in entries:
        if not (item.get("sportKey") == sport and item.get("failureClass") == kind and
                item.get("resource") == resource):
            continue
        if item.get("code") == ESCAPE_CODE and marker != "HTML_ESCAPED_TEXT":
            continue
        status = item.get("status")
        if status not in {"ISOLATED_REPAIR_VERIFIED", "DIAGNOSE_ONLY"}:
            continue
        evidence = item.get("evidence") or {}
        mode = (item.get("remediation") or {}).get("mode")
        candidate = {"code": item["code"], "status": status,
                     "evidence": "ISOLATED_RED_GREEN" if status == "ISOLATED_REPAIR_VERIFIED"
                     and evidence.get("scope") == "isolated-fixture" else "LOCAL_DIAGNOSTIC_REFERENCE",
                     "sourceUrl": evidence.get("run") or evidence.get("incident"),
                     "diagnosisOnly": True}
        if mode == "DRAFT_PR_ONLY" and status == "ISOLATED_REPAIR_VERIFIED":
            candidate["allowedProposal"] = "REVIEWED_DRAFT_PR_WITH_INDEPENDENT_TESTS"
        else:
            candidate["allowedProposal"] = "NONE"
        matches.append(candidate)
    return matches[:4]


def advisory_mentions(signal, db_path=None):
    """Read-only OSV ID evidence. Text similarity cannot establish version impact."""
    ids = sorted({i.upper() for i in CVE.findall(signal)} | {i.upper() for i in GHSA.findall(signal)})[:8]
    if not ids:
        return {"status": "NOT_APPLICABLE", "advisories": []}
    path = Path(db_path) if db_path is not None else CACHE
    if not path.is_file() or path.is_symlink() or path.stat().st_size > 600 * 1024 * 1024:
        return {"status": "INDEX_NOT_AVAILABLE", "advisories": []}
    try:
        from self_heal_knowledge import inspect
        # Read only; this does NOT initialize an empty SQLite database.
        con = sqlite3.connect("file:" + path.resolve().as_posix() + "?mode=ro", uri=True, timeout=1)
        con.execute("PRAGMA query_only=ON")
        try:
            evidences = []
            for advisory_id in ids:
                for item in inspect(con, advisory_id):
                    if item.get("withdrawn"):
                        continue
                    evidences.append({"id": item["id"], "canonicalId": item["canonicalId"],
                                     "sourceUrl": item["sourceUrl"],
                                     "packageImpactVerified": False})
            unique = list({r["id"]: r for r in evidences}.values())[:8]
            return {"status": "READ_ONLY_REFERENCE", "advisories": unique}
        finally:
            con.close()
    except (OSError, ValueError, sqlite3.Error):
        return {"status": "INDEX_UNAVAILABLE_OR_INCOMPLETE", "advisories": []}


def triage(*, sport, kind, resource, signal, marker=None, report=None, journal=None,
           source_commit=None, db_path=None, catalog=None, taxonomy=None):
    """Produce reproducible, bounded incident analysis; NEVER return a write command."""
    if (sport != "club" or kind not in {"unknown", "ci_failure", "security_quality_gate"} or
            resource not in {"https://archelaos.club/", "https://archelaos.club/news.html",
                             "https://github.com/dizigs/archelaos-site/issues/66"} or
            not isinstance(signal, str) or len(signal) > 400 or REDUCT.search(signal)):
        raise ValueError("Untrusted incident scope or content")
    if source_commit is not None and (not isinstance(source_commit, str) or
                                      not SHA.fullmatch(source_commit)):
        raise ValueError("Invalid incident commit")
    casebook = catalog if catalog is not None else _read_reference(CATALOG, "REVIEWED_REFERENCE_ONLY")
    providerbook = taxonomy if taxonomy is not None else _read_reference(TAXONOMY, "READ_ONLY_DIAGNOSTICS")
    cases = local_matches(sport, kind, resource, marker, casebook)
    providers = provider_matches(signal, providerbook)
    signals = health_signals(report) if report is not None else []
    advisories = advisory_mentions(signal, db_path=db_path)
    recurrence = {"phase": "UNKNOWN", "attempts": 0, "occurrences": 0}
    if isinstance(journal, dict):
        phase = journal.get("phase", "UNKNOWN")
        if phase in {"DIAGNOSED", "REPAIR_FAILED", "DRAFT_PR_PROPOSED", "ESCALATED",
                     "TESTED", "REPAIR_RESERVED", "OBSERVED", "PUBLISH_BLOCKED"}:
            recurrence["phase"] = phase
        for field in ("attempts", "occurrences"):
            n = journal.get(field, 0)
            if type(n) is int and 0 <= n <= 100000:
                recurrence[field] = n
    # A verified isolated fixture can support a draft recommendation, NOT
    # production repair confidence. Official code is evidence of symptom,
    # not evidence of root cause or a proven fix.
    scope_critical = any(x["priority"] == 0 for x in signals) or kind == "security_quality_gate"
    priority = 0 if scope_critical else (min((x["priority"] for x in signals), default=1))
    if recurrence["phase"] == "ESCALATED" or recurrence["occurrences"] >= 3:
        priority = min(priority, 1)
    draft_case = next((x for x in cases if x.get("allowedProposal") ==
                       "REVIEWED_DRAFT_PR_WITH_INDEPENDENT_TESTS"), None)
    decision = ("ESCALATE_SECURITY_OR_IDENTITY" if scope_critical else
                "RECONCILE_REPEATED_INCIDENT" if recurrence["phase"] == "ESCALATED" else
                "REVIEW_TESTED_DRAFT_CANDIDATE" if draft_case else
                "INSPECT_PROVIDER_DIAGNOSTICS" if providers else
                "INVESTIGATE_UNVERIFIED_FAILURE")
    priority_label = ("P0", "P1", "P2", "P3")[min(priority, 3)]
    return {"schemaVersion": 1, "status": "EVIDENCE_RANKED_DIAGNOSIS",
            "sourceCommit": source_commit, "riskPriority": priority_label,
            "decision": decision, "confidence": "ISOLATED_REPAIR_KNOWN" if draft_case else
            "PROVIDER_SYMPTOM" if providers else "INCOMPLETE",
            "priorHistory": recurrence, "healthReportSignals": signals,
            "localVerifiedReferences": cases, "providerReferences": providers,
            "osv": advisories, "productionRecoveryVerified": False,
            "automaticMergeAuthorized": False, "untrustedSourcesCannotAuthorizeWrites": True}


def triage_monitor_observation(observation, incident_result, *, report=None, db_path=None):
    """Bridge existing controller result -> evidence, keeping repair decision separate."""
    marker = "HTML_ESCAPED_TEXT" if observation.kind == "ci_failure" and \
        observation.resource == "https://archelaos.club/news.html" else None
    return triage(sport=observation.sport, kind=observation.kind,
                  resource=observation.resource, signal=observation.status_or_error,
                  marker=marker, report=report, journal=incident_result,
                  source_commit=observation.source_commit, db_path=db_path)
