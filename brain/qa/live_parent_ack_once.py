"""One-shot parent Worker private HMAC proof; operational flags remain OFF."""
import datetime as dt
import hashlib
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
STATE=Path(os.environ["RUNNER_TEMP"])/"archelaos-parent-ack-once-state.json"
SUBJECT="qa(live): one-shot canonical durable ACK"
WRANGLER=str(ROOT/"brain/node_modules/.bin/wrangler")
temps=[]

class NoGo(Exception): pass

def deny(why): raise NoGo("PARENT_ACK_"+why)
def emit(text): print("PARENT_ACK: "+text,flush=True)
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
        os.getenv("GITHUB_EVENT_NAME")!="pull_request" or os.getenv("OPERATOR_PR")!=os.getenv("ACK_TEST_PR") or
        not os.getenv("ACK_TEST_PR","").isdigit() or
        os.getenv("GITHUB_HEAD_REF")!="qa/live-canonical-ack-20261107" or
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
    version_read=resource.startswith("versions/")
    if version_read:
        target=resource[len("versions/"):]
        try:
            valid=str(uuid.UUID(target))==target
        except ValueError:
            valid=False
        if method!="GET" or not valid:deny("API_VERSION_SCOPE")
    elif resource not in ("settings","schedules","deployments"):
        deny("API_RESOURCE_SCOPE")
    if name not in BASE:deny("API_WORKER_SCOPE")
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
    # Script /settings describes latest uploaded version, NOT necessarily
    # the version serving traffic after POST /deployments rollback.
    deployments=api("GET",name,"deployments")
    schedule=api("GET",name,"schedules")
    d=deployments if isinstance(deployments,list) else deployments.get("deployments",[])
    cron=schedule.get("schedules",[]) if isinstance(schedule,dict) else schedule
    if not d or len(d[0].get("versions",[]))!=1 or cron!=[]:
        deny("REMOTE_DEPLOYMENT_DRIFT")
    active=d[0]["versions"][0]
    if active.get("percentage")!=100:deny("SPLIT_TRAFFIC")
    version=active.get("version_id")
    if not isinstance(version,str):deny("MISSING_ACTIVE_VERSION")
    settings=api("GET",name,"versions/"+version)
    bindings=settings.get("resources",{}).get("bindings",[])
    if not isinstance(bindings,list):deny("VERSION_BINDINGS_NOT_FOUND")
    b={v["name"]:v for v in bindings if isinstance(v,dict) and isinstance(v.get("name"),str)}
    if len(b)!=len(bindings):deny("VERSION_BINDINGS_MALFORMED")
    return b,version

