"""Operator-gated, fail-closed dormant Healer rollout; no application repair dispatch."""
import json
import os
import subprocess
import sys
import tomllib
import urllib.error
import urllib.request
from pathlib import Path

ACCOUNT = "898359728b3dfe8c3a3f56e3d19eecd1"
PINNED_MAIN = "89b7c3bf92b3148cd480133e72c747e8235ddfa2"
BRAIN_VERSION = "e565910f-bbb4-44f6-b0b5-3463906ce495"
HEALER_VERSION = "65b729ea-c5c2-4118-8632-9d37e615d0cb"
HEALER = "archelaos-self-heal"
BRAIN = "archelaos-brain-staging"
SUBJECT = "deploy(staging): one-shot dormant Healer rollout"
ROOT = Path(__file__).resolve().parents[2]
STATE = Path(os.environ.get("RUNNER_TEMP", "/tmp")) / "archelaos-dormant-healer-baseline.json"


def require(ok, label):
    if not ok:
        raise RuntimeError("RELEASE_GUARD_" + label)


def api(method, suffix, payload=None):
    token = os.getenv("CLOUDFLARE_STAGING_DEPLOY_TOKEN", "")
    require(len(token) >= 16, "TOKEN_MISSING")
    url = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers/scripts/{suffix}"
    headers = {"Authorization": "Bearer " + token, "Accept": "application/json"}
    if payload is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(
        url, method=method, headers=headers,
        data=json.dumps(payload).encode() if payload is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=18) as res:
            require(res.status == 200, "HTTP_STATUS")
            raw = res.read(262145)
            require(len(raw) <= 262144, "RESPONSE_TOO_BIG")
            body = json.loads(raw)
            require(body.get("success") is True, "PROVIDER_REJECTED")
            return body.get("result")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"RELEASE_GUARD_HTTP_{e.code}") from None
    except (urllib.error.URLError, TimeoutError):
        raise RuntimeError("RELEASE_GUARD_PROVIDER_TRANSPORT") from None


def inspect(name):
    settings = api("GET", name + "/settings")
    deployments = api("GET", name + "/deployments?per_page=1")
    schedules = api("GET", name + "/schedules")
    if isinstance(deployments, dict):
        deployments = deployments.get("deployments", [])
    require(isinstance(deployments, list) and len(deployments) >= 1, "DEPLOYMENT_ABSENT")
    require(isinstance(settings, dict), "SETTINGS_ABSENT")
    bindings = settings.get("bindings", [])
    require(isinstance(bindings, list), "BINDING_SCHEMA")
    by_name = {b["name"]: b for b in bindings if isinstance(b, dict) and isinstance(b.get("name"), str)}
    require(len(by_name) == len(bindings), "DUPLICATE_OR_MALFORMED_BINDING")
    crons = schedules.get("schedules", []) if isinstance(schedules, dict) else schedules
    require(crons == [], "UNEXPECTED_CRON")
    latest = deployments[0]
    versions = latest.get("versions", [])
    require(len(versions) == 1 and versions[0].get("percentage", 100) == 100,
            "TRAFFIC_NOT_SINGLE_VERSION")
    version = versions[0].get("version_id")
    require(isinstance(version, str) and len(version) >= 32, "INVALID_VERSION")
    return by_name, version


def literal_false(bindings, name):
    b = bindings.get(name, {})
    return b.get("type") == "plain_text" and b.get("text", b.get("value")) == "false"


def verify_brain():
    b, version = inspect(BRAIN)
    require(version == BRAIN_VERSION, "BRAIN_DRIFT")
    for name in ("BRAIN_SELFHEAL_BINDING_ATTESTED", "BRAIN_SELFHEAL_DISPATCH_ENABLED",
                 "BRAIN_SELFHEAL_DURABLE_ACK_ENABLED", "BRAIN_SELFHEAL_RECOVERY_ENABLED"):
        require(literal_false(b, name), "BRAIN_FLAG_ON")
    require(str(b.get("STAGING_EXPIRES_AT", {}).get("text", "")).startswith("1970-01-01"),
            "BRAIN_EXPIRY_NOT_OFF")
    require(b.get("BRAIN", {}).get("type") == "durable_object_namespace", "BRAIN_DO_MISSING")
    require(b.get("HEALER", {}).get("service") == HEALER, "BRAIN_PEER_DRIFT")


def config_guard():
    config = tomllib.loads((ROOT / "automation/self-heal-worker/wrangler.toml").read_text())
    require(config.get("name") == HEALER and config.get("workers_dev") is False,
            "UNSAFE_WORKER_CONFIG")
    require(config.get("preview_urls") is False and not config.get("routes")
            and not config.get("triggers", {}).get("crons"), "PUBLIC_OR_SCHEDULED")
    v = config.get("vars", {})
    require(v.get("HEALER_DURABLE_ACK_ENABLED") == "false" and
            v.get("PRIVATE_HMAC_ACCEPTANCE_ISOLATED") == "false", "QA_PERMIT_ACTIVE")
    require(v.get("PRIVATE_HMAC_ACCEPTANCE_EXPIRES_AT") == "1970-01-01T00:00:00Z",
            "QA_PERMIT_NOT_EXPIRED")
    services = config.get("services")
    require(services == [{"binding": "BRAIN_RECOVERY", "service": BRAIN,
                          "entrypoint": "BrainRecoveryPort"}], "WRONG_RECOVERY_PEER")
    do = config.get("durable_objects", {}).get("bindings", [])
    require(do == [{"name": "HEALER_MEMORY", "class_name": "HealerMemory"},
                   {"name": "HMAC_NONCES", "class_name": "PrivateHmacNonceStore"}],
            "DO_BINDING_DRIFT")
    require(config.get("migrations", [])[1] == {
        "tag": "healer-private-hmac-qa-v1",
        "new_sqlite_classes": ["PrivateHmacNonceStore"]}, "MIGRATION_DRIFT")


