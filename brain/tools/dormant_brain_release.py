"""Fail-closed one-shot dormant Brain staging rollout; no production recovery actions."""
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
OLD_BRAIN = "e565910f-bbb4-44f6-b0b5-3463906ce495"
READY_HEALER = "6db84d24-2d42-404a-bae8-f01a4db2c6fc"
BRAIN = "archelaos-brain-staging"
HEALER = "archelaos-self-heal"
SUBJECT = "deploy(staging): one-shot dormant Brain rollout"
ROOT = Path(__file__).resolve().parents[2]
STATE = Path(os.environ["RUNNER_TEMP"]) / "archelaos-dormant-brain-baseline.json"
BRAIN_FLAGS = ("BRAIN_SELFHEAL_BINDING_ATTESTED",
               "BRAIN_SELFHEAL_DISPATCH_ENABLED",
               "BRAIN_SELFHEAL_DURABLE_ACK_ENABLED",
               "BRAIN_SELFHEAL_RECOVERY_ENABLED")


def need(ok, code):
    if not ok:
        raise RuntimeError("BRAIN_RELEASE_" + code)


def api(method, name, resource, payload=None):
    token = os.getenv("CLOUDFLARE_STAGING_DEPLOY_TOKEN", "")
    need(len(token) >= 16, "TOKEN_ABSENT")
    url = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers/scripts/{name}/{resource}"
    headers = {"Authorization": "Bearer " + token, "Accept": "application/json"}
    if payload is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, method=method, headers=headers,
                                 data=json.dumps(payload).encode() if payload is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=18) as res:
            need(res.status == 200, "BAD_HTTP_STATUS")
            data = res.read(262145)
            need(len(data) <= 262144, "RESPONSE_TOO_LARGE")
            body = json.loads(data)
            need(body.get("success") is True, "PROVIDER_NOT_SUCCESS")
            return body.get("result")
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"BRAIN_RELEASE_HTTP_{exc.code}") from None
    except (urllib.error.URLError, TimeoutError):
        raise RuntimeError("BRAIN_RELEASE_TRANSPORT") from None


def inspect(name):
    info = api("GET", name, "settings")
    deployments = api("GET", name, "deployments?per_page=1")
    cron = api("GET", name, "schedules")
    need(isinstance(info, dict), "BINDINGS_NOT_READABLE")
    bindings = info.get("bindings", [])
    need(isinstance(bindings, list), "BINDINGS_INVALID")
    by_name = {x["name"]: x for x in bindings
               if isinstance(x, dict) and isinstance(x.get("name"), str)}
    need(len(by_name) == len(bindings), "DUPLICATE_OR_INVALID_BINDINGS")
    if isinstance(deployments, dict):
        deployments = deployments.get("deployments", [])
    need(isinstance(deployments, list) and len(deployments) > 0, "NO_DEPLOYMENT")
    latest = deployments[0]
    versions = latest.get("versions", [])
    need(len(versions) == 1 and versions[0].get("percentage", 100) == 100,
         "UNAPPROVED_SPLIT_TRAFFIC")
    version = versions[0].get("version_id")
    need(isinstance(version, str) and len(version) >= 32, "VERSION_INVALID")
    crons = cron.get("schedules", []) if isinstance(cron, dict) else cron
    need(crons == [], "ACTIVE_CRON_NOT_ALLOWED")
    return by_name, version


def false(b, name):
    obj = b.get(name, {})
    return obj.get("type") == "plain_text" and obj.get("text", obj.get("value")) == "false"


def check_healer():
    b, v = inspect(HEALER)
    need(v == READY_HEALER, "HEALER_DEPLOYMENT_DRIFT")
    need(false(b, "HEALER_DURABLE_ACK_ENABLED") and
         false(b, "PRIVATE_HMAC_ACCEPTANCE_ISOLATED"), "HEALER_NOT_OFF")
    need(b.get("HEALER_EVENT_HMAC_KEY", {}).get("type") == "secret_text",
         "HEALER_HMAC_MISSING")
    need(b.get("BRAIN_RECOVERY", {}).get("service") == BRAIN and
         b["BRAIN_RECOVERY"].get("entrypoint") == "BrainRecoveryPort",
         "HEALER_SERVICE_DRIFT")
    canonical = b.get("HEALER_MEMORY", {})
    qa = b.get("HMAC_NONCES", {})
    need(canonical.get("type") == "durable_object_namespace" and
         canonical.get("namespace_id"), "HEALER_CANONICAL_DO_MISSING")
    need(qa.get("type") == "durable_object_namespace" and
         qa.get("class_name") == "PrivateHmacNonceStore" and
         qa.get("namespace_id") not in (None, canonical["namespace_id"]),
         "HEALER_QA_DO_MISSING")
    return qa["namespace_id"]


