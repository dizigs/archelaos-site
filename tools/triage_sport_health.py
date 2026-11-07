#!/usr/bin/env python3
"""Offline, read-only triage of *sanitized* public multisport health observations.

Input: local JSON report with observations [{sportKey,failureClass,resource,observedAt,
statusOrError,sourceRunUrl}]. Output: JSON repair suggestions. This script does not
perform network calls, writes, retries, issue creation, or deployments.
"""
import argparse
import hashlib
import json
import pathlib
from urllib.parse import urlparse

ROOT=pathlib.Path(__file__).resolve().parents[1]
CLASSES={"unreachable","http_error","broken_asset","invalid_json","stale_schedule","ci_failure","link_failure","unknown"}
KINDS={
 "unreachable":"verify_dns_tls_and_provider_logs",
 "http_error":"inspect_http_status_and_deployment_logs",
 "broken_asset":"check_exact_asset_source_and_build_output",
 "invalid_json":"validate_schema_and_provenance",
 "stale_schedule":"inspect_existing_scheduler_run_evidence",
 "ci_failure":"read_failed_job_logs_and_reproduce",
 "link_failure":"check_canonical_route_and_redirect",
 "unknown":"manual_diagnosis_only"
}

def triage(report, keys, max_items=3):
    errors=[]
    if not isinstance(report,dict) or not isinstance(report.get("observations"),list):
        return [{"error":"observations must be an array"}],[]
    seen=set()
    proposals=[]
    for row in report["observations"]:
        if not isinstance(row,dict):
            errors.append({"error":"invalid observation shape"});continue
        sport=row.get("sportKey")
        kind=row.get("failureClass")
        resource=row.get("resource")
        link=row.get("sourceRunUrl")
        observed=row.get("observedAt")
        status=row.get("statusOrError")
        if sport not in keys or kind not in CLASSES:
            errors.append({"error":"invalid sport/failure class"});continue
        # Only public site URLs or exact standard workflow names; no arbitrary local paths.
        parsed=urlparse(resource) if isinstance(resource,str) else None
        public_url=parsed and parsed.scheme=="https" and (
            parsed.hostname=="archelaos.club" or parsed.hostname==f"{sport}.archelaos.club")
        workflow=resource in ("live-health.yml","automation-health.yml")
        if not public_url and not workflow:
            errors.append({"error":"non-public or unrecognized resource"});continue
        if not isinstance(link,str) or not link.startswith("https://github.com/dizigs/archelaos-site/actions/runs/"):
            errors.append({"error":"invalid evidence link"});continue
        if not isinstance(observed,str) or len(observed)<10 or not isinstance(status,str) or not status or len(status)>120:
            errors.append({"error":"invalid observation time/status"});continue
        # No persistence: this deduplicates within a single batch. Cross-run cooldown
        # is only a policy until a persistent implementation is reviewed.
        key=(sport,kind,resource)
        if key in seen:continue
        seen.add(key)
        if len(proposals)>=max_items:continue
        identifier=hashlib.sha256("|".join(key).encode("utf-8")).hexdigest()[:12]
        proposals.append({
            "fingerprint":identifier,"sportKey":sport,"failureClass":kind,
            "resource":resource,"observedAt":observed,"sourceRunUrl":link,
            "recommendedDiagnostic":KINDS[kind],
            "action":"create_or_update_review_issue_only","productionChangeAllowed":False,
            "automaticRetryAllowed":False
        })
    return errors,proposals

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--input",required=True,type=pathlib.Path,help="sanitized report JSON")
    parser.add_argument("--output",required=True,type=pathlib.Path,help="local proposal JSON")
    args=parser.parse_args()
    registry=json.loads((ROOT/"config/sport-sites.json").read_text(encoding="utf-8"))
    data=json.loads(args.input.read_text(encoding="utf-8"))
    errors,proposals=triage(data,{x["key"] for x in registry["departments"]})
    output={"schemaVersion":1,"status":"invalid_input" if errors else "suggestions_only",
            "errors":errors,"suggestions":proposals,"externalWritesPerformed":False,
            "note":"No active issue integration, cross-run cooldown, DNS, Cloudflare or release actions."}
    args.output.write_text(json.dumps(output,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    if errors:raise SystemExit("Input rejected; see sanitized local report")
    print(f"PASS: {len(proposals)} safe offline suggestions; no external writes")
if __name__=="__main__":main()
