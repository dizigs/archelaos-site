"""One-shot parent Worker private HMAC proof; operational flags remain OFF."""
import datetime as dt
import importlib.util
import json
import os
import subprocess
import sys
import tomllib
import urllib.error
import urllib.request
import uuid
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
ACCOUNT="898359728b3dfe8c3a3f56e3d19eecd1"
SOURCE="89b7c3bf92b3148cd480133e72c747e8235ddfa2"
BRAIN="archelaos-brain-staging"
HEALER="archelaos-self-heal"
BASE={BRAIN:"f6f360fc-c232-48a3-8370-df0fa6fe20b4",HEALER:"6db84d24-2d42-404a-bae8-f01a4db2c6fc"}
PATHS={BRAIN:"brain/wrangler.toml",HEALER:"automation/self-heal-worker/wrangler.toml"}
OFF=("BRAIN_SELFHEAL_BINDING_ATTESTED","BRAIN_SELFHEAL_DISPATCH_ENABLED",
     "BRAIN_SELFHEAL_RECOVERY_ENABLED","BRAIN_SELFHEAL_DURABLE_ACK_ENABLED")
STATE=Path(os.environ.get("RUNNER_TEMP","/tmp"))/"archelaos-parent-hmac-once-state.json"
SUBJECT="qa(live): one-shot bounded parent HMAC"
WRANGLER=str(ROOT/"brain/node_modules/.bin/wrangler")
temps=[]

class NoGo(Exception): pass

def deny(why): raise NoGo("PARENT_HMAC_"+why)
def emit(text): print("PARENT_HMAC: "+text,flush=True)
def git(*args): return subprocess.check_output(["git",*args],cwd=ROOT,text=True,timeout=12).strip()
def scalar(b,k):
    x=b.get(k,{})
    return x.get("text",x.get("value")) if x.get("type")=="plain_text" else None

def guard_config():
    for name,path in PATHS.items():
        c=tomllib.loads((ROOT/path).read_text())
        if (c.get("name")!=name or c.get("workers_dev") is not False or
            c.get("preview_urls") is not False or c.get("routes") or c.get("triggers") or
            c.get("vars",{}).get("PRIVATE_HMAC_ACCEPTANCE_ISOLATED")!="false" or
            c["vars"].get("DEPLOY_SHA")!="0"*40):
            deny("TRACKED_SOURCE_NOT_DORMANT")
        if name==BRAIN and (any(c["vars"].get(f)!="false" for f in OFF) or
                            c["vars"].get("STAGING_EXPIRES_AT")!="1970-01-01T00:00:00Z"):
            deny("SOURCE_RECOVERY_NOT_OFF")
        if name==HEALER and c["vars"].get("HEALER_DURABLE_ACK_ENABLED")!="false":
            deny("SOURCE_HEALER_NOT_OFF")

def guard_context():
    if (os.getenv("GITHUB_ACTIONS")!="true" or os.getenv("GITHUB_REPOSITORY")!="dizigs/archelaos-site" or
        os.getenv("GITHUB_EVENT_NAME")!="pull_request" or os.getenv("OPERATOR_PR")!="299" or
        git("rev-parse","HEAD")!=os.getenv("EXPECTED_SHA") or
        git("log","-1","--format=%s")!=SUBJECT or
        not os.getenv("CLOUDFLARE_API_TOKEN")):
        deny("OPERATOR_CONTEXT")
    for path in ("brain/src/worker.mjs","brain/src/private_hmac_candidate.mjs",
                 "brain/src/private_hmac_protocol.mjs",
                 "automation/self-heal-worker/src/worker.mjs",*PATHS.values()):
        if subprocess.run(["git","diff","--quiet",SOURCE,"--",path],cwd=ROOT,timeout=15).returncode:
            deny("SOURCE_PROVENANCE_DRIFT")
    guard_config()

def api(method,name,resource,payload=None):
    if name not in BASE or resource not in ("settings","schedules","deployments"):
        deny("API_RESOURCE_SCOPE")
    uri="https://api.cloudflare.com/client/v4/accounts/"+ACCOUNT+"/workers/scripts/"+name+"/"+resource
    if resource=="deployments" and method=="GET":uri+="?per_page=2"
    headers={"Authorization":"Bearer "+os.environ["CLOUDFLARE_API_TOKEN"],"Accept":"application/json"}
    if payload is not None:headers["Content-Type"]="application/json"
    req=urllib.request.Request(uri,method=method,headers=headers,
        data=json.dumps(payload).encode() if payload is not None else None)
    try:
        with urllib.request.urlopen(req,timeout=18) as r:
            if r.status not in (200,201):deny("API_RESPONSE")
            raw=r.read(262145)
            if len(raw)>262144:deny("API_OVERSIZED")
            body=json.loads(raw)
            if body.get("success") is not True:deny("API_RESULT_NOT_SUCCESS")
            return body["result"]
    except urllib.error.HTTPError as e:deny("API_HTTP_"+str(e.code))
    except (urllib.error.URLError,TimeoutError):deny("API_TIMEOUT")

