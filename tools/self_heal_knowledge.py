#!/usr/bin/env python3
"""Read-only external OSV knowledge ingest/query; no code repair or deployment authority.

OSV is an untrusted reference corpus. This tool never executes snippets from it.
The SQLite cache is deliberately local and ignored by git.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path, PurePosixPath
import re
import sqlite3
import sys
import urllib.parse
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
CACHE_ROOT = ROOT / "rebuild" / "test-artifacts" / "knowledge-cache"
DEFAULT_DB = CACHE_ROOT / "osv.sqlite3"
OSV_API = "https://api.osv.dev"
OSV_SOURCE = "https://google.github.io/osv.dev/data/"
MAX_RESPONSE = 8 * 1024 * 1024
MAX_RECORD = 12 * 1024 * 1024
MAX_RECORDS = 2000000
MAX_UNCOMPRESSED = 8 * 1024 * 1024 * 1024
ID = re.compile(r"[A-Za-z0-9._-]{1,110}\Z")
PACKAGE = re.compile(r"[@A-Za-z0-9._/-]{1,160}\Z")
ECOSYSTEM = re.compile(r"[A-Za-z0-9._:+-]{1,80}\Z")
VERSION = re.compile(r"[A-Za-z0-9._+~:-]{1,100}\Z")


class KnowledgeError(ValueError):
    pass


def utcnow():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect(db=DEFAULT_DB):
    """Never access an external service; caller owns the local cache path."""
    db = Path(db)
    db.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(db), timeout=5)
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("PRAGMA busy_timeout = 5000")
    con.executescript("""
    CREATE TABLE IF NOT EXISTS advisories (
        id TEXT PRIMARY KEY,
        canonical_id TEXT NOT NULL,
        source_url TEXT NOT NULL,
        summary TEXT NOT NULL,
        details TEXT NOT NULL,
        ecosystem_names TEXT NOT NULL,
        affected_json TEXT NOT NULL,
        references_json TEXT NOT NULL,
        published TEXT,
        modified TEXT NOT NULL,
        withdrawn TEXT,
        imported_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS aliases (
        id TEXT NOT NULL REFERENCES advisories(id) ON DELETE CASCADE,
        alias TEXT NOT NULL,
        PRIMARY KEY (id, alias)
    );
    CREATE INDEX IF NOT EXISTS idx_alias ON aliases(alias);
    CREATE INDEX IF NOT EXISTS idx_canonical ON advisories(canonical_id);
    CREATE INDEX IF NOT EXISTS idx_modified ON advisories(modified);
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE VIRTUAL TABLE IF NOT EXISTS advisory_fts
       USING fts5(id UNINDEXED, summary, details, ecosystem_names);
    """)
    return con


def canonical_id(advisory_id, aliases):
    # OSV often contains a GHSA, CVE and ecosystem-specific ID for one vulnerability.
    all_ids = set(aliases) | {advisory_id}
    cves = sorted(x for x in all_ids if x.startswith("CVE-"))
    ghsas = sorted(x for x in all_ids if x.startswith("GHSA-"))
    return (cves or ghsas or [advisory_id])[0]


def normalize(record):
    if not isinstance(record, dict):
        raise KnowledgeError("OSV record must be an object")
    advisory_id = record.get("id")
    if not isinstance(advisory_id, str) or not ID.fullmatch(advisory_id):
        raise KnowledgeError("Invalid OSV ID")
    aliases = record.get("aliases") or []
    if not isinstance(aliases, list) or len(aliases) > 100:
        raise KnowledgeError("Invalid OSV aliases")
    if any(not isinstance(x, str) or not ID.fullmatch(x) for x in aliases):
        raise KnowledgeError("Invalid OSV alias")
    affected = record.get("affected") or []
    references = record.get("references") or []
    if not isinstance(affected, list) or len(affected) > 1000:
        raise KnowledgeError("Invalid affected packages")
    if not isinstance(references, list) or len(references) > 1000:
        raise KnowledgeError("Invalid references")
    packages = []
    safe_affected = []
    for entry in affected:
        if not isinstance(entry, dict):
            raise KnowledgeError("Invalid affected package entry")
        pkg = entry.get("package") or {}
        if not isinstance(pkg, dict):
            raise KnowledgeError("Invalid package metadata")
        ecosystem, name = pkg.get("ecosystem"), pkg.get("name")
        if isinstance(ecosystem, str) and isinstance(name, str):
            packages.append(ecosystem + ":" + name)
        safe_affected.append({
            "package": {"ecosystem": ecosystem, "name": name},
            "ranges": entry.get("ranges", [])[:30] if isinstance(entry.get("ranges", []), list) else [],
            "versions": entry.get("versions", [])[:60] if isinstance(entry.get("versions", []), list) else []
        })
    safe_references = []
    for item in references:
        if isinstance(item, dict) and isinstance(item.get("url"), str):
            url = item["url"]
            parsed = urllib.parse.urlsplit(url)
            if parsed.scheme == "https" and parsed.hostname and len(url) <= 1200:
                safe_references.append({"type": str(item.get("type", "WEB"))[:30], "url": url})
    modified = record.get("modified")
    if not isinstance(modified, str) or len(modified) > 64:
        raise KnowledgeError("Missing OSV modified timestamp")
    summary = record.get("summary") or ""
    details = record.get("details") or ""
    if not isinstance(summary, str) or not isinstance(details, str):
        raise KnowledgeError("OSV description must be text")
    published = record.get("published")
    withdrawn = record.get("withdrawn")
    if any(x is not None and (not isinstance(x, str) or len(x) > 64) for x in (published, withdrawn)):
        raise KnowledgeError("Invalid OSV timestamp")
    return {
        "id": advisory_id, "canonical_id": canonical_id(advisory_id, aliases),
        "source_url": "https://osv.dev/vulnerability/" + urllib.parse.quote(advisory_id),
        "summary": summary[:1500], "details": details[:6000],
        "ecosystem_names": " ".join(sorted(set(packages)))[:9000],
        "affected_json": json.dumps(safe_affected, ensure_ascii=False, separators=(",", ":")),
        "references_json": json.dumps(safe_references, ensure_ascii=False, separators=(",", ":")),
        "published": published, "modified": modified, "withdrawn": withdrawn,
        "imported_at": utcnow(), "aliases": sorted(set(aliases))
    }


def upsert(con, item):
    record = normalize(item)
    fields = ["id", "canonical_id", "source_url", "summary", "details", "ecosystem_names",
              "affected_json", "references_json", "published", "modified", "withdrawn", "imported_at"]
    old = con.execute("SELECT modified FROM advisories WHERE id=?", (record["id"],)).fetchone()
    if old and old[0] == record["modified"]:
        return False
    con.execute("DELETE FROM advisory_fts WHERE id=?", (record["id"],))
    con.execute("INSERT INTO advisories (" + ",".join(fields) + ") VALUES (" +
                ",".join("?" for _ in fields) + ") ON CONFLICT(id) DO UPDATE SET " +
                ",".join(f"{k}=excluded.{k}" for k in fields[1:]),
                [record[k] for k in fields])
    con.execute("DELETE FROM aliases WHERE id=?", (record["id"],))
    con.executemany("INSERT INTO aliases (id, alias) VALUES (?,?)",
                    ((record["id"], alias) for alias in record["aliases"]))
    con.execute("INSERT INTO advisory_fts(id, summary, details, ecosystem_names) VALUES (?,?,?,?)",
                (record["id"], record["summary"], record["details"], record["ecosystem_names"]))
    return True


def ingest_zip(con, zip_path):
    """Stream each OSV JSON ZIP member; reject traversal, zip bombs and invalid records."""
    added, scanned, total_bytes = 0, 0, 0
    with zipfile.ZipFile(zip_path) as archive:
        for entry in archive.infolist():
            if entry.is_dir():
                continue
            name = PurePosixPath(entry.filename)
            if (name.is_absolute() or ".." in name.parts or "\\" in entry.filename or
                    not entry.filename.endswith(".json")):
                raise KnowledgeError("Untrusted OSV archive path/extension")
            scanned += 1
            total_bytes += entry.file_size
            if (scanned > MAX_RECORDS or total_bytes > MAX_UNCOMPRESSED or
                    entry.file_size > MAX_RECORD or entry.file_size < 2):
                raise KnowledgeError("OSV ZIP exceeds safety limits")
            with archive.open(entry, "r") as stream:
                raw = stream.read(MAX_RECORD + 1)
            if len(raw) != entry.file_size or len(raw) > MAX_RECORD:
                raise KnowledgeError("OSV ZIP member size mismatch")
            data = json.loads(raw)
            if upsert(con, data):
                added += 1
    return {"scanned": scanned, "updated": added, "source": OSV_SOURCE}


def _request_json(path, payload=None):
    """Fixed OSV endpoint and bounded response; no arbitrary remote URL or retries."""
    if not re.fullmatch(r"/v1/(query|vulns/[A-Za-z0-9._-]{1,110})", path):
        raise KnowledgeError("OSV endpoint outside allowlist")
    headers = {"Accept": "application/json", "User-Agent": "Archelaos-knowledge/1.0 (+https://archelaos.club)"}
    body = None
    if payload is not None:
        body = json.dumps(payload, separators=(",", ":")).encode()
        headers["Content-Type"] = "application/json"
        if len(body) > 16000:
            raise KnowledgeError("OSV request too large")
    request = urllib.request.Request(OSV_API + path, data=body, headers=headers,
                                     method="POST" if body is not None else "GET")
    with urllib.request.urlopen(request, timeout=12) as response:
        if response.geturl() != OSV_API + path:
            raise KnowledgeError("Unexpected OSV redirect")
        raw = response.read(MAX_RESPONSE + 1)
    if len(raw) > MAX_RESPONSE:
        raise KnowledgeError("OSV response too large")
    result = json.loads(raw)
    if not isinstance(result, dict):
        raise KnowledgeError("Unexpected OSV response")
    return result


def lookup_package(con, ecosystem, name, version, transport=_request_json):
    """On-demand vulnerability lookup; update cache only after every API page succeeds."""
    for field, pattern in ((ecosystem, ECOSYSTEM), (name, PACKAGE), (version, VERSION)):
        if not isinstance(field, str) or not pattern.fullmatch(field):
            raise KnowledgeError("Invalid ecosystem, name or version")
    if any(segment in {"", ".", ".."} for segment in name.split("/")):
        raise KnowledgeError("Package path contains empty or traversal segment")
    token, tokens, found, calls = None, set(), {}, 0
    for _ in range(12):
        payload = {"package": {"ecosystem": ecosystem, "name": name}, "version": version}
        if token:
            payload["page_token"] = token
        page = transport("/v1/query", payload)
        calls += 1
        if not isinstance(page.get("vulns", []), list):
            raise KnowledgeError("Unexpected OSV vulnerability response")
        for vuln in page.get("vulns", []):
            if not isinstance(vuln, dict) or not ID.fullmatch(str(vuln.get("id", ""))):
                raise KnowledgeError("Invalid OSV vulnerability ID")
            found[vuln["id"]] = True
            if len(found) > 200:
                raise KnowledgeError("Too many advisories for bounded lookup")
        nxt = page.get("next_page_token")
        if not nxt:
            break
        if not isinstance(nxt, str) or not 1 <= len(nxt) <= 512 or nxt in tokens:
            raise KnowledgeError("OSV pagination loop/invalid token")
        tokens.add(nxt)
        token = nxt
    else:
        raise KnowledgeError("OSV pagination incomplete; no caching partial results")
    hydrated = [transport("/v1/vulns/" + key) for key in sorted(found)]
    with con:
        updates = sum(bool(upsert(con, record)) for record in hydrated)
    return {"package": ecosystem + ":" + name, "version": version,
            "matches": len(found), "updated": updates, "requests": calls + len(hydrated)}


def search(con, query, limit=15, include_withdrawn=False):
    terms = re.findall(r"[A-Za-z0-9_]{2,50}", query)[:8]
    if not terms:
        raise KnowledgeError("Provide at least one search term of 2+ characters")
    fts = " OR ".join('"' + item + '"*' for item in terms)
    limit = min(max(int(limit), 1), 50)
    rows = con.execute("""
        SELECT a.id, a.canonical_id, a.summary, a.ecosystem_names, a.source_url,
               a.modified, a.withdrawn
        FROM advisory_fts JOIN advisories a ON a.id=advisory_fts.id
        WHERE advisory_fts MATCH ? AND (? OR a.withdrawn IS NULL)
        ORDER BY bm25(advisory_fts) LIMIT ?
    """, (fts, int(include_withdrawn), limit * 5)).fetchall()
    results, seen = [], set()
    for row in rows:
        if row[1] in seen:
            continue
        seen.add(row[1])
        results.append(dict(zip(("id", "canonicalId", "summary", "packages",
                                 "sourceUrl", "modified", "withdrawn"), row)))
        if len(results) >= limit:
            break
    return results


def inspect(con, advisory_id):
    if not ID.fullmatch(advisory_id):
        raise KnowledgeError("Invalid advisory ID")
    row = con.execute("""SELECT a.id,a.canonical_id,a.summary,a.details,a.ecosystem_names,
                 a.affected_json,a.references_json,a.modified,a.withdrawn,a.source_url
                 FROM advisories a WHERE a.id=? OR a.id IN
                    (SELECT id FROM aliases WHERE alias=?) ORDER BY a.id LIMIT 30""",
                      (advisory_id, advisory_id)).fetchall()
    return [dict(zip(("id","canonicalId","summary","details","packages","affected",
                       "references","modified","withdrawn","sourceUrl"),
                      [*r[:5], json.loads(r[5]), json.loads(r[6]), *r[7:]])) for r in row]


def stats(con):
    count, active = con.execute("SELECT COUNT(*), COUNT(*) FILTER (WHERE withdrawn IS NULL) FROM advisories").fetchone()
    return {"records": count, "active": active,
            "aliases": con.execute("SELECT COUNT(*) FROM aliases").fetchone()[0],
            "canonicalGroups": con.execute("SELECT COUNT(DISTINCT canonical_id) FROM advisories").fetchone()[0],
            "status": (con.execute("SELECT value FROM metadata WHERE key='bulk_status'").fetchone() or ["NOT_IMPORTED"])[0],
            "runtimeRepairAuthority": False}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    a = commands.add_parser("import-zip", help="Import local official OSV all.zip or ecosystem ZIP; no download")
    a.add_argument("archive", type=Path)
    b = commands.add_parser("lookup", help="Explicit opt-in network query for one exact package version")
    b.add_argument("ecosystem"); b.add_argument("package"); b.add_argument("version")
    b.add_argument("--allow-network", action="store_true")
    c = commands.add_parser("search", help="Search the local indexed OSV corpus, no network")
    c.add_argument("terms"); c.add_argument("--limit", type=int, default=15)
    d = commands.add_parser("inspect", help="Display local evidence for exact OSV ID or alias")
    d.add_argument("id")
    commands.add_parser("stats")
    args = parser.parse_args(argv)
    CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    with connect() as con:
        if args.command == "import-zip":
            # If partial import fails, status remains INCOMPLETE rather than claiming coverage.
            con.execute("INSERT OR REPLACE INTO metadata(key,value) VALUES ('bulk_status','INCOMPLETE')")
            con.commit()
            report = ingest_zip(con, args.archive)
            con.execute("INSERT OR REPLACE INTO metadata(key,value) VALUES ('bulk_status','COMPLETE')")
            con.commit()
        elif args.command == "lookup":
            if not args.allow_network:
                parser.error("OSV lookup requires explicit --allow-network")
            report = lookup_package(con, args.ecosystem, args.package, args.version)
        elif args.command == "search":
            report = {"results": search(con, args.terms, args.limit)}
        elif args.command == "inspect":
            report = {"results": inspect(con, args.id)}
        else:
            report = stats(con)
    print(json.dumps(report, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (KnowledgeError, OSError, ValueError, sqlite3.Error, zipfile.BadZipFile) as exc:
        print("knowledge import/query failed closed: " + type(exc).__name__, file=sys.stderr)
        sys.exit(2)
