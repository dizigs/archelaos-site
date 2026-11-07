"""One-shot, API-verified private Cloudflare HMAC test. QA script names ONLY."""
import datetime as datetime
import json, os, re, secrets, subprocess, sys, tempfile, time, tomllib
import urllib.error, urllib.request, uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
ACC="898359728b3dfe8c3a3f56e3d19eecd1"
B="archelaos-brain-qa-isolated"
H="archelaos-healer-qa-isolated"
W=str(ROOT/"brain/node_modules/.bin/wrangler")
created=set()
boot={}
tempfiles=[]
secretpath=None
def note(s): print("REMOTE_QA: "+s,flush=True)
class Stop(Exception): pass
def rep(s,a,b):
    if s.count(a)!=1: raise Stop("SOURCE_CONFIG_DRIFT")
    return s.replace(a,b)
def api(method,name,resource="settings"):
    if name not in (B,H): raise Stop("UNAPPROVED_SCRIPT")
    url="https://api.cloudflare.com/client/v4/accounts/"+ACC+"/workers/scripts/"+name
    if resource: url+="/"+resource
    request=urllib.request.Request(url,method=method,headers={"Authorization":"Bearer "+os.environ["CLOUDFLARE_API_TOKEN"]})
    try:
        with urllib.request.urlopen(request,timeout=14) as r:
            content=r.read(256001)
            if len(content)>256000: raise Stop("PROVIDER_RESPONSE_TOO_LARGE")
            if not content: return {"success":True}
            o=json.loads(content)
            if o.get("success") is not True: raise Stop("PROVIDER_RESPONSE_NOT_SUCCESS")
            return o
    except urllib.error.HTTPError as e:
        if e.code==404 and method=="GET": return None
        raise Stop("PROVIDER_HTTP_"+str(e.code)) from None
    except urllib.error.URLError:
        raise Stop("PROVIDER_TRANSPORT_ERROR") from None
def deploy(path):
    try:
        r=subprocess.run([W,"deploy","--config",str(path),"--secrets-file",str(secretpath)],
                         cwd=ROOT,env=os.environ,capture_output=True,text=True,timeout=90)
    except subprocess.TimeoutExpired: raise Stop("WRANGLER_DEPLOY_TIMEOUT") from None
    if r.returncode!=0:
        codes=re.findall(r"(?:error code|code)\s*:?\s*(\d{4,6})",r.stdout+r.stderr,re.I)
        raise Stop("WRANGLER_DEPLOY_FAILED"+("_"+codes[0] if codes else ""))
def make(src,original,name,old_peer,new_peer):
    c=(ROOT/src).read_text()
    o=tomllib.loads(c)
    if o["name"]!=original or o.get("workers_dev") is not False or o.get("preview_urls") is not False or o.get("routes") or o.get("triggers") or o["vars"]["PRIVATE_HMAC_ACCEPTANCE_ISOLATED"]!="false":
        raise Stop("SOURCE_WORKER_NOT_PRIVATE_OFF")
    c=rep(c,'name = "'+original+'"','name = "'+name+'"')
    # Isolated QA only: provide an opaque stage code for failure triage.
    c=rep(c,"[vars]","[vars]\nPRIVATE_HMAC_DIAGNOSTIC_ENABLED = \"true\"")
    c=c.replace('service = "'+old_peer+'"','service = "'+new_peer+'"')
    bootstrap=re.sub(r"(?ms)^\[\[services\]\]\n.*?(?=^\[|\Z)","",c)
    if tomllib.loads(bootstrap).get("services"): raise Stop("BOOTSTRAP_HAS_SERVICES")
    folder=ROOT/src.rsplit("/",1)[0]
    bp=folder/("wrangler."+name+".boot.toml")
    fp=folder/("wrangler."+name+".qa.toml")
    bp.write_text(bootstrap)
    tempfiles.extend((bp,fp))
    boot[name]=bp
    return fp,c
def enabled(c,sha,session,start,end):
    x=tomllib.loads(c)["vars"]
    for field,val in (("DEPLOY_SHA",sha),("PRIVATE_HMAC_ACCEPTANCE_APPROVED_SHA",sha),
        ("PRIVATE_HMAC_ACCEPTANCE_ISOLATED","true"),("PRIVATE_HMAC_ACCEPTANCE_SESSION",session),
        ("PRIVATE_HMAC_ACCEPTANCE_STARTED_AT",start),("PRIVATE_HMAC_ACCEPTANCE_EXPIRES_AT",end)):
        c=rep(c,field+' = "'+x[field]+'"',field+' = "'+val+'"')
    return c