def source_guard():
    require(os.getenv("GITHUB_ACTIONS") == "true" and
            os.getenv("GITHUB_REPOSITORY") == "dizigs/archelaos-site" and
            os.getenv("GITHUB_EVENT_NAME") == "pull_request", "UNAUTHORIZED_CONTEXT")
    sha = os.getenv("EXPECTED_SHA", "")
    require(len(sha) == 40, "SHA_ABSENT")
    def git(*args):
        return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()
    require(git("rev-parse", "HEAD") == sha and
            git("log", "-1", "--format=%s") == SUBJECT, "ONE_SHOT_SHA_GATE")
    diff = subprocess.run(["git", "diff", "--quiet", PINNED_MAIN, sha, "--",
                           "brain/src", "brain/wrangler.toml",
                           "automation/self-heal-worker"],
                          cwd=ROOT, check=False)
    require(diff.returncode == 0, "APPLICATION_SOURCE_DRIFT")
    config_guard()


def preflight():
    source_guard()
    verify_brain()
    b, version = inspect(HEALER)
    require(version == HEALER_VERSION, "HEALER_DRIFT")
    require(set(b) == {"BRAIN_RECOVERY", "HEALER_DURABLE_ACK_ENABLED",
                       "HEALER_EVENT_HMAC_KEY", "HEALER_MEMORY"},
            "UNREVIEWED_BASELINE_BINDING")
    require(literal_false(b, "HEALER_DURABLE_ACK_ENABLED"), "HEALER_ACK_ON")
    require(b["HEALER_EVENT_HMAC_KEY"].get("type") == "secret_text", "HMAC_SECRET_MISSING")
    require(b["BRAIN_RECOVERY"].get("service") == BRAIN and
            b["BRAIN_RECOVERY"].get("entrypoint") == "BrainRecoveryPort",
            "HEALER_RECOVERY_PEER_DRIFT")
    memory = b["HEALER_MEMORY"]
    require(memory.get("type") == "durable_object_namespace" and
            memory.get("class_name") == "HealerMemory" and
            memory.get("namespace_id"), "HEALER_CANONICAL_DO_MISSING")
    STATE.write_text(json.dumps({"oldVersion": version, "canonicalDoId": memory["namespace_id"]}))
    STATE.chmod(0o600)
    print("DORMANT_HEALER_PREDEPLOY_PASS old_version_pinned=true flags_off=true")


def postflight():
    verify_brain()
    require(STATE.is_file(), "BASELINE_NOT_FOUND")
    state = json.loads(STATE.read_text())
    b, version = inspect(HEALER)
    require(version != state["oldVersion"], "NO_NEW_VERSION")
    require(literal_false(b, "HEALER_DURABLE_ACK_ENABLED"), "HEALER_ACK_ON")
    require(literal_false(b, "PRIVATE_HMAC_ACCEPTANCE_ISOLATED"), "HEALER_QA_PERMIT_ON")
    require(b.get("HEALER_EVENT_HMAC_KEY", {}).get("type") == "secret_text",
            "HMAC_SECRET_DROPPED")
    require(b.get("BRAIN_RECOVERY", {}).get("service") == BRAIN and
            b["BRAIN_RECOVERY"].get("entrypoint") == "BrainRecoveryPort",
            "RECOVERY_PEER_CHANGED")
    memory, qa = b.get("HEALER_MEMORY", {}), b.get("HMAC_NONCES", {})
    require(memory.get("namespace_id") == state["canonicalDoId"], "CANONICAL_DO_CHANGED")
    require(memory.get("class_name") == "HealerMemory", "CANONICAL_DO_CLASS_CHANGED")
    require(qa.get("type") == "durable_object_namespace" and
            qa.get("class_name") == "PrivateHmacNonceStore" and
            qa.get("namespace_id") not in (None, state["canonicalDoId"]),
            "QA_DO_NOT_ISOLATED")
    print("DORMANT_HEALER_DEPLOY_AND_READBACK_PASS live_ack=false live_recovery=false canonical_do_preserved=true")


def rollback():
    require(STATE.is_file(), "NO_BASELINE_FOR_ROLLBACK")
    state = json.loads(STATE.read_text())
    require(state["oldVersion"] == HEALER_VERSION, "ROLLBACK_BASELINE_UNEXPECTED")
    api("POST", HEALER + "/deployments", {
        "strategy": "percentage",
        "versions": [{"version_id": state["oldVersion"], "percentage": 100}],
        "annotations": {"workers/message": "Healer dormant rollout rollback; operational flags OFF"}})
    b, version = inspect(HEALER)
    require(version == HEALER_VERSION and literal_false(b, "HEALER_DURABLE_ACK_ENABLED"),
            "ROLLBACK_NOT_VERIFIED")
    require(b.get("HEALER_MEMORY", {}).get("namespace_id") == state["canonicalDoId"],
            "ROLLBACK_DO_CHANGED")
    print("DORMANT_HEALER_ROLLBACK_READBACK_PASS (isolated DO migration not reversed)")


if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else None
    try:
        {"preflight": preflight, "postflight": postflight,
         "rollback": rollback}[action]()
    except (RuntimeError, KeyError, IndexError, ValueError, OSError) as exc:
        # Ensure only bounded guard codes, not provider bodies or secrets, are printed.
        message = str(exc)
        if not message.startswith("RELEASE_GUARD_"):
            message = "RELEASE_GUARD_INTERNAL_ERROR"
        print("DORMANT_HEALER_BLOCKED " + message, flush=True)
        sys.exit(1)
