"""Read only: recover prior Google Antigravity sandbox snapshot and review source diffs."""
import difflib
import json
import os
import pathlib
import re
import subprocess
import tarfile
import tempfile
import urllib.error
import urllib.request

ENV = "5c2c34e172bbf5022b4d155ec9c5d29f"
SHA = "95c8ea0c7666f47986c8c9b85e2d3ded1b7c3204"
BASE = "https://generativelanguage.googleapis.com/v1beta"
OUT = pathlib.Path(os.environ.get("RUNNER_TEMP", "/tmp")) / "antigravity-snapshot-recovery"
OUT.mkdir(parents=True, exist_ok=True)
ROOT = pathlib.Path.cwd() / "original-pr288"
ALLOW = ("brain/src/", "brain/qa/", "brain/test/", "automation/self-heal-worker/test/",
         "automation/self-heal-worker/src/")
SENSITIVE = re.compile(r"(?i)(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|"
                       r"github_pat_|ghp_[a-z0-9]{25,}|gho_[a-z0-9]{25,}|"
                       r"AIza[a-zA-Z0-9_-]{20,}|sk-proj-)")
results = {"sourceSha": SHA, "environmentId": ENV, "readOnly": True,
           "newAntigravityInteractions": 0, "cloudflareMutations": 0,
           "changedPaths": [], "errors": []}
def report():
    (OUT / "status.json").write_text(json.dumps(results, indent=2) + "\n")
def req(url):
    key = os.environ.get("GEMINI_API_KEY")
    if not key: raise RuntimeError("Missing Gemini key")
    return urllib.request.Request(url, headers={"x-goog-api-key": key, "Api-Revision": "2026-05-20"})
def getjson(url):
    try:
        with urllib.request.urlopen(req(url), timeout=35) as r: return json.load(r)
    except urllib.error.HTTPError as e:
        results["errors"].append("METADATA_HTTP_" + str(e.code))
        return {}
def within_repo(name):
    name = name.lstrip("./")
    pivot = "workspace/archelaos-site/"
    if pivot not in name: return None
    sub = name.split(pivot, 1)[1]
    if not sub or sub.startswith("/") or ".." in sub.split("/") or "\\" in sub: return None
    if not sub.startswith(ALLOW) or not sub.endswith((".mjs", ".js", ".py", ".toml", ".md", ".json")): return None
    if any(seg.startswith(".") for seg in sub.split("/")): return None
    return sub
def main():
    actual = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    if actual != SHA: raise RuntimeError("EXACT_SOURCE_SHA_MISMATCH")
    env = getjson(BASE + "/environments/" + ENV)
    results["environmentAvailable"] = env.get("environment_id") == ENV
    results["environmentSourceTypes"] = [s.get("type") for s in env.get("sources", []) if isinstance(s, dict)]
    print("ENVIRONMENT_METADATA_AVAILABLE", results["environmentAvailable"], flush=True)
    # Official Google Files API. Earlier /environments/.../files paths were incorrect.
    url = BASE + "/files/environment-" + ENV + ":download?alt=media"
    with tempfile.NamedTemporaryFile() as f:
        try:
            with urllib.request.urlopen(req(url), timeout=70) as r:
                total=0
                while True:
                    data=r.read(1024*1024)
                    if not data: break
                    total+=len(data)
                    if total > 250*1024*1024: raise RuntimeError("SNAPSHOT_TOO_LARGE")
                    f.write(data)
        except urllib.error.HTTPError as e:
            results["snapshotHttp"] = e.code
            print("SNAPSHOT_HTTP", e.code, flush=True)
            return
        results["snapshotBytes"] = total
        f.flush()
        with tarfile.open(f.name, "r:*") as tar:
            members=tar.getmembers()
            results["tarMembers"] = len(members)
            results["pathsPresent"] = sorted({p for p in
                ["antigravity-hmac.patch", "antigravity-report.md", "antigravity-progress.md"]
                if any(m.name.lstrip("./").endswith("workspace/"+p) for m in members)})
            changed=[]
            for m in members:
                if not m.isfile() or m.size > 220000: continue
                sub=within_repo(m.name)
                if not sub: continue
                source=ROOT/sub
                if not source.is_file() or source.is_symlink(): continue
                raw=tar.extractfile(m).read()
                baseline=source.read_bytes()
                if baseline==raw: continue
                # Do not export source diffs that may contain secrets.
                if SENSITIVE.search(raw.decode("utf-8","replace")): 
                    results["errors"].append("SENSITIVE_CHANGE_OMITTED_" + sub)
                    continue
                try: old=baseline.decode("utf8");new=raw.decode("utf8")
                except UnicodeDecodeError: continue
                changed.append((sub,old,new))
            results["changedPaths"]=[p for p,_,_ in changed]
            diffs=[]
            for p,a,b in changed:
                piece="".join(difflib.unified_diff(a.splitlines(keepends=True),b.splitlines(keepends=True),
                    fromfile="a/"+p,tofile="b/"+p))
                if len(piece)>300000: continue
                diffs.append(piece)
            patch="\n".join(diffs)
            if patch and len(patch)<600000 and not SENSITIVE.search(patch):
                (OUT/"recovered-source-diff.patch").write_text(patch)
                results["patchBytes"]=len(patch.encode())
            print("SNAPSHOT_TAR_MEMBERS",len(members),flush=True)
            print("SNAPSHOT_WORKTREE_CHANGED",len(changed),flush=True)
            print("RECOVERED_FILE_MARKERS",",".join(results["pathsPresent"]) or "NONE",flush=True)
            print("CHANGED_PATHS",",".join(results["changedPaths"][:30]),flush=True)
    report()
if __name__=="__main__":
    try: main()
    except Exception as e:
        results["errors"].append(type(e).__name__ + ":" + str(e)[:140])
        print("RECOVERY_BLOCKED",type(e).__name__,flush=True)
    finally: report()
