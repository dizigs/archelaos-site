"""Narrow staging inventory/deployment helper; never mutates plans, DNS or main."""
import argparse
import json
import os
import re
import urllib.error
import urllib.request

SCRIPT = "archelaos-brain-staging"
BASE = "https://api.cloudflare.com/client/v4"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Cloudflare:
    def __init__(self):
        self.account = (os.environ.get("CLOUDFLARE_ACCOUNT_ID") or "898359728b3dfe8c3a3f56e3d19eecd1").strip()
        self.token = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
        if not re.fullmatch(r"[0-9a-f]{32}", self.account) or not self.token:
            raise ValueError("Existing Cloudflare account/token binding unavailable")
        self.opener = urllib.request.build_opener(NoRedirect())

    def get(self, suffix):
        if suffix not in {"workers/account-settings", "workers/subdomain", "subscriptions",
                          "workers/durable_objects/namespaces", "workers/scripts/" + SCRIPT + "/settings",
                          "pages/projects/archelaos-site"}:
            raise ValueError("Read endpoint outside compiled readiness allowlist")
        endpoint = BASE + "/accounts/" + self.account + "/" + suffix
        request = urllib.request.Request(endpoint, headers={"Authorization": "Bearer " + self.token})
        try:
            with self.opener.open(request, timeout=20) as response:
                raw = response.read(2 * 1024 * 1024 + 1)
                if len(raw) > 2 * 1024 * 1024: raise ValueError("Readiness response too large")
                data = json.loads(raw)
                return {"endpoint": endpoint, "httpStatus": response.status,
                        "success": data.get("success") is True, "result": data.get("result")}
        except urllib.error.HTTPError as error:
            # No raw response/headers/token/provider messages are published.
            codes = []
            try:
                rejected = json.loads(error.read(65536))
                for row in rejected.get("errors", []):
                    if type(row.get("code")) is int: codes.append(row["code"])
            except (ValueError, OSError):
                pass
            server = (error.headers.get("Server") or "").lower() if error.headers else ""
            layer = "provider_http" if server == "cloudflare" else "proxy_http" if server == "envoy" else "UNKNOWN"
            return {"endpoint": endpoint, "httpStatus": error.code, "success": False,
                    "errorClass": layer, "providerErrorCodes": codes[:8], "retryPerformed": False}
        except urllib.error.URLError:
            return {"endpoint": endpoint, "httpStatus": None, "success": False,
                    "errorClass": "network_transport", "retryPerformed": False}


def inventory(client):
    endpoints = ("workers/account-settings", "workers/subdomain", "subscriptions",
                 "workers/durable_objects/namespaces", "workers/scripts/" + SCRIPT + "/settings")
    evidence = []
    plan = "UNVERIFIED"
    for suffix in endpoints:
        response = client.get(suffix)
        result = response.pop("result", None)
        if suffix == "subscriptions" and response["success"] and isinstance(result, list):
            # Only plan labels: never subscription identifiers, payment data or prices.
            labels = [str((row.get("rate_plan") or {}).get("public_name", "")) for row in result]
            response["planLabels"] = labels
            if any("workers" in label.casefold() and "free" in label.casefold() for label in labels):
                plan = "WORKERS_FREE_CONFIRMED"
        if suffix == "workers/subdomain" and response["success"] and isinstance(result, dict):
            response["registeredWorkersSubdomain"] = bool(result.get("subdomain"))
        if suffix == "workers/durable_objects/namespaces" and response["success"] and isinstance(result, list):
            response["namespaceCount"] = len(result)
        if suffix == "workers/scripts/" + SCRIPT + "/settings":
            response["existingStagingScript"] = True if response["success"] else False if response.get("httpStatus") == 404 else None
        evidence.append(response)
    return {"stage": "READ_ONLY_INVENTORY", "script": SCRIPT, "billingPlan": plan,
            "evidence": evidence, "resourceMutationPerformed": False, "aiProviderCalls": 0,
            "status": "READY_FOR_REVIEW" if plan == "WORKERS_FREE_CONFIRMED" and
                      all(row["success"] for row in evidence[:-1]) else "BLOCKED",
            "deploymentVerified": False}


def staging_readiness(client):
    """A new read-only token is not a deployment token or proof of free entitlement."""
    endpoints = ("workers/account-settings", "workers/subdomain",
                 "workers/durable_objects/namespaces", "workers/scripts/" + SCRIPT + "/settings")
    evidence = []
    available = True
    network_denied = False
    for suffix in endpoints:
        if network_denied:
            evidence.append({"endpoint": BASE + "/accounts/" + client.account + "/" + suffix,
                             "success": False, "notAttempted": "same_host_network_denial"})
            available = False
            continue
        response = client.get(suffix)
        result = response.pop("result", None)
        success = response.get("success") is True
        absent = response.get("httpStatus") == 404 and response.get("errorClass") == "provider_http"
        if suffix.endswith("/settings"):
            response["existingStagingScript"] = True if success else False if absent else None
            if success:
                bindings = result.get("bindings") if isinstance(result, dict) else None
                if not isinstance(bindings, list):
                    success = False
                    response["schemaValid"] = False
                else:
                    response["brainBindingObserved"] = any(isinstance(b, dict) and b.get("name") == "BRAIN"
                        and b.get("type") == "durable_object_namespace" and b.get("class_name") == "BrainCoordinator" for b in bindings)
            available = available and (success or absent)
        else:
            valid = isinstance(result, list) if suffix.endswith("namespaces") else isinstance(result, dict)
            response["schemaValid"] = valid if success else None
            available = available and success and valid
            if success and suffix.endswith("namespaces") and valid:
                response["namespaceCount"] = len(result)
            if success and suffix.endswith("subdomain") and valid:
                response["registeredWorkersSubdomain"] = bool(result.get("subdomain"))
                available = available and response["registeredWorkersSubdomain"]
        evidence.append(response)
        network_denied = response.get("errorClass") == "network_transport" or (
            response.get("errorClass") == "proxy_http" and response.get("httpStatus") == 403)
    return {"stage": "STAGING_READ_ACCESS_ONLY", "script": SCRIPT,
            "status": "READ_ACCESS_VERIFIED" if available else "BLOCKED", "evidence": evidence,
            "readyForDeployment": False, "deploymentVerified": False, "resourceMutationPerformed": False,
            "existingBridgeTouched": False, "aiProviderCalls": 0,
            "notVerified": ["Workers Scripts Write for isolated staging", "free-plan SQLite DO entitlement",
                            "separate staging intake/operator secret provisioning", "remote deployment/version logs",
                            "runtime health, actual DO execution and synthetic HTTP proof"],
            "billingPlan": "UNVERIFIED_NO_BILLING_REQUEST", "runtimeVerified": False}


def emit(report):
    encoded = json.dumps(report, sort_keys=True, separators=(",", ":"))
    print(encoded)
    print("::notice title=Brain staging evidence::" + encoded.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--action", choices=("inventory", "pages-auth-baseline", "staging-readiness"), required=True)
    args = parser.parse_args()
    client = Cloudflare()
    if args.action == "inventory":
        emit(inventory(client))
    elif args.action == "staging-readiness":
        report = staging_readiness(client)
        emit(report)
        return 0 if report["status"] == "READ_ACCESS_VERIFIED" else 1
    else:
        result = client.get("pages/projects/archelaos-site")
        result.pop("result", None)
        emit({"stage": "PAGES_AUTH_BASELINE_ONLY", "evidence": [result],
              "resourceMutationPerformed": False, "deploymentVerified": False})


if __name__ == "__main__": raise SystemExit(main())