def verify(name,sha=None):
    res=api("GET",name)
    if not res or not isinstance(res.get("result"),dict): raise Stop("DEPLOYMENT_READBACK_ABSENT")
    bs=res["result"].get("bindings") or []
    bindings={b.get("name"):b for b in bs if isinstance(b,dict)}
    if bindings.get("HMAC_NONCES",{}).get("class_name")!="PrivateHmacNonceStore":
        raise Stop("QA_NONCES_BINDING_MISSING")
    if bindings.get("HEALER_EVENT_HMAC_KEY",{}).get("type")!="secret_text":
        raise Stop("HMAC_SECRET_BINDING_MISSING")
    if sha:
        env={n:v.get("text") for n,v in bindings.items() if v.get("type")=="plain_text"}
        if env.get("DEPLOY_SHA")!=sha or env.get("PRIVATE_HMAC_ACCEPTANCE_APPROVED_SHA")!=sha or env.get("PRIVATE_HMAC_ACCEPTANCE_ISOLATED")!="true":
            raise Stop("DEPLOYED_SHA_PERMIT_MISMATCH")
        flags=(["HEALER_DURABLE_ACK_ENABLED"] if name==H else
            ["BRAIN_SELFHEAL_RECOVERY_ENABLED","BRAIN_SELFHEAL_DISPATCH_ENABLED",
             "BRAIN_SELFHEAL_BINDING_ATTESTED","BRAIN_SELFHEAL_DURABLE_ACK_ENABLED"])
        if any(env.get(f)!="false" for f in flags): raise Stop("REPAIR_FLAG_ENABLED")
        peer=bindings.get("HMAC_PEER" if name==B else "BRAIN_RECOVERY",{})
        if peer.get("type")!="service" or peer.get("service")!=(H if name==B else B):
            raise Stop("PRIVATE_PEER_NOT_BOUND")
    schedules=api("GET",name,"schedules")
    if not schedules or (schedules.get("result") or {}).get("schedules"):
        raise Stop("QA_CRON_PRESENT")
def call(sha,session):
    cap=secrets.token_urlsafe(48)
    folder=ROOT/"brain/qa"
    target=folder/"wrangler.one-shot-hmac.toml"
    secretsfile=folder/".dev.vars"
    if secretsfile.exists(): raise Stop("EXISTING_LOCAL_SECRETS")
    conf=(folder/"wrangler.operator-local.toml").read_text()
    conf=rep(conf,'service = "archelaos-brain-staging"','service = "'+B+'"')
    target.write_text(conf)
    secretsfile.write_text('OPERATOR_CAPABILITY="'+cap+'"\n')
    secretsfile.chmod(0o600)
    log=tempfile.TemporaryFile(mode="w+t")
    process=None
    loopback=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    phase="STARTING_RUNNER"
    note("QA_LOCAL_RUNNER_START")
    try:
        process=subprocess.Popen([W,"dev","--config",str(target),"--ip","127.0.0.1","--port","8799"],
                                 cwd=ROOT,env=os.environ,stdout=log,stderr=subprocess.STDOUT)
        url="http://127.0.0.1:8799/__local_private_hmac_qa"
        ready=False
        for i in range(60):
            if process.poll() is not None: raise Stop("LOOPBACK_RUNNER_EXITED")
            try:
                loopback.open(urllib.request.Request(url,method="GET"),timeout=2)
            except urllib.error.HTTPError as e:
                if e.code==404: ready=True; break
            except (urllib.error.URLError,TimeoutError): pass
            time.sleep(.5)
        if not ready: raise Stop("LOOPBACK_RUNNER_NOT_READY")
        phase="UNAUTHORIZED_PROBE"
        note("QA_LOCAL_RUNNER_READY")
        try:
            loopback.open(urllib.request.Request(url,method="POST",headers={"x-operator-capability":"wrong"}),timeout=5)
            raise Stop("UNAUTHORIZED_RUNNER_ACCESS")
        except urllib.error.HTTPError as e:
            if e.code!=404: raise Stop("UNAUTHORIZED_WRONG_HTTP")
        phase="AUTHORIZED_HMAC_RPC"
        note("QA_LOCAL_UNAUTHORIZED_404")
        req=urllib.request.Request(url,method="POST",headers={"x-operator-capability":cap})
        note("QA_LIVE_HMAC_RPC_BEGIN")
        try:
            with loopback.open(req,timeout=20) as r:
                response=r.read(4097)
        except urllib.error.HTTPError as e:
            raise Stop("REMOTE_PRIVATE_RPC_HTTP_"+str(e.code)) from None
        except (urllib.error.URLError,TimeoutError):
            raise Stop("REMOTE_PRIVATE_RPC_TIMEOUT_OR_TRANSPORT") from None
        if len(response)>4096: raise Stop("REMOTE_RPC_RESPONSE_OVERSIZED")
        p=json.loads(response)
        if isinstance(p,dict) and p.get("status")=="UNKNOWN" and re.fullmatch(r"QA_DIAG_[A-Z_]{3,35}",str(p.get("code",""))):
            note("LIVE_HMAC_"+p["code"])
        elif isinstance(p,dict) and p.get("status")=="UNKNOWN":
            note("LIVE_HMAC_GENERIC_UNKNOWN")
        if not isinstance(p,dict) or set(p)!={"status","sourceSha","sessionId","challengeDigest","actionsExecuted"} or p["status"]!="KEY_POSSESSION_CONFIRMED" or p["sourceSha"]!=sha or p["sessionId"]!=session or p["actionsExecuted"]!=0 or not re.fullmatch(r"[a-f0-9]{64}",p["challengeDigest"]):
            raise Stop("REMOTE_HMAC_UNVERIFIED")
        note("REAL_CLOUDFLARE_HMAC_PASS SHA="+sha+" actionsExecuted=0")
        note("UNAUTHORIZED_CAPABILITY_DENIED_404")
    except (TimeoutError,urllib.error.URLError):
        raise Stop("QA_LOCAL_"+phase+"_TIMEOUT_OR_TRANSPORT") from None
    finally:
        if process:
            process.terminate()
            try: process.wait(timeout=5)
            except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=3)
        log.close()
        secretsfile.unlink(missing_ok=True)
        target.unlink(missing_ok=True)