def inspect(name):
    settings=api("GET",name,"settings")
    deployments=api("GET",name,"deployments")
    schedule=api("GET",name,"schedules")
    bindings=settings.get("bindings",[])
    b={v["name"]:v for v in bindings if isinstance(v,dict) and isinstance(v.get("name"),str)}
    d=deployments if isinstance(deployments,list) else deployments.get("deployments",[])
    cron=schedule.get("schedules",[]) if isinstance(schedule,dict) else schedule
    if (len(b)!=len(bindings) or not d or len(d[0].get("versions",[]))!=1 or
        d[0]["versions"][0].get("percentage",100)!=100 or cron!=[]):deny("REMOTE_METADATA_DRIFT")
    return b,d[0]["versions"][0]["version_id"]

def audit(name,b,old):
    for flag in (OFF if name==BRAIN else ("HEALER_DURABLE_ACK_ENABLED",)):
        if scalar(b,flag)!="false":deny("OPERATIONAL_FLAG_ON")
    if name==BRAIN and scalar(b,"STAGING_EXPIRES_AT")!="1970-01-01T00:00:00Z":
        deny("BRAIN_STAGING_NOT_OFF")
    if b.get("HEALER_EVENT_HMAC_KEY",{}).get("type")!="secret_text":
        deny("HMAC_SECRET_MISSING")
    for k,info in old.items():
        if k not in b or b[k].get("type")!=info["type"]:deny("BINDING_REMOVED")
        if info.get("namespace_id") and b[k].get("namespace_id")!=info["namespace_id"]:
            deny("DURABLE_NAMESPACE_DRIFT")
    namespace=b.get("HMAC_NONCES",{}).get("namespace_id")
    canonical=b.get("BRAIN" if name==BRAIN else "HEALER_MEMORY",{}).get("namespace_id")
    if not namespace or not canonical or namespace==canonical:deny("QA_DO_ALIASED")
    if name==BRAIN and (b.get("HMAC_PEER",{}).get("service")!=HEALER or
        b["HMAC_PEER"].get("entrypoint")!="HealerHmacAcceptancePort"):
        deny("PRIVATE_HMAC_SERVICE_DRIFT")

def snapshot():
    state={}
    for name in (HEALER,BRAIN):
        b,v=inspect(name)
        if (v!=BASE[name] or scalar(b,"DEPLOY_SHA")!="0"*40 or
            scalar(b,"PRIVATE_HMAC_ACCEPTANCE_APPROVED_SHA")!="0"*40 or
            scalar(b,"PRIVATE_HMAC_ACCEPTANCE_ISOLATED")!="false"):
            deny("BASELINE_NOT_PINNED")
        old={k:{"type":info.get("type"),"namespace_id":info.get("namespace_id")}
             for k,info in b.items()}
        audit(name,b,old)
        state[name]={"version":v,"bindings":old,"attempted":False,"new_version":None}
    if state[HEALER]["bindings"]["HMAC_NONCES"]["namespace_id"]==state[BRAIN]["bindings"]["HMAC_NONCES"]["namespace_id"]:
        deny("CROSS_WORKER_NONCE_ALIAS")
    save(state)
    emit("PINNED_BASELINE_PASS")
    return state

def save(s):
    STATE.write_text(json.dumps(s))
    STATE.chmod(0o600)

def permit(text,session,start,end):
    edits=(("DEPLOY_SHA","0"*40,SOURCE),
           ("PRIVATE_HMAC_ACCEPTANCE_APPROVED_SHA","0"*40,SOURCE),
           ("PRIVATE_HMAC_ACCEPTANCE_ISOLATED","false","true"),
           ("PRIVATE_HMAC_ACCEPTANCE_SESSION","",session),
           ("PRIVATE_HMAC_ACCEPTANCE_STARTED_AT","1970-01-01T00:00:00Z",start),
           ("PRIVATE_HMAC_ACCEPTANCE_EXPIRES_AT","1970-01-01T00:00:00Z",end))
    for key,old,new in edits:
        left=key+' = "'+old+'"'
        if text.count(left)!=1:deny("CONFIG_TOKEN_DRIFT")
        text=text.replace(left,key+' = "'+new+'"')
    return text

