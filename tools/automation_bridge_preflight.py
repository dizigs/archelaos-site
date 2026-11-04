#!/usr/bin/env python3
"""Read-only control-plane evidence for the existing automation bridge.

Never sends email, reads Google content, rotates secrets, runs Apps Script,
creates triggers, deploys Workers or claims end-to-end integration from metadata.
"""
from __future__ import annotations

import os
import re
import sys

from cloudflare_pages_status import ACCOUNT, API, PROJECT, TOKEN, ProviderFailure, api

WORKER = "archelaos-automation-bridge"
REQUIRED_SECRETS = ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "OAUTH_STATE_SECRET", "BRIDGE_API_KEY")
SENSITIVE_BINDINGS = ("GOOGLE_CLIENT_SECRET", "OAUTH_STATE_SECRET", "BRIDGE_API_KEY")
LAYERS = {"provider_http", "proxy_http", "provider_application", "transport_connect",
          "transport_unavailable", "UNKNOWN"}


def network_denial(observation):
    return (observation.get("responseLayer") == "transport_connect"
            or (observation.get("responseLayer") == "proxy_http"
                and observation.get("httpStatus") == 403 and not observation.get("errorCodes")))


def probe(request, path):
    """One attempt; expose only fixed endpoint, status, numeric codes and layer."""
    endpoint = "GET " + API + path
    try:
        return {"status": "OBSERVED", "endpoint": endpoint, "httpStatus": 200}, request(path)
    except ProviderFailure as error:
        evidence = error.evidence
        status = evidence.get("httpStatus")
        layer = evidence.get("responseLayer")
        return {"status": "BLOCKED", "endpoint": endpoint,
                "httpStatus": status if isinstance(status, int) and 100 <= status <= 599 else None,
                "errorCodes": [str(c) for c in evidence.get("errorCodes", [])
                               if re.fullmatch(r"[0-9]{1,12}", str(c))][:8],
                "responseLayer": layer if layer in LAYERS else "UNKNOWN"}, None
    except (OSError, ValueError) as error:
        return {"status": "BLOCKED", "endpoint": endpoint,
                "reason": "transport_or_validation_unavailable", "errorClass": type(error).__name__}, None


def inspect_bridge(request=api, *, account=ACCOUNT, project=PROJECT, token_present=bool(TOKEN)):
    report = {
        "schemaVersion": 1, "worker": WORKER, "status": "BLOCKED",
        "fullIntegrationVerified": False, "productionMutationPerformed": False,
        "workerSecretValuesDisclosed": False, "privateGoogleDataRead": False,
        "sourceCodeInspected": False, "tokenPolicyInspected": False, "probes": {},
        "notVerified": ["current public health", "HMAC and signature expiry",
                        "concurrent replay/action idempotency", "Google OAuth scopes and approval",
                        "Apps Script execution and existing trigger", "Gmail/Drive/Sheets flow",
                        "KV namespace identity and data access", "Worker-to-GitHub handoff", "Worker deployment logs"],
    }
    if not token_present:
        return {**report, "reason": "missing_runtime_cloudflare_credential"}
    if (not re.fullmatch(r"[0-9a-f]{32}", account)
            or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,57}", project)):
        return {**report, "reason": "invalid_provider_identifiers"}

    control_path = "/accounts/" + account + "/pages/projects/" + project + "/deployments?per_page=1"
    control, result = probe(request, control_path)
    if control["status"] == "OBSERVED" and (not isinstance(result, list) or len(result) > 1
                                            or any(not isinstance(row, dict) for row in result)):
        control.update(status="BLOCKED", reason="unexpected_control_schema")
    report["probes"]["pagesCredentialControl"] = control
    worker_path = "/accounts/" + account + "/workers/scripts/" + WORKER + "/settings"
    if network_denial(control):
        report["probes"]["workerSettings"] = {
            "status": "NOT_ATTEMPTED", "endpoint": "GET " + API + worker_path,
            "reason": "same_host_transport_denial_no_unchanged_retry"}
        return {**report, "reason": "network_transport_denied"}

    worker, settings = probe(request, worker_path)
    report["probes"]["workerSettings"] = worker
    if worker["status"] != "OBSERVED":
        if network_denial(worker):
            return {**report, "reason": "network_transport_denied"}
        origin_response = (worker.get("responseLayer") in ("provider_http", "provider_application")
                           or worker.get("errorCodes"))
        if worker.get("httpStatus") == 401 and origin_response:
            reason = "worker_authentication_rejected"
        elif control["status"] == "OBSERVED" and worker.get("httpStatus") == 403 and origin_response:
            reason = "worker_permission_or_resource_scope_denied"
        else:
            reason = "worker_access_not_verified"
        return {**report, "reason": reason}
    if not isinstance(settings, dict) or not isinstance(settings.get("bindings"), list):
        worker.update(status="BLOCKED", reason="unexpected_settings_schema")
        return {**report, "reason": "invalid_worker_metadata"}
    bindings = settings["bindings"]
    if any(not isinstance(binding, dict) for binding in bindings):
        return {**report, "reason": "invalid_binding_metadata"}
    observed = {name: any(b.get("name") == name and b.get("type") in ("secret_text", "plain_text") for b in bindings)
                for name in REQUIRED_SECRETS}
    protected = {name: any(b.get("name") == name and b.get("type") == "secret_text" for b in bindings)
                 for name in SENSITIVE_BINDINGS}
    kv = [b for b in bindings if b.get("name") == "AUTH_KV" and b.get("type") == "kv_namespace"]
    kv_configured = len(kv) == 1 and isinstance(kv[0].get("namespace_id"), str) and bool(
        re.fullmatch(r"[0-9a-f]{32}", kv[0]["namespace_id"]))
    report["configuration"] = {
        "requiredBindingsObserved": observed,
        "sensitiveBindingsStoredAsSecrets": protected,
        "authKvBindingConfigured": kv_configured,
        "atomicStorageBindingObserved": any(b.get("type") in ("durable_object_namespace", "d1") for b in bindings),
        "atomicActionExecutionVerified": False,
        "knownGitHubCredentialBindingObserved": any(b.get("name") in (
            "GITHUB_TOKEN", "GH_TOKEN", "GITHUB_APP_ID", "GITHUB_PRIVATE_KEY", "GITHUB_INSTALLATION_ID") for b in bindings),
        "note": "Names/types only. KV presence or a durable binding does not prove correct atomic use. No secret values, KV keys or OAuth tokens are read.",
    }
    if control["status"] != "OBSERVED":
        return {**report, "reason": "pages_access_not_verified"}
    report["status"] = ("METADATA_OBSERVED" if all(observed.values()) and all(protected.values())
                        and kv_configured else "INCOMPLETE_CONFIGURATION")
    report["reason"] = "control_plane_only_not_end_to_end_verification"
    return report


def main():
    report = inspect_bridge()
    # Never print the provider-derived report: even filtered metadata could
    # contain a future sensitive field. Emit only a fixed status label.
    verified = report["status"] == "METADATA_OBSERVED"
    label = "METADATA_OBSERVED" if verified else "METADATA_NOT_VERIFIED"
    if os.environ.get("GITHUB_ACTIONS") == "true":
        print("::notice title=Automation bridge access evidence::" + label)
    else:
        print(label)
    return 0 if verified else 1


if __name__ == "__main__":
    sys.exit(main())