def check_config():
    cfg = tomllib.loads((ROOT / "brain/wrangler.toml").read_text())
    need(cfg.get("name") == BRAIN and cfg.get("workers_dev") is False and
         cfg.get("preview_urls") is False and not cfg.get("routes") and
         not cfg.get("triggers", {}).get("crons"), "PUBLIC_WORKER_CONFIG")
    v = cfg.get("vars", {})
    for flag in BRAIN_FLAGS:
        need(v.get(flag) == "false", "SOURCE_BRAIN_FLAG_ACTIVE")
    need(v.get("STAGING_EXPIRES_AT") == "1970-01-01T00:00:00Z",
         "SOURCE_EXPIRES_IN_FUTURE")
    need(v.get("PRIVATE_HMAC_ACCEPTANCE_ISOLATED") == "false" and
         v.get("PRIVATE_HMAC_ACCEPTANCE_EXPIRES_AT") == "1970-01-01T00:00:00Z",
         "SOURCE_QA_PERMIT_ACTIVE")
    need(cfg.get("services") == [
        {"binding": "HEALER", "service": HEALER},
        {"binding": "HMAC_PEER", "service": HEALER,
         "entrypoint": "HealerHmacAcceptancePort"}], "SOURCE_PEER_BINDINGS")
    need(cfg.get("durable_objects", {}).get("bindings") == [
        {"name": "BRAIN", "class_name": "BrainCoordinator"},
        {"name": "HMAC_NONCES", "class_name": "PrivateHmacNonceStore"}],
         "SOURCE_DO_BINDINGS")
    need(cfg.get("migrations", [])[1] == {
        "tag": "brain-private-hmac-qa-v1",
        "new_sqlite_classes": ["PrivateHmacNonceStore"]}, "SOURCE_DO_MIGRATION")


def source_guard():
    need(os.getenv("GITHUB_ACTIONS") == "true" and
         os.getenv("GITHUB_REPOSITORY") == "dizigs/archelaos-site" and
         os.getenv("GITHUB_EVENT_NAME") == "pull_request",
         "NOT_OPERATOR_CI")
    sha = os.getenv("EXPECTED_SHA", "")
    need(len(sha) == 40, "MISSING_EXACT_SHA")
    def git(*args):
        return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()
    need(git("rev-parse", "HEAD") == sha and
         git("log", "-1", "--format=%s") == SUBJECT, "ONE_SHOT_SUBJECT_MISMATCH")
    diff = subprocess.run(["git", "diff", "--quiet", PINNED_MAIN, sha, "--",
                           "brain/src", "brain/wrangler.toml", "automation/self-heal-worker"],
                          cwd=ROOT, check=False)
    need(diff.returncode == 0, "APPLICATION_CODE_DRIFT")
    check_config()


def verify_off(b):
    for flag in BRAIN_FLAGS:
        need(false(b, flag), "LIVE_BRAIN_FLAG_ACTIVE")
    need(b.get("STAGING_EXPIRES_AT", {}).get("text") == "1970-01-01T00:00:00Z",
         "LIVE_STAGING_EXPIRY")
    need(false(b, "PRIVATE_HMAC_ACCEPTANCE_ISOLATED") if
         "PRIVATE_HMAC_ACCEPTANCE_ISOLATED" in b else True,
         "LIVE_QA_ENABLED")


