"""Offline config/inventory comparison. Never reads credentials or calls a provider.

JSON inventory on stdin is private operator evidence, NOT trusted authorization.
No input contents/values are printed. Even PASS never authorizes an upload.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import tomllib

ROOT = Path(__file__).resolve().parents[2]
BRAIN = "archelaos-brain-staging"
HEALER = "archelaos-self-heal"
FLAGS = ("BRAIN_SELFHEAL_RECOVERY_ENABLED", "BRAIN_SELFHEAL_BINDING_ATTESTED",
         "BRAIN_SELFHEAL_DISPATCH_ENABLED")
LINKS = [dict(binding="HEALER", service=HEALER),
         dict(binding="BRAIN_RECOVERY", service=BRAIN, entrypoint="BrainRecoveryPort")]


def load_configs():
    return [tomllib.loads((ROOT / p).read_text()) for p in (
        "brain/wrangler.toml", "automation/self-heal-worker/wrangler.toml")]


def check_configs(configs):
    errors = []
    for i, (name, do_name, cls, tag) in enumerate((
        (BRAIN, "BRAIN", "BrainCoordinator", "brain-staging-v1"),
        (HEALER, "HEALER_MEMORY", "HealerMemory", "healer-sqlite-v1"),
    )):
        c = configs[i]
        if c.get("name") != name or c.get("main") != "src/worker.mjs":
            errors.append("WORKER_IDENTITY_CHANGED")
        if c.get("compatibility_date") != ("2026-07-30" if i == 0 else "2026-11-01"):
            errors.append("RUNTIME_DATE_CHANGED")
        if c.get("workers_dev") is not False or c.get("preview_urls") is not False:
            errors.append("PUBLIC_EXPOSURE_ENABLED")
        if any(key in c for key in ("routes", "route", "triggers", "env", "unsafe")):
            errors.append("UNREVIEWED_EXPOSURE_OR_OVERRIDE")
        if c.get("services") != [LINKS[i]]:
            errors.append("SERVICE_SCOPE_CHANGED")
        if c.get("durable_objects") != {"bindings": [{"name": do_name, "class_name": cls}]}:
            errors.append("DURABLE_OBJECT_IDENTITY_CHANGED")
        if c.get("migrations") != [{"tag": tag, "new_sqlite_classes": [cls]}]:
            errors.append("MIGRATION_HISTORY_CHANGED")
    brain, healer = configs
    if brain.get("ai") != {"binding": "AI"} or "ai" in healer:
        errors.append("AI_BINDING_PARITY_CHANGED")
    v = brain.get("vars", {})
    if (v.get("ENVIRONMENT") != "staging" or v.get("DEPLOY_SHA") != "0" * 40 or
            v.get("STAGING_EXPIRES_AT") != "1970-01-01T00:00:00Z" or
            any(v.get(flag) != "false" for flag in FLAGS)):
        errors.append("INACTIVE_GATES_CHANGED")
    if (v.get("BRAIN_GITHUB_APP_ID") != "5641216" or
            v.get("BRAIN_GITHUB_APP_INSTALLATION_ID") != "179225349"):
        errors.append("APP_IDENTITY_CHANGED")
    for c in configs:
        if any(k.endswith(("_KEY", "_SECRET", "_TOKEN")) for k in c.get("vars", {})):
            errors.append("INLINE_CREDENTIAL_FORBIDDEN")
    return sorted(set(errors))


def declared_bindings(c):
    declared = {k: {"name": k, "type": "plain_text", "text": v}
                for k, v in c.get("vars", {}).items()}
    for d in c["durable_objects"]["bindings"]:
        declared[d["name"]] = {"name": d["name"], "type": "durable_object_namespace",
                               "class_name": d["class_name"]}
    if "ai" in c:
        n = c["ai"]["binding"]
        declared[n] = {"name": n, "type": "ai"}
    for s in c["services"]:
        declared[s["binding"]] = {"name": s["binding"], "type": "service",
                                  "service": s["service"], "entrypoint": s.get("entrypoint")}
    return declared


def assess(configs, inventory=None, now=None):
    errors = check_configs(configs)
    result = {"scope": "OFFLINE_INACTIVE_CONFIG_AND_BINDING_PRESERVATION",
              "configuration": "BLOCKED" if errors else "PASS",
              "bindingPreservation": "NOT_VERIFIED", "uploadAuthorized": False,
              "liveConnectivityVerified": False, "blockers": errors}
    if errors:
        return result
    if inventory is None:
        result["blockers"] = ["FRESH_PRIVATE_LIVE_INVENTORY_REQUIRED"]
        return result
    if not isinstance(inventory, dict):
        result["blockers"] = ["INVENTORY_MALFORMED"]
        return result
    now = now or datetime.now(timezone.utc)
    try:
        captured = datetime.fromisoformat(inventory["capturedAt"].replace("Z", "+00:00"))
        age = (now - captured).total_seconds()
        if not 0 <= age <= 900:
            raise ValueError("stale")
    except (KeyError, TypeError, AttributeError, ValueError):
        errors.append("INVENTORY_STALE_OR_UNDATED")
    workers = inventory.get("workers")
    if (not isinstance(workers, list) or len(workers) != 2 or
            any(not isinstance(w, dict) for w in workers) or
            sorted(w.get("name", "") for w in workers) != sorted([BRAIN, HEALER])):
        errors.append("INVENTORY_WORKERS_INCOMPLETE")
    else:
        for config in configs:
            worker = next(w for w in workers if w["name"] == config["name"])
            live = worker.get("bindings")
            if (not isinstance(live, list) or not live or
                    any(not isinstance(b, dict) or not isinstance(b.get("name"), str)
                        for b in live)):
                errors.append("BINDING_INVENTORY_INCOMPLETE")
                continue
            if len({b["name"] for b in live}) != len(live):
                errors.append("DUPLICATE_LIVE_BINDING")
            declared = declared_bindings(config)
            required = {"BRAIN", "AI"} if config["name"] == BRAIN else {"HEALER_MEMORY"}
            if not required.issubset({b["name"] for b in live}):
                errors.append("BASELINE_BINDING_MISSING")
            for b in live:
                expected = declared.get(b["name"])
                if b.get("type") == "secret_text":
                    # Wrangler preserves encrypted secrets by default. Never put
                    # their values into this metadata file or convert one to vars.
                    if set(b) != {"name", "type"}:
                        errors.append("SECRET_METADATA_ONLY_REQUIRED")
                    if expected is not None:
                        errors.append("SECRET_BINDING_OVERWRITTEN")
                    continue
                if expected is None or b.get("type") != expected["type"]:
                    errors.append("UNDECLARED_OR_RETYPED_LIVE_BINDING")
                    continue
                kind = expected["type"]
                if kind == "durable_object_namespace":
                    if (b.get("class_name") != expected["class_name"] or
                            not isinstance(b.get("namespace_id"), str) or not b["namespace_id"] or
                            b.get("script_name") not in (None, config["name"]) or
                            b.get("environment") not in (None, "")):
                        errors.append("LIVE_DO_NAMESPACE_OR_TARGET_UNVERIFIED")
                elif kind == "service":
                    entrypoint = b.get("entrypoint") or None
                    if expected["entrypoint"] is None and entrypoint == "default":
                        entrypoint = None
                    if (b.get("service") != expected["service"] or
                            entrypoint != expected["entrypoint"] or
                            b.get("environment") not in (None, "")):
                        errors.append("LIVE_SERVICE_TARGET_CONFLICT")
                elif kind == "plain_text":
                    # Only explicit inactive overrides may change their live value.
                    if (b["name"] not in (*FLAGS, "DEPLOY_SHA") and
                            b.get("text") != expected["text"]):
                        errors.append("LIVE_VARIABLE_VALUE_CONFLICT")
    result["blockers"] = sorted(set(errors))
    result["bindingPreservation"] = "BLOCKED" if errors else "PASS"
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config-only", action="store_true")
    args = parser.parse_args()
    try:
        inventory = None
        if not args.config_only:
            raw = sys.stdin.buffer.read(128 * 1024 + 1)
            if len(raw) > 128 * 1024:
                raise ValueError("oversized")
            inventory = json.loads(raw)
        result = assess(load_configs(), inventory)
    except (ValueError, TypeError, KeyError):
        result = {"configuration": "BLOCKED", "uploadAuthorized": False,
                  "blockers": ["INVALID_CONFIG_OR_METADATA"]}
    print(json.dumps(result, sort_keys=True))
    return 1 if result["configuration"] != "PASS" or (not args.config_only and result["blockers"]) else 0


if __name__ == "__main__":
    sys.exit(main())
