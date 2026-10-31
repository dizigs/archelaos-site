#!/usr/bin/env python3
"""Mutation-style regression tests: a passing preflight must detect real defects.

Every fixture uses a temporary directory. No repository source, live site or
real dist/ release is modified.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path
from tempfile import TemporaryDirectory

MODULE = Path(__file__).resolve().parents[1] / "tools" / "preflight.py"
spec = importlib.util.spec_from_file_location("archelaos_preflight", MODULE)
assert spec is not None and spec.loader is not None
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

GOOD_HEADERS = (
    "/*\n"
    "  X-Content-Type-Options: nosniff\n"
    "  X-Frame-Options: DENY\n"
    "  Referrer-Policy: strict-origin-when-cross-origin\n"
    "  Permissions-Policy: camera=()\n"
    "\n/assets/site/*\n"
    "  Cache-Control: public, max-age=0, must-revalidate\n"
)


def fixture(modify=None):
    original = audit.DIST
    try:
        with TemporaryDirectory(prefix="archelaos-preflight-") as temp:
            root = Path(temp) / "dist"
            root.mkdir()
            (root / "index.html").write_text(
                '<!doctype html><html><body><h1 id="home">Test</h1></body></html>',
                encoding="utf-8")
            (root / "_headers").write_text(GOOD_HEADERS, encoding="utf-8")
            (root / "_redirects").write_text("", encoding="utf-8")
            if modify:
                modify(root)
            audit.DIST = root
            return audit.check_release()
    finally:
        audit.DIST = original


def kinds(report, severity="errors"):
    return {finding["kind"] for finding in report[severity]}


def modify_html(root, html):
    (root / "index.html").write_text(html, encoding="utf-8")


def must_find(name, report, kind, severity="errors"):
    found = kinds(report, severity)
    assert kind in found, (name, severity, kind, found)


def main():
    clean = fixture()
    assert kinds(clean) == {"missing-pages"}, kinds(clean)
    assert not clean["warnings"], clean["warnings"]

    missing = fixture(lambda root: modify_html(
        root, '<script src="/lost.js"></script><img src="/missing.png" alt="">'))
    must_find("missing scripts", missing, "broken-local-script")
    must_find("missing images", missing, "broken-local-img")

    duplicate = fixture(lambda root: modify_html(
        root, '<main id="same"></main><footer id="same"></footer>'))
    must_find("duplicate IDs", duplicate, "duplicate-id")

    cycle = fixture(lambda root: (root / "_redirects").write_text(
        "/old /new 301\n/new /old 301\n", encoding="utf-8"))
    must_find("redirect cycles", cycle, "redirect-cycle")

    bad_cache = fixture(lambda root: (root / "_headers").write_text(
        GOOD_HEADERS.replace("max-age=0, must-revalidate", "max-age=86400"),
        encoding="utf-8"))
    must_find("stale assets", bad_cache, "stale-assets")

    unprotected = fixture(lambda root: (root / "_headers").write_text(
        GOOD_HEADERS.replace("X-Frame-Options: DENY\n", ""), encoding="utf-8"))
    must_find("clickjacking protection", unprotected, "security-header")

    private = fixture(lambda root: (root / ".env.production").write_text(
        "FAKE_ONLY=fixture\n", encoding="utf-8"))
    must_find("accidental private release", private, "private-file")

    traversal = fixture(lambda root: modify_html(
        root, '<a href="../../sensitive.html">Out of release</a>'))
    must_find("path escapes", traversal, "path-escape")

    legacy = fixture(lambda root: (
        (root / "people").mkdir(),
        (root / "people/arch-test.html").write_text(
            '<a href="/deleted-page.html">Old link</a>', encoding="utf-8")))
    must_find("historic links reported", legacy, "broken-local-a", "warnings")
    assert "broken-local-a" not in kinds(legacy), "Legacy warnings must not block blindly"

    remote = fixture(lambda root: modify_html(
        root, '<script src="http://thirdparty.example/widget.js"></script>'))
    must_find("mixed content", remote, "mixed-content", "warnings")
    must_find("third-party JavaScript", remote, "external-script", "warnings")

    print("PREFLIGHT REGRESSION OK: baseline + 10 defect classes checked in isolated temp fixtures.")


if __name__ == "__main__":
    main()
