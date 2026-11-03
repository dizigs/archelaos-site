#!/usr/bin/env python3
"""Validate planning registry for future sport subdomains, without network calls."""
import json
import pathlib
import re
from urllib.parse import urlparse

ROOT = pathlib.Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/sport-sites.json"
VALID_STATES = {"existing-rebuild-planned", "planned", "candidate"}
VALID_HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")
VALID_KEY = re.compile(r"^[a-z][a-z0-9-]*$")

def validate(payload):
    errors=[]
    if payload.get("canonicalSite")!="https://archelaos.club":
        errors.append("canonicalSite must be archelaos.club")
    rows=payload.get("departments")
    if not isinstance(rows,list) or not rows:
        return ["departments must be a nonempty list"]
    keys=set()
    hosts=set()
    for i,d in enumerate(rows):
        if not isinstance(d,dict):
            errors.append(f"departments[{i}] must be an object")
            continue
        key=d.get("key","")
        host=d.get("hostname","")
        if not isinstance(key,str) or not VALID_KEY.fullmatch(key):
            errors.append(f"invalid key at index {i}")
            continue
        if key in keys:
            errors.append(f"duplicate key {key}")
        keys.add(key)
        if host!=f"{key}.archelaos.club" or host in hosts:
            errors.append(f"invalid or duplicate hostname {host}")
        hosts.add(host)
        if d.get("state") not in VALID_STATES:
            errors.append(f"invalid state: {key}")
        for field in ("historyUrl","peopleUrl"):
            value=d.get(field,"")
            url=urlparse(value)
            if url.scheme!="https" or url.hostname!="archelaos.club" or not url.path:
                errors.append(f"invalid central {field}: {key}")
        theme=d.get("theme",{})
        for field in ("primary","accent","background"):
            if not isinstance(theme.get(field),str) or not VALID_HEX.fullmatch(theme[field]):
                errors.append(f"invalid theme {field}: {key}")
        analytics=d.get("analytics",{})
        if analytics.get("siteSection")!=key:
            errors.append(f"analytics section mismatch: {key}")
        if analytics.get("propertyMode")!="shared-proposed":
            errors.append(f"analytics mode is not provisional: {key}")
    return errors

if __name__=="__main__":
    errors=validate(json.loads(CONFIG.read_text(encoding="utf-8")))
    if errors:
        raise SystemExit("\n".join(errors))
    print("PASS: sport-site registry structure and central canonical links are valid")
