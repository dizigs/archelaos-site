#!/usr/bin/env python3
"""Offline, read-only pre-deployment risk scanner for the GENERATED dist/ tree.

Scans every page, including all 682 historic profiles. Does not claim to test
external servers, runtime browser behavior, malware or real user performance.
Critical problems fail --strict; inherited legacy issues remain visible as
warnings until reviewed, rather than being silently ignored or mass rewritten.
"""
from __future__ import annotations

import argparse
from collections import Counter
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / "dist"
CORE = {x["file"] for x in json.loads(
    (ROOT / "rebuild/seo/metadata.json").read_text(encoding="utf-8")
)["pages"]}
HOST = "archelaos.club"
RESOURCE_TAGS = {"script": "src", "img": "src", "iframe": "src",
                 "source": "src", "video": "src", "audio": "src"}
STRICT_ASSETS = {"script", "stylesheet", "manifest", "icon", "img", "source"}
MAX_REPORTED_CONSOLE = 12


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.refs: list[tuple[str, str, dict[str, str]]] = []
        self.ids: list[str] = []
        self.missing_alts = 0
        self.blank_unsafe = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get("id"):
            self.ids.append(a["id"])
        if tag == "img" and "alt" not in a:
            self.missing_alts += 1
        if tag == "a" and a.get("target", "").lower() == "_blank":
            rel = set(a.get("rel", "").lower().split())
            if "noopener" not in rel and "noreferrer" not in rel:
                self.blank_unsafe += 1
        if tag == "link":
            rel = a.get("rel", "").lower().split()
            if any(x in rel for x in ("stylesheet", "icon", "manifest", "preload")):
                if a.get("href"):
                    self.refs.append(("stylesheet" if "stylesheet" in rel else
                                     ("manifest" if "manifest" in rel else "icon"),
                                     a["href"], a))
        elif tag == "a" and a.get("href"):
            self.refs.append(("a", a["href"], a))
        elif tag in RESOURCE_TAGS and a.get(RESOURCE_TAGS[tag]):
            self.refs.append((tag, a[RESOURCE_TAGS[tag]], a))