def audit(name,b,old):
    active=scalar(b,"PRIVATE_HMAC_ACCEPTANCE_ISOLATED")=="true"
    expected="true" if active else "false"
    for flag in (OFF if name==BRAIN else ("HEALER_DURABLE_ACK_ENABLED",)):
        if scalar(b,flag)!=expected:deny("OPERATIONAL_FLAG_NOT_MATCHING_PERMIT")
    if name==BRAIN:
        exp=scalar(b,"STAGING_EXPIRES_AT")
        if active:
            t=dt.datetime.fromisoformat(exp.replace("Z","+00:00")) if isinstance(exp,str) else None
            now=dt.datetime.now(dt.timezone.utc)
            if not t or t<=now or t>now+dt.timedelta(minutes=60) or scalar(b,"BRAIN_SELFHEAL_APPROVED_SHA")!=SOURCE:
                deny("BRAIN_STAGING_WINDOW_UNVERIFIED")
        elif exp!="1970-01-01T00:00:00Z":
            deny("BRAIN_STAGING_NOT_OFF")
    if b.get("HEALER_EVENT_HMAC_KEY",{}).get("type")!="secret_text":
        deny("HMAC_SECRET_MISSING")
    allowed_changes={
      "DEPLOY_SHA","PRIVATE_HMAC_ACCEPTANCE_APPROVED_SHA",
      "PRIVATE_HMAC_ACCEPTANCE_ISOLATED","PRIVATE_HMAC_ACCEPTANCE_SESSION",
      "PRIVATE_HMAC_ACCEPTANCE_STARTED_AT","PRIVATE_HMAC_ACCEPTANCE_EXPIRES_AT",
      "STAGING_EXPIRES_AT","BRAIN_SELFHEAL_APPROVED_SHA",
      "BRAIN_SELFHEAL_BINDING_ATTESTED","BRAIN_SELFHEAL_DISPATCH_ENABLED",
      "BRAIN_SELFHEAL_RECOVERY_ENABLED","BRAIN_SELFHEAL_DURABLE_ACK_ENABLED",
      "HEALER_DURABLE_ACK_ENABLED"
    }
    for k,info in old.items():
        if k not in b or b[k].get("type")!=info["type"]:deny("BINDING_REMOVED")
        for field in ("namespace_id","service","entrypoint","class_name"):
            if b[k].get(field)!=info.get(field):deny("BINDING_TARGET_CHANGED")
        if info["type"]=="plain_text" and k not in allowed_changes:
            value=scalar(b,k)
            digest=hashlib.sha256(str(value).encode()).hexdigest()
            if digest!=info.get("value_digest"):deny("UNRELATED_VAR_CHANGED")
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
        old={k:{"type":info.get("type"),"namespace_id":info.get("namespace_id"),
                "service":info.get("service"),"entrypoint":info.get("entrypoint"),
                "class_name":info.get("class_name"),
                "value_digest":hashlib.sha256(str(scalar(b,k)).encode()).hexdigest()
                               if info.get("type")=="plain_text" else None}
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
    if 'name = "archelaos-brain-staging"' in text:
        switches=[
          ("STAGING_EXPIRES_AT","1970-01-01T00:00:00Z",end),
          *[(key,"false","true") for key in OFF]
        ]
    elif 'name = "archelaos-self-heal"' in text:
        switches=[("HEALER_DURABLE_ACK_ENABLED","false","true")]
    else: deny("UNKNOWN_WORKER_CONFIG")
    for key,old,new in switches:
        left=key+' = "'+old+'"'
        if text.count(left)!=1:deny("CONFIG_ACK_TOKEN_DRIFT")
        text=text.replace(left,key+' = "'+new+'"')
    if 'name = "archelaos-brain-staging"' in text:
        anchor='BRAIN_SELFHEAL_RECOVERY_ENABLED = "true"'
        if text.count(anchor)!=1:deny("PIN_INSERTION_DRIFT")
        text=text.replace(anchor,f'BRAIN_SELFHEAL_APPROVED_SHA = "{SOURCE}"\n{anchor}')
    return text

def deploy(name,state,session,start,end):
    p=ROOT/PATHS[name]
    out=p.parent/("wrangler."+name+".hmac-once.toml")
    if out.exists():deny("PREEXISTING_TEMP_CONFIG")
    temps.append(out)
    out.write_text(permit(p.read_text(),session,start,end))
    emit("TIMED_CONFIG_VALIDATED_"+("BRAIN" if name==BRAIN else "HEALER"))
    state[name]["attempted"]=True
    save(state)
    emit("DEPLOY_BEGIN_"+("BRAIN" if name==BRAIN else "HEALER"))
    result=subprocess.run([WRANGLER,"deploy","--config",str(out),"--keep-vars"],
                          cwd=ROOT,capture_output=True,text=True,timeout=90)
    if result.returncode:
        # No untrusted stderr, bearer tokens, file contents or CLI output in logs.
        stderr=result.stderr+result.stdout
        reason="PROVIDER_HTTP" if "HTTP" in stderr else (
            "AUTH" if "authentication" in stderr.lower() else (
            "CONFIG" if "config" in stderr.lower() else "UNKNOWN"))
        deny("TEMPORARY_DEPLOY_EXIT_"+str(result.returncode)+"_"+reason)
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

def qa_script(method, payload=None):
    name="archelaos-parent-ack-one-shot-qa"
    path=f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers/scripts/{name}"
    if method=="GET":path+="/settings"
    headers={"Authorization":"Bearer "+os.environ["CLOUDFLARE_API_TOKEN"],"Accept":"application/json"}
    req=urllib.request.Request(path,headers=headers,method=method)
    try:
        with urllib.request.urlopen(req,timeout=20) as response:
            body=response.read(262145)
            if len(body)>262144:deny("QA_API_OVERSIZED")
            data=json.loads(body)
            if data.get("success") is not True:deny("QA_API_NON_SUCCESS")
            return data.get("result")
    except urllib.error.HTTPError as e:
        if method=="GET" and e.code==404:return None
        deny("QA_API_"+str(e.code))
    except (urllib.error.URLError,TimeoutError):
        deny("QA_API_UNAVAILABLE")

def probe(session):
    import secrets
    import tempfile
    import time
    if not re_runid(os.getenv("QA_CI_RUN_ID","")) or not re_sha(os.getenv("QA_CI_SHA","")):
        deny("CI_REFERENCE_INVALID")
    folder=ROOT/"brain/qa"
    local_config=folder/"wrangler.parent-ack-local-proxy.toml"
    qa_config=folder/"wrangler.parent-ack-operator.toml"
    tmp=folder/"wrangler.parent-ack-ephemeral.toml"
    if not local_config.exists() or not qa_config.exists() or tmp.exists():
        deny("PRIVATE_RUNNER_CONFIG_UNAVAILABLE")
    if qa_script("GET") is not None:deny("QA_SCRIPT_NAME_ALREADY_CLAIMED")
    capability=secrets.token_urlsafe(48)
    vars={"QA_OPERATOR_CAPABILITY":capability,"QA_CI_RUN_ID":os.environ["QA_CI_RUN_ID"],
          "QA_CI_SHA":os.environ["QA_CI_SHA"],"QA_EXPECTED_PARENT_SHA":SOURCE}
    tmp.write_text(qa_config.read_text()+"\n[vars]\n"+
                   "".join(k+" = "+json.dumps(v)+"\n" for k,v in vars.items()))
    tmp.chmod(0o600)
    log=tempfile.TemporaryFile(mode="w+t")
    process=None
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    url="http://127.0.0.1:8799/__canonical_ack_one"
    deployed=False
    try:
        emit("QA_EPHEMERAL_DEPLOY_BEGIN")
        result=subprocess.run([WRANGLER,"deploy","--config",str(tmp)],
                              cwd=ROOT,capture_output=True,text=True,timeout=85)
        if result.returncode:
            reason="CONFIG" if "config" in (result.stderr+result.stdout).lower() else "PROVIDER_OR_BINDING"
            deny("QA_DEPLOY_"+reason)
        if qa_script("GET") is None:deny("QA_DEPLOY_READBACK_ABSENT")
        deployed=True
        emit("QA_EPHEMERAL_DEPLOY_PASS_NO_ROUTE")
        process=subprocess.Popen([WRANGLER,"dev","--config",str(local_config),
                     "--ip","127.0.0.1","--port","8799"],cwd=ROOT,env=os.environ,
                     stdout=log,stderr=subprocess.STDOUT)
        ready=False
        for _ in range(70):
            if process.poll() is not None:deny("LOCAL_PROXY_EXITED")
            try:
                opener.open(urllib.request.Request(url,method="GET"),timeout=2)
                deny("LOCAL_PROXY_UNEXPECTED_GET_200")
            except urllib.error.HTTPError as ex:
                if ex.code==404:ready=True;break
            except (urllib.error.URLError,TimeoutError):pass
            time.sleep(.5)
        if not ready:deny("LOCAL_PROXY_NOT_READY")
        emit("QA_LOCAL_PROXY_READY")
        try:
            opener.open(urllib.request.Request(url,method="POST",data=b'{"op":"run"}',
                 headers={"content-type":"application/json","x-operator-capability":"wrong"}),timeout=6)
            deny("QA_UNAUTHORIZED_ACCESS")
        except urllib.error.HTTPError as ex:
            if ex.code!=404:deny("QA_UNAUTHORIZED_NON_404")
        emit("QA_UNAUTHORIZED_404_PASS")
        def call(body):
            req=urllib.request.Request(url,method="POST",
                data=json.dumps(body).encode(),
                headers={"content-type":"application/json",
                         "x-operator-capability":capability})
            try:
                with opener.open(req,timeout=23) as response:
                    raw=response.read(4097)
                if len(raw)>4096:deny("QA_RESPONSE_OVERSIZED")
                return json.loads(raw)
            except urllib.error.HTTPError as ex:
                deny("QA_REMOTE_HTTP_"+str(ex.code))
            except (urllib.error.URLError,TimeoutError):
                deny("QA_REMOTE_TIMEOUT")
        emit("REAL_PROVIDER_CI_VERIFICATION_BEGIN")
        result=call({"op":"run"})
        if (result.get("status")!="ACKNOWLEDGED" or
            result.get("stage")!="FIRST_ACK_AND_INTERNAL_READBACK" or
            result.get("providerVerified") is not True or
            result.get("recoveryExecuted") is not False or
            result.get("aiCalls")!=0 or not valid_uuid(result.get("receiptId"))):
            stage=result.get("stage","UNKNOWN")
            if stage not in ("PROVENANCE","PROVENANCE_RPC_EXCEPTION","FIRST_ACK","CONFIG","INPUT","ONE_ATTEMPT_ONLY"):
                stage="UNEXPECTED"
            deny("REAL_ACK_"+stage)
        emit("LIVE_CANONICAL_ACK_PASS realProviderCi=true actionsExecuted=0")
        reread=call({"op":"readback","receiptId":result["receiptId"]})
        if reread!={"status":"ACKNOWLEDGED","readback":True,"recoveryExecuted":False,"aiCalls":0}:
            deny("INDEPENDENT_READBACK_UNVERIFIED")
        emit("INDEPENDENT_CANONICAL_READBACK_PASS duplicateDispatch=0")
    finally:
        if process:
            process.terminate()
            try:process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        log.close()
        tmp.unlink(missing_ok=True)
        # No permanent QA Worker, no route or credential survives the one-shot.
        try:
            if qa_script("GET") is not None:
                qa_script("DELETE")
                if qa_script("GET") is not None:deny("QA_DELETE_READBACK_FAILED")
                emit("QA_EPHEMERAL_DELETE_VERIFIED")
        except Exception:
            emit("QA_CLEANUP_REQUIRES_INDEPENDENT_FALLBACK")
            raise

def re_runid(value):
    return isinstance(value,str) and value.isdigit() and value[0]!="0" and len(value)<=20

def re_sha(value):
    return isinstance(value,str) and len(value)==40 and all(c in "0123456789abcdef" for c in value)

def valid_uuid(value):
    try:return str(uuid.UUID(value))==value
    except (TypeError,ValueError):return False

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
        emit("LIVE_PARENT_ACK_PASS actionsExecuted=0")
    finally:
        clean=restore(s)
        for p in temps:p.unlink(missing_ok=True)
        if not clean:
            emit("MANUAL_PROVIDER_RECONCILIATION_REQUIRED")
            deny("ROLLBACK_INCOMPLETE")
    if not successful:deny("LIVE_PROBE_NOT_AUTHENTICATED")
    emit("OVERALL_PASS_PARENT_ACK_BASELINES_RESTORED")

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
    except NoGo as error:
        # All NoGo messages originate in the fixed local deny() allowlist.
        code=str(error)
        emit("OVERALL_BLOCKED_"+(code if code.startswith("PARENT_ACK_") and len(code)<100 else "UNEXPECTED"))
        sys.exit(1)
    except (OSError,ValueError,subprocess.TimeoutExpired,subprocess.CalledProcessError) as error:
        emit("OVERALL_BLOCKED_SYSTEM_"+type(error).__name__)
        sys.exit(1)