def preflight():
    source_guard()
    healer_qa = check_healer()
    b, version = inspect(BRAIN)
    need(version == OLD_BRAIN, "BRAIN_BASELINE_DRIFT")
    verify_off(b)
    need(set(b) == {"AI", "BRAIN", "BRAIN_GITHUB_APP_ID",
                    "BRAIN_GITHUB_APP_INSTALLATION_ID", "BRAIN_GITHUB_APP_PRIVATE_KEY",
                    "BRAIN_SELFHEAL_BINDING_ATTESTED",
                    "BRAIN_SELFHEAL_DISPATCH_ENABLED",
                    "BRAIN_SELFHEAL_DURABLE_ACK_ENABLED",
                    "BRAIN_SELFHEAL_RECOVERY_ENABLED", "DEPLOY_SHA", "ENVIRONMENT",
                    "HEALER", "HEALER_EVENT_HMAC_KEY", "STAGING_EXPIRES_AT",
                    "STAGING_SHORT_RETRIES"}, "UNREVIEWED_BASELINE_BINDING")
    need(b["AI"].get("type") == "ai", "AI_BINDING_MISSING")
    need(b["BRAIN_GITHUB_APP_PRIVATE_KEY"].get("type") == "secret_text" and
         b["HEALER_EVENT_HMAC_KEY"].get("type") == "secret_text",
         "EXISTING_SECRET_MISSING")
    need(b["HEALER"].get("service") == HEALER, "DEFAULT_HEALER_LINK_CHANGED")
    canonical = b["BRAIN"]
    need(canonical.get("type") == "durable_object_namespace" and
         canonical.get("class_name") == "BrainCoordinator" and
         canonical.get("namespace_id"), "CANONICAL_BRAIN_DO_MISSING")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW
    fd = os.open(STATE, flags, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as private_file:
        json.dump({"oldVersion": version, "brainNamespace": canonical["namespace_id"],
                   "healerQaNamespace": healer_qa}, private_file)
    print("DORMANT_BRAIN_PREFLIGHT_PASS pinned_versions=true live_flags_off=true")


def postflight():
    healer_qa = check_healer()
    need(STATE.is_file(), "BASELINE_STATE_ABSENT")
    state = json.loads(STATE.read_text())
    need(state["healerQaNamespace"] == healer_qa, "HEALER_QA_NAMESPACE_CHANGED")
    b, version = inspect(BRAIN)
    need(version != state["oldVersion"], "BRAIN_VERSION_NOT_UPDATED")
    verify_off(b)
    need(b.get("AI", {}).get("type") == "ai", "AI_LOST")
    need(b.get("BRAIN_GITHUB_APP_PRIVATE_KEY", {}).get("type") == "secret_text" and
         b.get("HEALER_EVENT_HMAC_KEY", {}).get("type") == "secret_text",
         "EXISTING_SECRET_LOST")
    canonical = b.get("BRAIN", {})
    qa = b.get("HMAC_NONCES", {})
    need(canonical.get("namespace_id") == state["brainNamespace"] and
         canonical.get("class_name") == "BrainCoordinator", "CANONICAL_BRAIN_DO_CHANGED")
    need(qa.get("type") == "durable_object_namespace" and
         qa.get("class_name") == "PrivateHmacNonceStore" and
         qa.get("namespace_id") not in (None, state["brainNamespace"], healer_qa),
         "BRAIN_QA_DO_NOT_ISOLATED")
    need(b.get("HEALER", {}).get("service") == HEALER and
         b.get("HMAC_PEER", {}).get("service") == HEALER and
         b["HMAC_PEER"].get("entrypoint") == "HealerHmacAcceptancePort",
         "NAMED_QA_LINK_WRONG")
    print("DORMANT_BRAIN_DEPLOY_AND_READBACK_PASS dispatch_off=true recovery_off=true ack_off=true")


def rollback():
    need(STATE.is_file(), "ROLLBACK_STATE_ABSENT")
    s = json.loads(STATE.read_text())
    need(s["oldVersion"] == OLD_BRAIN, "ROLLBACK_VERSION_UNEXPECTED")
    api("POST", BRAIN, "deployments", {
        "strategy": "percentage",
        "versions": [{"version_id": s["oldVersion"], "percentage": 100}],
        "annotations": {"workers/message": "Dormant Brain rollout rollback; dispatch OFF"}})
    b, v = inspect(BRAIN)
    need(v == OLD_BRAIN, "ROLLBACK_VERSION_NOT_VERIFIED")
    verify_off(b)
    need(b.get("BRAIN", {}).get("namespace_id") == s["brainNamespace"],
         "ROLLBACK_BRAIN_DO_CHANGED")
    print("DORMANT_BRAIN_ROLLBACK_VERIFIED (isolated DO migration persists)")


if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else None
    try:
        {"preflight": preflight, "postflight": postflight, "rollback": rollback}[action]()
    except (RuntimeError, KeyError, IndexError, ValueError, OSError) as exc:
        message = str(exc)
        if not message.startswith("BRAIN_RELEASE_"):
            message = "BRAIN_RELEASE_INTERNAL_ERROR"
        print("DORMANT_BRAIN_BLOCKED " + message, flush=True)
        sys.exit(1)
