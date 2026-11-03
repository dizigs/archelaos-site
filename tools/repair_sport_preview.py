#!/usr/bin/env python3
"""Deterministic self-repair for approved, non-production sport-preview links.

Dry-run default. --apply may write ONLY the isolated prototype HTML. Never touches
production, canonical archive, GA4, DNS, private files or other site pages.
"""
import argparse
import difflib
import json
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlparse

ROOT=Path(__file__).resolve().parents[1]
TARGET=ROOT/"prototypes/sport-site/index.html"
REGISTRY=ROOT/"config/sport-sites.json"
ARCHERY="archery"

class Anchors(HTMLParser):
    def __init__(self):
        super().__init__()
        self.found={}
    def handle_starttag(self,tag,attrs):
        if tag!="a":return
        data=dict(attrs)
        if data.get("id") in {"history-card","hall-card"}:
            self.found[data["id"]]=data.get("href")

def inspect(source):
    parser=Anchors()
    parser.feed(source)
    return parser.found

def repair_preview(source, registry):
    sport=next((d for d in registry["departments"] if d["key"]==ARCHERY),None)
    if not sport:raise ValueError("Missing archery registry")
    expected={"history-card":sport["historyUrl"],"hall-card":sport["peopleUrl"]}
    # Constrain approved endpoints to the central canonical domain.
    for url in expected.values():
        parsed=urlparse(url)
        if parsed.scheme!="https" or parsed.hostname!="archelaos.club":
            raise ValueError("Untrusted central canonical link")
    actual=inspect(source)
    if set(actual)!=set(expected):
        raise ValueError("Cannot uniquely identify both controlled links")
    out=source
    fixes=[]
    for item,wanted in expected.items():
        old=actual[item]
        if old==wanted:continue
        if not isinstance(old,str) or '"' in old or "<" in old or ">" in old:
            raise ValueError("Unsafe current link")
        # Exactly one matching href next to approved ID is required.
        marker='id="'+item+'" href="'+old+'"'
        if out.count(marker)!=1:
            raise ValueError("Unrecognized HTML structure")
        out=out.replace(marker,'id="'+item+'" href="'+wanted+'"',1)
        fixes.append({"id":item,"from":old,"to":wanted})
    return out,fixes

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--check",action="store_true",help="Fail if drift exists")
    parser.add_argument("--apply",action="store_true",help="Apply only safe, scoped preview repairs")
    options=parser.parse_args()
    if options.check and options.apply:parser.error("select check or apply")
    original=TARGET.read_text(encoding="utf-8")
    registry=json.loads(REGISTRY.read_text(encoding="utf-8"))
    new,fixes=repair_preview(original,registry)
    if fixes:
        print("PREVIEW_LINK_DRIFT:",", ".join(x["id"] for x in fixes))
        if options.apply:
            TARGET.write_text(new,encoding="utf-8")
            print("REPAIRED isolated preview file; test and PR review still required")
        else:
            print("DRY_RUN: no writes")
            if options.check:raise SystemExit(1)
    else:
        print("PASS: canonical preview links match registry; no change")
if __name__=="__main__":main()
