"""Bounded GitHub incident journal and draft publisher. No main-ref/merge API."""
import base64
import copy
import json
from pathlib import PurePosixPath
import re
import subprocess
import tempfile
from urllib.parse import quote, urlencode

from self_heal_control_plane import SHA, repair_branch

REPO = "dizigs/archelaos-site"
API = "repos/" + REPO
ACTOR_BOT_ID = 41898282
STATE_MARKER = "archelaos-self-heal-state:v1:"
FIXTURE_BRANCH = re.compile(r"codex/self-heal-staging-[a-z0-9-]{1,60}")
SAFE_PATHS = {"self-heal-fixtures/news-head.html", "news.html"}


class AccessFailure(RuntimeError):
    def __init__(self, method, path, status=None, message="unclassified API failure"):
        self.evidence = {"method": method, "endpoint": "https://api.github.com/" + path,
                         "httpStatus": status, "message": message}
        super().__init__(method + " " + path + ": " + message + (" HTTP " + str(status) if status else ""))


class GitHub:
    def __init__(self, max_requests=100):
        self.requests = 0; self.writes = 0; self.write_attempts = 0; self.max_requests = max_requests

    def request(self, path, method="GET", data=None, missing_ok=False):
        if (method not in {"GET", "POST"} or not (path == API or path.startswith(API + "/"))
                or any(part in {".", ".."} for part in path.split("?", 1)[0].split("/"))):
            raise ValueError("Unapproved API operation")
        route = path.split("?", 1)[0]
        if method == "POST":
            allowed = {API + suffix for suffix in ("/issues", "/pulls", "/git/blobs", "/git/trees", "/git/commits", "/git/refs")}
            if route not in allowed and not re.fullmatch(re.escape(API) + r"/issues/[0-9]+/comments", route):
                raise ValueError("Mutation endpoint outside the compiled allowlist")
            if not isinstance(data, dict): raise ValueError("Structured mutation body required")
            if route == API + "/git/refs" and not re.fullmatch(
                    r"refs/heads/(?:bot/self-heal/[0-9a-f]{12}-[0-9a-f]{12}|codex/self-heal-staging-[a-z0-9-]{1,60})", data.get("ref", "")):
                raise ValueError("Main and arbitrary ref creation are forbidden")
            if route == API + "/pulls" and (data.get("draft") is not True or
                    data.get("base") != "main" and not FIXTURE_BRANCH.fullmatch(data.get("base", ""))):
                raise ValueError("Only scoped draft PRs may be proposed")
        elif not (route == API or any(route.startswith(API + prefix) for prefix in
                    ("/issues", "/pulls", "/git/", "/actions/runs/", "/compare/", "/commits/", "/rules/branches/"))):
            raise ValueError("Read endpoint outside the compiled metadata allowlist")
        if self.requests >= self.max_requests:
            raise RuntimeError("Run API budget exhausted; no retry")
        self.requests += 1
        if method == "POST": self.write_attempts += 1
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", prefix="archelaos-gh-", suffix=".json") as body:
            command = ["gh", "api", "--method", method, path]
            if data is not None:
                json.dump(data, body); body.flush(); command.extend(["--input", body.name])
            try:
                result = subprocess.run(command, capture_output=True, text=True, timeout=30, check=False)
            except subprocess.TimeoutExpired:
                raise AccessFailure(method, path, None, "request timed out; outcome unknown, no retry") from None
        if result.returncode:
            match = re.search(r"HTTP\s+(\d{3})", result.stderr)
            status = int(match[1]) if match else None
            if status == 404 and missing_ok and "Not Found" in result.stderr:
                return None
            messages = ("Resource not accessible by integration", "GitHub Actions is not permitted to create or approve pull requests",
                        "Bad credentials", "Not Found", "Reference already exists")
            known = next((msg for msg in messages if msg in result.stderr), "unclassified API failure")
            raise AccessFailure(method, path, status, known)
        if len(result.stdout.encode()) > 6 * 1024 * 1024:
            raise ValueError("API response outside bounds")
        if method == "POST": self.writes += 1
        return json.loads(result.stdout) if result.stdout.strip() else None

    def pages(self, path, max_pages=5):
        rows = []
        for page in range(1, max_pages + 1):
            batch = self.request(path + ("&" if "?" in path else "?") + urlencode({"per_page": 100, "page": page}))
            if not isinstance(batch, list): raise ValueError("Unexpected paginated API response")
            rows.extend(batch)
            if len(batch) < 100: return rows
        raise RuntimeError("Incomplete lookup at pagination cap; refusing duplicate creation")


