#!/usr/bin/env python3
"""No-network tests for the scheduled live health monitor."""
from __future__ import annotations
import importlib.util
from hashlib import sha256
import json
from pathlib import Path
from unittest.mock import patch
from urllib.error import URLError

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("live_health", ROOT / "tools" / "live_site_health.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

breakpoints = ("mobile", "tablet", "laptop", "desktop", "accessibility")
css = {name: (".arch-" + name + "{display:block}").encode() for name in breakpoints}
css_hashes = {name: sha256(body).hexdigest()[:12] for name, body in css.items()}
viewports = ("\\n".join(
    '@import url("./' + name + '.css?v=' + css_hashes[name] + '");'
    for name in breakpoints
)).encode()
viewhash = sha256(viewports).hexdigest()[:12]
shell = b"/* A valid shared shell script */"
shellhash = sha256(shell).hexdigest()[:12]
html = (
    '<!doctype html><html><head><link rel="stylesheet" href="/assets/site/css/viewports.css?v=' + viewhash + '">'
    '<script defer src="/assets/site/js/shell.js?v=' + shellhash + '"></script></head>'
    '<body><main><div data-dp-open="archery"></div>'
    '<input id="sr-query"><div id="sr-results"></div></main></body></html>'
).encode()
datasets = {
    name: {key: [{"id": f"arch-{i:012x}"} for i in range(minimum)]
           if key == "people" else [{} for _ in range(minimum)]}
    for name, (key, minimum) in m.DATA.items()
}
content = {page: html for page in m.PAGES}
content.update({name: json.dumps(data).encode() for name, data in datasets.items()})
content.update({
    "/robots.txt": b"User-agent: *\nSitemap: https://archelaos.club/sitemap.xml\n",
    "/sitemap.xml": b"<sitemapindex></sitemapindex>",
    "/site.webmanifest": b'{"name":"Archelaos"}',
})
content["/assets/site/css/viewports.css?v=" + viewhash] = viewports
content["/assets/site/js/shell.js?v=" + shellhash] = shell
for name in breakpoints:
    content["/assets/site/css/" + name + ".css?v=" + css_hashes[name]] = css[name]
for i in range(2):
    content[f"/people/arch-{i:012x}.html"] = html

def fake_fetch(base, route):
    if route not in content:
        raise RuntimeError("404 " + route)
    return content[route], {"cache-control": "no-store"}

with patch.object(m, "fetch", fake_fetch):
    report = m.audit("https://archelaos.club")
assert not report["errors"], report
assert report["counts"]["people"] == 682 and report["counts"]["moments"] == 70
assert "/search.html" in report["checked"]
assert len(report["checked"]) >= 25

def corrupt_mobile(base, route):
    if route == "/assets/site/css/mobile.css?v=" + css_hashes["mobile"]:
        return b"stale mobile css", {}
    return fake_fetch(base, route)
with patch.object(m, "fetch", corrupt_mobile):
    broken = m.audit("https://archelaos.club")
assert any("Responsive CSS fingerprint mismatch: mobile" in message for message in broken["errors"]), broken

with patch.object(m, "fetch", side_effect=RuntimeError("network unavailable")) as error_source:
    result = m.audit("https://archelaos.club")
assert result["errors"] and error_source.call_count == 1, "Fail fast on unreachable homepage"

def truncated(base, route):
    if route == "/assets/site/data/people.json":
        return b'{"people":[{}]}', {}
    return fake_fetch(base, route)
with patch.object(m, "fetch", truncated):
    result = m.audit("https://archelaos.club")
assert any("people count below 682" in error for error in result["errors"]), result

class R:
    status = 200
    headers = {"Cache-Control": "no-store"}
    def __init__(self, url): self.url = url
    def __enter__(self): return self
    def __exit__(self, *args): return False
    def geturl(self): return self.url
    def read(self, n): return b"<main></main>"
with patch.object(m, "urlopen", side_effect=lambda req, timeout: R("https://elsewhere.example/")):
    with patch.object(m.time, "sleep", return_value=None):
        try:
            m.fetch("https://archelaos.club", "/")
            raise AssertionError("Unexpected redirect was permitted")
        except RuntimeError as e:
            assert "Unexpected redirect" in str(e)

print("LIVE HEALTH SELF-TEST OK: archive, network, responsive CSS hash and redirect controls.")