def run():
    global secretpath
    if os.getenv("GITHUB_ACTIONS")!="true" or os.getenv("GITHUB_REPOSITORY")!="dizigs/archelaos-site" or os.getenv("GITHUB_EVENT_NAME")!="pull_request" or os.getenv("QA_PR")!="288" or not os.getenv("CLOUDFLARE_API_TOKEN"):
        raise Stop("UNAUTHORIZED_CI_CONTEXT")
    sha=os.getenv("EXPECTED_SHA","")
    if not re.fullmatch(r"[a-f0-9]{40}",sha) or subprocess.check_output(["git","rev-parse","HEAD"],cwd=ROOT,text=True).strip()!=sha or subprocess.check_output(["git","log","-1","--format=%s"],cwd=ROOT,text=True).strip()!="qa(remote): one-shot isolated Cloudflare HMAC acceptance":
        raise Stop("UNAPPROVED_ONE_SHOT_COMMIT")
    if any(api("GET",n) is not None for n in (B,H)): raise Stop("QA_NAMES_NOT_FRESH")
    note("QA_SCRIPT_NAMES_FRESH")
    with tempfile.TemporaryDirectory(prefix="archelaos-hmac-") as d:
        secretpath=Path(d)/"private.json"
        secretpath.write_text(json.dumps({"HEALER_EVENT_HMAC_KEY":secrets.token_urlsafe(48)}))
        secretpath.chmod(0o600)
        plans={
            B:make("brain/wrangler.toml","archelaos-brain-staging",B,"archelaos-self-heal",H),
            H:make("automation/self-heal-worker/wrangler.toml","archelaos-self-heal",H,"archelaos-brain-staging",B)
        }
        success=False
        try:
            for n in (H,B):
                deploy(boot[n])
                created.add(n)
                verify(n)
                note("QA_BOOTSTRAP_"+n+"_PASS")
            issued=datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(seconds=3)
            expires=issued+datetime.timedelta(seconds=240)
            stamp=lambda t:t.strftime("%Y-%m-%dT%H:%M:%SZ")
            session=str(uuid.uuid4())
            for n in (H,B):
                path,source=plans[n]
                path.write_text(enabled(source,sha,session,stamp(issued),stamp(expires)))
            for n in (H,B):
                deploy(plans[n][0])
                verify(n,sha)
                note("QA_NAMED_BINDING_"+n+"_PASS")
            if datetime.datetime.now(datetime.timezone.utc)>=expires-datetime.timedelta(seconds=15):
                raise Stop("PERMIT_EXPIRED_BEFORE_CALL")
            call(sha,session)
            success=True
        finally:
            clean=True
            for n in (B,H):
                if n in created:
                    try:
                        deploy(boot[n])
                        note("QA_REVOKE_"+n+"_PASS")
                    except Exception:
                        clean=False
                        note("QA_REVOKE_"+n+"_BLOCKED")
            for n in (B,H):
                if n in created:
                    try:
                        api("DELETE",n,"")
                        if api("GET",n) is not None: raise Stop("DELETE_READBACK_FAILED")
                        note("QA_DELETE_"+n+"_VERIFIED")
                    except Exception:
                        clean=False
                        note("QA_DELETE_"+n+"_BLOCKED")
            for f in tempfiles: f.unlink(missing_ok=True)
            if not clean: raise Stop("QA_CLEANUP_INCOMPLETE")
        if not success: raise Stop("HMAC_NOT_CONFIRMED")
    note("OVERALL_PASS_REAL_CLOUDFLARE_HMAC_AND_CLEANUP")
if __name__=="__main__":
    try: run()
    except Stop as e:
        note("OVERALL_BLOCKED_"+str(e)); sys.exit(1)
    except Exception as e:
        note("OVERALL_BLOCKED_"+type(e).__name__); sys.exit(1)