class IncidentStore:
    """Append-only state journal; public comments from other authors are ignored."""
    def __init__(self, client, aggregate=False):
        self.client = client; self.aggregate = aggregate; self.containers = {}; self.owner_id = None

    def trusted(self, user):
        if self.owner_id is None:
            repository = self.client.request(API)
            if repository.get("full_name") != REPO or repository.get("owner", {}).get("login") != "dizigs":
                raise ValueError("Repository authority mismatch")
            self.owner_id = repository["owner"]["id"]
        return ((user.get("login") == "github-actions[bot]" and user.get("id") == ACTOR_BOT_ID)
                or (user.get("login") == "dizigs" and user.get("id") == self.owner_id))

    @staticmethod
    def marker(key): return "<!-- " + STATE_MARKER + key + " -->"

    def load(self, key):
        issues = self.client.pages(API + "/issues?state=all")
        candidates = [row for row in issues if "pull_request" not in row and
                      (self.marker(key) in (row.get("body") or "") or
                       self.aggregate and row.get("title") == "Site QA: automated monitor alert")]
        if len(candidates) > 1: raise RuntimeError("Ambiguous existing incidents; no duplicate/repair allowed")
        if not candidates: return None
        issue = candidates[0]
        if not self.trusted(issue.get("user") or {}):
            raise ValueError("Incident container author is not trusted")
        number = issue.get("number")
        if type(number) is not int or number < 1: raise ValueError("Invalid incident ID")
        self.containers[key] = number
        comments = self.client.pages(API + f"/issues/{number}/comments", max_pages=3)
        state = None
        for comment in comments:
            body = comment.get("body") or ""
            if self.marker(key) not in body or not self.trusted(comment.get("user") or {}): continue
            prefix = self.marker(key) + "\n```json\n"
            if not body.startswith(prefix) or not body.endswith("\n```") or len(body) > 32768:
                raise ValueError("Malformed trusted journal event")
            decoded = json.loads(body[len(prefix):-4])
            if decoded.get("fingerprint") != key: raise ValueError("Journal fingerprint mismatch")
            state = decoded
        return copy.deepcopy(state)

    def create(self, state):
        key = state["fingerprint"]
        if key not in self.containers:
            title = "Site QA: automated monitor alert" if self.aggregate else "SELF-HEAL FIXTURE: isolated news-head fault [" + key + "]"
            body = (self.marker(key) + "\n\nControlled technical incident; no private data. "
                    "Fixture incidents are deliberately injected, not production outages.\n\n"
                    "Source run: " + state["sourceRunUrl"] + "\nSource commit: " + state["sourceCommit"] +
                    "\nResource: " + state["resource"] + "\n\nNo direct production change or automatic merge.")
            issue = self.client.request(API + "/issues", "POST", {"title": title, "body": body})
            if type(issue.get("number")) is not int: raise ValueError("No incident created")
            self.containers[key] = issue["number"]
        self.save(state)

    def save(self, state):
        key = state["fingerprint"]
        if key not in self.containers: raise ValueError("Incident lookup must precede updates")
        body = self.marker(key) + "\n```json\n" + json.dumps(state, sort_keys=True, ensure_ascii=True) + "\n```"
        self.client.request(API + f"/issues/{self.containers[key]}/comments", "POST", {"body": body})


def full_sha(value):
    if not isinstance(value, str) or not SHA.fullmatch(value): raise ValueError("Full Git SHA required")
    return value


def branch_head(client, branch, missing_ok=False):
    if branch != "main" and not FIXTURE_BRANCH.fullmatch(branch) and not re.fullmatch(r"bot/self-heal/[0-9a-f]{12}-[0-9a-f]{12}", branch):
        raise ValueError("Ref outside approved namespaces")
    result = client.request(API + "/git/ref/heads/" + quote(branch, safe=""), missing_ok=missing_ok)
    return None if result is None else full_sha((result.get("object") or {}).get("sha"))


def tree_file(client, commit, path, optional=False):
    if path not in SAFE_PATHS: raise ValueError("Unapproved source path")
    tree = client.request(API + "/git/trees/" + full_sha(commit) + "?recursive=1")
    if tree.get("truncated") is not False or not isinstance(tree.get("tree"), list):
        raise ValueError("Incomplete source tree")
    entries = {row.get("path"): row for row in tree["tree"]}
    for parent in PurePosixPath(path).parents:
        if str(parent) == ".": continue
        entry = entries.get(str(parent))
        if entry is not None and entry.get("mode") != "040000":
            raise ValueError("Source parent is not an ordinary Git tree")
    leaf = entries.get(path)
    if leaf is None:
        if optional: return None
        raise ValueError("Source fixture missing")
    if leaf.get("mode") != "100644" or leaf.get("type") != "blob":
        raise ValueError("Source target is not an ordinary file")
    blob_sha = full_sha(leaf.get("sha"))
    blob = client.request(API + "/git/blobs/" + blob_sha)
    if blob.get("encoding") != "base64" or blob.get("sha") != blob_sha or blob.get("size", 200001) > 200000:
        raise ValueError("Invalid bounded source blob")
    encoded = blob.get("content")
    if not isinstance(encoded, str) or len(encoded) > 300000:
        raise ValueError("Invalid bounded blob encoding")
    content = base64.b64decode(re.sub(r"\s+", "", encoded), validate=True)
    if len(content) != blob.get("size") or len(content) > 200000: raise ValueError("Source size mismatch")
    return {"sha": blob_sha, "content": content.decode("utf-8")}


