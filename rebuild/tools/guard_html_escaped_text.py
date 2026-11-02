#!/usr/bin/env python3
"""Prevent visible literal escaped newlines in HTML before any deployment.

Text nodes containing backslash-n, backslash-r or backslash-t usually result
from accidentally inserting escaped source strings into an HTML template.
The guard deliberately ignores script/style/code/pre blocks so JavaScript
string escapes and literal code examples are not mistaken for UI defects.
"""
from __future__ import annotations

import argparse
from html.parser import HTMLParser
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
IGNORED_TAGS = {"script", "style", "code", "pre", "textarea", "template", "noscript"}
ESCAPES = (r"\n", r"\r", r"\t")


class VisibleEscapeInspector(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack: list[str] = []
        self.findings: list[dict] = []

    def handle_starttag(self, tag, attrs):
        if tag not in {"meta", "link", "img", "input", "hr", "br", "source", "area",
                       "base", "col", "embed", "param", "track", "wbr"}:
            self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag in self.stack:
            # HTML in the archive includes legacy non-perfect nesting.
            position = len(self.stack) - 1 - self.stack[::-1].index(tag)
            del self.stack[position:]

    def handle_data(self, data):
        if any(tag in IGNORED_TAGS for tag in self.stack):
            return
        matches = [code for code in ESCAPES if code in data]
        if matches:
            line, col = self.getpos()
            self.findings.append({
                "line": line,
                "column": col + 1,
                "codes": matches,
                "sample": data.strip()[:90],
            })


def find_visible_escapes(source: str) -> list[dict]:
    parser = VisibleEscapeInspector()
    parser.feed(source)
    parser.close()
    return parser.findings


def candidates(include_dist: bool = False):
    roots = [ROOT, ROOT / "rebuild"]
    if include_dist:
        roots.append(ROOT / "dist")
    seen = set()
    for directory in roots:
        for path in directory.glob("*.html"):
            if path in seen:
                continue
            seen.add(path)
            yield path


def audit(include_dist: bool = False) -> list[tuple[Path, dict]]:
    return [(path, finding)
            for path in candidates(include_dist)
            for finding in find_visible_escapes(path.read_text(encoding="utf-8"))]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dist", action="store_true", help="Also validate generated dist HTML")
    args = parser.parse_args()
    problems = audit(args.dist)
    if problems:
        for path, issue in problems[:40]:
            print(f"ERROR HTML_ESCAPED_TEXT {path.relative_to(ROOT)}:{issue['line']}:{issue['column']}"
                  f" {issue['codes']} {issue['sample']!r}")
        print(f"HTML_ESCAPED_TEXT: {len(problems)} bad visible text nodes")
        return 1
    print("HTML_ESCAPED_TEXT: 0 bad visible text nodes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
