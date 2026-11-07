"""Independent clean-up job for a single bounded real parent ACK probe; no new deployments."""
import json
import os
import re
import sys
import urllib.request
import urllib.error

ACCOUNT="898359728b3dfe8c3a3f56e3d19eecd1"
BASE={
 "archelaos-brain-staging":"f6f360fc-c232-48a3-8370-df0fa6fe20b4",
 "archelaos-self-heal":"6db84d24-2d42-404a-bae8-f01a4db2c6fc",
}
SOURCE="89b7c3bf92b3148cd480133e72c747e8235ddfa2"
def deny(tag):
    print("ACK_RECOVERY: BLOCKED_"+tag,flush=True)
    raise SystemExit(1)
def api(method,name,suffix,body=None):
    if name not in BASE:deny("WORKER_SCOPE")
    token=os.getenv("CLOUDFLARE_API_TOKEN")
    if not token:deny("TOKEN_MISSING")
    url=f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers/scripts/{name}/{suffix}"
    headers={"Authorization":"Bearer "+token,"Accept":"application/json"}
    if body is not None:headers["Content-Type"]="application/json"
    req=urllib.request.Request(url,method=method,headers=headers,
                               data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req,timeout=18) as response:
            data=response.read(262145)
            if len(data)>262144:deny("OVERSIZED")
            payload=json.loads(data)
            if not payload.get("success"):deny("PROVIDER_RESPONSE")
            return payload["result"]
    except (OSError,ValueError,TimeoutError):deny("API_UNAVAILABLE")
def active(name):
    payload=api("GET",name,"deployments")
    deployments=payload if isinstance(payload,list) else payload.get("deployments",[])
    if not deployments or len(deployments[0].get("versions",[]))!=1:deny("SPLIT_OR_NO_ACTIVE_"+name)
    item=deployments[0]["versions"][0]
    if item.get("percentage")!=100:deny("NOT_100_PERCENT_"+name)
    version=item.get("version_id","")
    if not re.fullmatch(r"[0-9a-f-]{36}",version):deny("BAD_VERSION")
    settings=api("GET",name,"versions/"+version)
    bindings=settings.get("resources",{}).get("bindings",[])
    b={v.get("name"):v for v in bindings if isinstance(v,dict)}
    def text(k):return b.get(k,{}).get("text")
    return version,text
def main():
    if os.getenv("GITHUB_ACTIONS")!="true" or os.getenv("GITHUB_REPOSITORY")!="dizigs/archelaos-site" or not os.getenv("ACK_TEST_PR","").isdigit():
        deny("OPERATOR_CONTEXT")
    for name in BASE:
        version,val=active(name)
        if version==BASE[name]:
            if val("DEPLOY_SHA")!="0"*40:deny("BASELINE_SHA_UNSAFE_"+name)
            if name=="archelaos-brain-staging" and (val("BRAIN_SELFHEAL_DURABLE_ACK_ENABLED")!="false" or val("BRAIN_SELFHEAL_DISPATCH_ENABLED")!="false"):deny("BASELINE_BRAIN_UNSAFE")
            if name=="archelaos-self-heal" and val("HEALER_DURABLE_ACK_ENABLED")!="false":deny("BASELINE_HEALER_UNSAFE")
            print("ACK_RECOVERY: BASELINE_ALREADY_"+name,flush=True)
            continue
        if val("DEPLOY_SHA")!=SOURCE or val("PRIVATE_HMAC_ACCEPTANCE_APPROVED_SHA")!=SOURCE or val("PRIVATE_HMAC_ACCEPTANCE_ISOLATED")!="true":
            deny("UNRECOGNIZED_LIVE_VERSION_"+name)
        if name=="archelaos-brain-staging" and (val("BRAIN_SELFHEAL_DURABLE_ACK_ENABLED")!="true" or val("BRAIN_SELFHEAL_DISPATCH_ENABLED")!="true" or val("BRAIN_SELFHEAL_RECOVERY_ENABLED")!="true"):deny("UNEXPECTED_BRAIN_PERMIT")
        if name=="archelaos-self-heal" and val("HEALER_DURABLE_ACK_ENABLED")!="true":deny("UNEXPECTED_HEALER_PERMIT")
        api("POST",name,"deployments",{
          "strategy":"percentage",
          "versions":[{"version_id":BASE[name],"percentage":100}],
          "annotations":{"workers/message":"ACK one-shot timed permit revoked; no repair"}
        })
        back,settings=active(name)
        if back!=BASE[name] or settings("DEPLOY_SHA")!="0"*40:deny("ROLLBACK_UNVERIFIED_"+name)
        print("ACK_RECOVERY: ROLLBACK_VERIFIED_"+name,flush=True)
    print("ACK_RECOVERY: BOTH_BASELINES_VERIFIED",flush=True)
if __name__=="__main__":
    try:main()
    except Exception:
        deny("UNEXPECTED")