def assert_no_other_pr_owner(client, path, own_branch=None):
    for pull in client.pages(API + "/pulls?state=open"):
        if (pull.get("head") or {}).get("ref") == own_branch: continue
        number = pull.get("number")
        if type(number) is not int: raise ValueError("Invalid ownership record")
        files = client.pages(API + f"/pulls/{number}/files")
        if any(row.get("filename") == path for row in files):
            raise RuntimeError("Repair source already owned by active PR " + str(number))


def create_changed_ref(client, base_commit, path, content, branch, message):
    """Create one tested branch event; object creation cannot alter main refs."""
    if path not in SAFE_PATHS or branch == "main": raise ValueError("Unapproved ref/target")
    if not FIXTURE_BRANCH.fullmatch(branch) and not re.fullmatch(r"bot/self-heal/[0-9a-f]{12}-[0-9a-f]{12}", branch):
        raise ValueError("Unapproved generated branch")
    if FIXTURE_BRANCH.fullmatch(branch) and path != "self-heal-fixtures/news-head.html":
        raise ValueError("Staging seed may only create its isolated fixture")
    if not isinstance(content, str) or len(content.encode()) > 200000:
        raise ValueError("Candidate content exceeds bounds")
    tree_file(client, base_commit, path, optional=True)
    base = client.request(API + "/git/commits/" + full_sha(base_commit))
    blob = client.request(API + "/git/blobs", "POST", {"content": content, "encoding": "utf-8"})
    tree = client.request(API + "/git/trees", "POST", {"base_tree": full_sha(base["tree"]["sha"]),
        "tree": [{"path": path, "mode": "100644", "type": "blob", "sha": full_sha(blob["sha"])}]})
    commit = client.request(API + "/git/commits", "POST", {"message": message, "tree": full_sha(tree["sha"]),
                                                          "parents": [base_commit]})
    sha = full_sha(commit["sha"])
    client.request(API + "/git/refs", "POST", {"ref": "refs/heads/" + branch, "sha": sha})
    return sha


class DraftPublisher:
    def __init__(self, client, base_branch, expected_source, verify_fixed):
        if base_branch != "main" and not FIXTURE_BRANCH.fullmatch(base_branch): raise ValueError("Invalid PR base")
        self.client = client; self.base = base_branch; self.expected_source = full_sha(expected_source)
        self.verify_fixed = verify_fixed

    def propose(self, observation, patch):
        if ((self.base == "main" and (patch.path != "news.html" or observation.scope != "public"))
                or (self.base != "main" and (patch.path != "self-heal-fixtures/news-head.html" or observation.scope != "fixture"))):
            raise ValueError("Proposal target does not match its isolated/release scope")
        branch = repair_branch(observation.fingerprint, observation.source_signature)
        assert_no_other_pr_owner(self.client, patch.path, branch)
        base_commit = branch_head(self.client, self.base)
        original = tree_file(self.client, base_commit, patch.path)
        if original["sha"] != self.expected_source: raise RuntimeError("Source changed before proposal")
        candidate = branch_head(self.client, branch, missing_ok=True)
        if candidate is None:
            candidate = create_changed_ref(self.client, base_commit, patch.path, patch.content, branch,
                "self-heal: tested known whitespace repair [" + observation.fingerprint + "]")
        remote = tree_file(self.client, candidate, patch.path)
        if remote["content"] != patch.content: raise ValueError("Existing candidate differs from tested patch")
        self.verify_fixed(remote["content"])
        comparison = self.client.request(API + "/compare/" + base_commit + "..." + candidate)
        if [row.get("filename") for row in comparison.get("files", [])] != [patch.path]:
            raise ValueError("Candidate contains unrelated changes")
        pulls = self.client.pages(API + "/pulls?" + urlencode({"state": "all", "head": "dizigs:" + branch}))
        if len(pulls) > 1: raise RuntimeError("Ambiguous existing repair PRs")
        if pulls:
            pull = pulls[0]
            if pull.get("state") != "open" or pull.get("draft") is not True:
                raise RuntimeError("Existing repair requires review reconciliation; no duplicate")
        else:
            body = ("Controlled, allowlisted repair with independent before/after regression checks.\n\n"
                    "Source run: " + observation.source_run + "\nSource commit: " + observation.source_commit +
                    "\nFingerprint: " + observation.fingerprint + "\nSignature: " + observation.source_signature +
                    "\nOnly changed path: " + patch.path + "\nCandidate commit: " + candidate +
                    "\n\nFixture PRs target an isolated staging branch, not production. "
                    "No identities/history/DNS/consent changes or automatic merge. Required CI/review remain gates.")
            pull = self.client.request(API + "/pulls", "POST", {"title": "self-heal fixture: tested news-head whitespace repair",
                "head": branch, "base": self.base, "body": body, "draft": True})
        if ((pull.get("head") or {}).get("sha") != candidate
                or (pull.get("head") or {}).get("ref") != branch
                or (pull.get("base") or {}).get("ref") != self.base):
            raise ValueError("PR head/base changed during proposal")
        return {"number": pull["number"], "url": pull["html_url"], "commit": candidate,
                "branch": branch, "draft": pull.get("draft")}