def check_release() -> dict:
    if not DIST.is_dir():
        raise SystemExit("dist/ missing; run python rebuild/tools/build_release.py first")
    errors: list[dict] = []
    warnings: list[dict] = []
    checked = 0
    local_refs = 0
    external_refs = 0

    def issue(level: str, kind: str, file: str, detail: str):
        (errors if level == "error" else warnings).append(
            {"kind": kind, "file": file, "detail": detail[:240]})

    htmls = sorted(DIST.rglob("*.html"))
    if len(htmls) < 695:
        issue("error", "missing-pages", "dist/", "Expected 13 core pages plus 682 biographies")
    redirects: dict[str, str] = {}
    redirects_file = DIST / "_redirects"
    if not redirects_file.is_file():
        issue("error", "missing-redirects", "_redirects", "Historic URL migrations are missing")
    else:
        for n, line in enumerate(redirects_file.read_text(encoding="utf-8").splitlines(), 1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if len(parts) != 3 or parts[2] not in {"301", "302", "307", "308"}:
                issue("error", "invalid-redirect", "_redirects", "line " + str(n))
                continue
            src, dst, _ = parts
            if src in redirects:
                issue("error", "duplicate-redirect", "_redirects", src)
            redirects[src] = dst
        for src in redirects:
            visited = set()
            current = src
            while current in redirects:
                if current in visited:
                    issue("error", "redirect-cycle", "_redirects", src)
                    break
                visited.add(current)
                current = redirects[current]

    headers_file = DIST / "_headers"
    headers = headers_file.read_text(encoding="utf-8") if headers_file.is_file() else ""
    for token in ("X-Content-Type-Options: nosniff",
                  "X-Frame-Options: DENY",
                  "Referrer-Policy: strict-origin-when-cross-origin",
                  "Permissions-Policy:"):
        if token not in headers:
            issue("error", "security-header", "_headers", "Missing " + token)
    asset_rule = re.search(r"(?m)^/assets/site/\*\s*\n\s*Cache-Control:\s*([^\n]+)", headers)
    if not asset_rule or not (
        "no-cache" in asset_rule.group(1) or
        ("max-age=0" in asset_rule.group(1) and
         "must-revalidate" in asset_rule.group(1))
    ):
        issue("error", "stale-assets", "_headers",
              "Unversioned JavaScript/CSS/JSON must revalidate before reuse")

    for file in DIST.rglob("*"):
        rel = file.relative_to(DIST).as_posix()
        if any(p in {".git", ".github", "node_modules", ".archive-intake",
                     "rebuild", "test-artifacts"} for p in file.parts):
            issue("error", "private-path", rel, "Developer or private content in release")
        if file.is_file() and (file.name.startswith(".env") or
                              file.suffix.lower() in {".pem", ".key", ".sqlite", ".db", ".bak"}):
            issue("error", "private-file", rel, "Potential secret/backup included in public release")

    for file in htmls:
        checked += 1
        rel = file.relative_to(DIST).as_posix()
        is_core = rel in CORE
        source = file.read_text(encoding="utf-8")
        page = Page()
        try:
            page.feed(source)
        except Exception as exc:
            issue("error" if is_core else "warning", "invalid-html", rel, str(exc))
            continue
        repeats = [k for k, n in Counter(page.ids).items() if n > 1]
        if repeats:
            issue("error" if is_core else "warning", "duplicate-id", rel,
                  ", ".join(repeats[:8]))
        if page.missing_alts and is_core:
            issue("warning", "missing-alt", rel, str(page.missing_alts) + " image(s)")
        if page.blank_unsafe:
            issue("warning", "external-tab", rel,
                  str(page.blank_unsafe) + " target=_blank link(s) without explicit noopener")
        if "/rebuild/js/" in source or "/rebuild/css/" in source or "/rebuild/data/" in source:
            issue("error", "preview-path", rel, "Development paths leaked into release")
        if "http://127.0.0.1" in source or "http://localhost" in source:
            issue("warning", "development-host", rel, "Localhost reference in HTML")

        for kind, raw, _attrs in page.refs:
            if raw.startswith(("#", "data:", "blob:", "mailto:", "tel:", "sms:")):
                continue
            parsed = urlsplit(raw)
            if parsed.scheme in ("javascript", "vbscript"):
                issue("warning", "executable-link", rel, raw)
                continue
            if parsed.scheme and parsed.scheme not in {"http", "https"}:
                continue
            if parsed.netloc and parsed.netloc.lower() not in {
                HOST, "www." + HOST
            }:
                external_refs += 1
                if parsed.scheme == "http":
                    issue("warning", "mixed-content", rel, raw)
                if kind == "script":
                    issue("warning", "external-script", rel, raw)
                continue
            if raw.startswith("//") and parsed.netloc:
                external_refs += 1
                continue
            if not parsed.path:
                continue
            if parsed.netloc and parsed.scheme == "http":
                issue("warning", "http-internal", rel, raw)
            path = unquote(parsed.path).replace("\\", "/")
            if path.startswith("/"):
                target = DIST / path.lstrip("/")
            else:
                target = file.parent / path
            resolved = target.resolve()
            if not resolved.is_relative_to(DIST.resolve()):
                issue("error", "path-escape", rel, raw)
                continue
            if path == "/" or resolved.is_dir():
                resolved = resolved / "index.html"
            if kind == "a" and parsed.path in redirects:
                continue
            local_refs += 1
            if not resolved.is_file():
                level = "error" if is_core or kind in {"script", "stylesheet", "manifest", "icon"} else "warning"
                issue(level, "broken-local-" + kind, rel, raw)

    report = {
        "scope": "all generated release HTML; offline only, no deployment",
        "html_scanned": checked,
        "local_references": local_refs,
        "external_references": external_refs,
        "redirects": len(redirects),
        "errors": errors,
        "warnings": warnings,
        "warning_types": dict(Counter(x["kind"] for x in warnings)),
        "error_types": dict(Counter(x["kind"] for x in errors)),
        "limitations": [
            "Does not resolve JavaScript-generated routes or dynamic DOM anchors",
            "Does not test availability or copyright of externally hosted images",
            "Does not prove freedom from XSS or full WCAG conformance",
            "Legacy biography link/image warnings require editorial review"
        ]
    }
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", type=Path, help="Optional report destination")
    parser.add_argument("--strict", action="store_true", help="Fail on critical findings")
    args = parser.parse_args()
    report = check_release()
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                             encoding="utf-8")
    print("PREFLIGHT:", report["html_scanned"], "HTML;",
          report["local_references"], "local links/assets;",
          report["external_references"], "external links/assets;",
          len(report["errors"]), "errors;",
          len(report["warnings"]), "warnings")
    for x in report["errors"][:MAX_REPORTED_CONSOLE]:
        print("ERROR:", x["kind"], x["file"], x["detail"])
    for x in report["warnings"][:MAX_REPORTED_CONSOLE]:
        print("WARNING:", x["kind"], x["file"], x["detail"])
    if args.strict and report["errors"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