def deploy(name,state,session,start,end):
    p=ROOT/PATHS[name]
    out=p.parent/("wrangler."+name+".hmac-once.toml")
    if out.exists():deny("PREEXISTING_TEMP_CONFIG")
    temps.append(out)
    out.write_text(permit(p.read_text(),session,start,end))
    state[name]["attempted"]=True
    save(state)
    result=subprocess.run([WRANGLER,"deploy","--config",str(out),"--keep-vars"],
                          cwd=ROOT,capture_output=True,text=True,timeout=90)
    if result.returncode:deny("TEMPORARY_CONFIG_DEPLOY_FAILED")
    b,version=inspect(name)
    if version==BASE[name]:deny("PROVIDER_VERSION_NOT_CHANGED")
    state[name]["new_version"]=version
    save(state)
    audit(name,b,state[name]["bindings"])
    if (scalar(b,"DEPLOY_SHA")!=SOURCE or
        scalar(b,"PRIVATE_HMAC_ACCEPTANCE_APPROVED_SHA")!=SOURCE or
        scalar(b,"PRIVATE_HMAC_ACCEPTANCE_ISOLATED")!="true" or
        scalar(b,"PRIVATE_HMAC_ACCEPTANCE_SESSION")!=session):
        deny("TIMED_PERMIT_READBACK_FAILED")
    emit("TIMED_PERMIT_"+("BRAIN" if name==BRAIN else "HEALER")+"_PASS")

def restore(state):
    ok=True
    for name in (BRAIN,HEALER):
        try:
            b,v=inspect(name)
            item=state[name]
            if v!=item["version"]:
                if v!=item["new_version"] or not item["attempted"]:
                    deny("UNRECOGNIZED_VERSION_REQUIRES_MANUAL_REVIEW")
                api("POST",name,"deployments",{
                    "strategy":"percentage",
                    "versions":[{"version_id":item["version"],"percentage":100}],
                    "annotations":{"workers/message":"Bounded HMAC permit revoked; no live repair"}})
                b,v=inspect(name)
            if (v!=item["version"] or scalar(b,"PRIVATE_HMAC_ACCEPTANCE_ISOLATED")!="false" or
                scalar(b,"DEPLOY_SHA")!="0"*40):
                deny("ROLLBACK_READBACK_FAILED")
            audit(name,b,item["bindings"])
            emit("ROLLBACK_"+("BRAIN" if name==BRAIN else "HEALER")+"_PASS")
        except Exception:
            ok=False
            emit("ROLLBACK_"+("BRAIN" if name==BRAIN else "HEALER")+"_BLOCKED")
    return ok

def probe(session):
    spec=importlib.util.spec_from_file_location("private_hmac_existing",
        ROOT/"brain/qa/cloudflare_isolated_acceptance.py")
    qa=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(qa)
    qa.B=BRAIN
    qa.call(SOURCE,session)

def run():
    guard_context()
    s=snapshot()
    successful=False
    try:
        start=dt.datetime.now(dt.timezone.utc)-dt.timedelta(seconds=2)
        end=start+dt.timedelta(seconds=232)
        ts=lambda x:x.strftime("%Y-%m-%dT%H:%M:%SZ")
        session=str(uuid.uuid4())
        deploy(HEALER,s,session,ts(start),ts(end))
        deploy(BRAIN,s,session,ts(start),ts(end))
        if dt.datetime.now(dt.timezone.utc)>=end-dt.timedelta(seconds=15):
            deny("TIMED_PERMIT_EXPIRED_BEFORE_PROBE")
        probe(session)
        successful=True
        emit("LIVE_PARENT_HMAC_PASS actionsExecuted=0")
    finally:
        clean=restore(s)
        for p in temps:p.unlink(missing_ok=True)
        if not clean:
            emit("MANUAL_PROVIDER_RECONCILIATION_REQUIRED")
            deny("ROLLBACK_INCOMPLETE")
    if not successful:deny("LIVE_PROBE_NOT_AUTHENTICATED")
    emit("OVERALL_PASS_PARENT_HMAC_BASELINES_RESTORED")

def recover():
    guard_context()
    if not STATE.exists():
        emit("NO_ROLLBACK_STATE")
    elif not restore(json.loads(STATE.read_text())):
        deny("RECOVER_BLOCKED")

if __name__=="__main__":
    try:
        if len(sys.argv)!=2 or sys.argv[1] not in ("config","run","recover"):
            deny("BAD_CLI_ACTION")
        if sys.argv[1]=="config":
            guard_config()
            emit("SOURCE_CONFIG_GUARD_PASS")
        elif sys.argv[1]=="run":run()
        else:recover()
    except (NoGo,OSError,ValueError,subprocess.TimeoutExpired,subprocess.CalledProcessError):
        emit("OVERALL_BLOCKED_NO_REPAIR")
        sys.exit(1)
