#!/usr/bin/env python3
"""Offline validation of the public multisport contract; no network or writes."""
import json
import pathlib
import re
from urllib.parse import urlparse

ROOT = pathlib.Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "config/sport-data-contract.json"
REGISTRY = ROOT / "config/sport-sites.json"
IDENTIFIER = re.compile(r"^[a-z][a-z_0-9]*$")
SENSITIVE = {"personId","externalPlayerId","name","email","phone","birthDate","guardian","medical","free_text","search_term"}

def check(contract, registry):
    errors = []
    if contract.get("canonicalOrigin") != registry.get("canonicalSite"):
        errors.append("Canonical origin mismatch")
    people = contract.get("person") or {}
    if people.get("canonicalIdSource") != "hall-of-fame-people.json":
        errors.append("Hall canonical source mismatch")
    if people.get("externalIdentityKey") != ["provider", "externalPlayerId"]:
        errors.append("External identity key must be provider + player id")
    for field in ("verificationRequired",):
        if people.get(field) is not True:
            errors.append("Identity verification must be required")
    for field in ("automaticNameMatchAllowed", "mutateCanonicalProfileAllowed"):
        if people.get(field) is not False:
            errors.append(field + " must be disabled")
    events = contract.get("events") or {}
    required = set(events.get("required") or [])
    if not {"eventId","sportKey","eventDate","sourceUrl"}.issubset(required):
        errors.append("Missing event provenance fields")
    if events.get("canonicalEventIdField") != "eventId" or events.get("deduplicateBy") != ["eventId"]:
        errors.append("Event IDs must be canonical and unique")
    analytics = contract.get("analytics") or {}
    allowed = analytics.get("allowedEvents") or []
    params = analytics.get("allowedParameters") or []
    banned = set(analytics.get("disallowedParameters") or [])
    if not allowed or len(allowed) != len(set(allowed)) or any(not IDENTIFIER.fullmatch(x) for x in allowed):
        errors.append("Analytics events must be unique snake_case tokens")
    if not params or len(params) != len(set(params)):
        errors.append("Analytics parameters must be unique")
    if not {"sport_section","site_host"}.issubset(set(params)) or set(params) & (SENSITIVE | banned):
        errors.append("Analytics allowlist missing context or includes personal data")
    if not SENSITIVE.issubset(banned):
        errors.append("Incomplete analytics denylist")
    if analytics.get("mode") != "proposal-not-active":
        errors.append("Analytics must remain proposal-only")
    for sport in registry.get("departments",[]):
        if sport.get("analytics",{}).get("siteSection") != sport.get("key"):
            errors.append("Sport-section mismatch")
    for field in ("history", "hall"):
        if (contract.get("urlPolicy") or {}).get(field) != "central-only":
            errors.append("History and Hall must stay central")
    return errors

if __name__ == "__main__":
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    errors = check(contract, registry)
    if errors:
        raise SystemExit("\n".join(errors))
    print("PASS: multisport identity, event and analytics contract (offline proposal only)")
