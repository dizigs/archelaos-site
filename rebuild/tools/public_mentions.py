#!/usr/bin/env python3
"""Public press/social RSS intake only. Produces review candidates, NEVER edits the site.

No Facebook/Instagram scraping, login or automatic account API access.
No private Google Drive sources. Feed URLs are strictly allowlisted.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET
from html import unescape

ROOT = Path(__file__).resolve().parents[1]
DEFAULT = ROOT / "research" / "public-mentions-sources.json"
LIMIT = 1_000_000
ATOM = "{http://www.w3.org/2005/Atom}"


def normalize(value: str) -> str:
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", value.lower())
                   if unicodedata.category(c) != "Mn").replace("ς", "σ")


def text(value: str | None, length=230) -> str:
    result = re.sub(r"\s+", " ", re.sub(r"<[^>]*>", " ", unescape(value or ""))).strip()
    return result[:length]


def allowed_feed(url: str) -> bool:
    try:
        p = urlsplit(url)
        if p.scheme != "https" or p.username or p.password or p.port:
            return False
        return ((p.hostname == "news.google.com" and p.path == "/rss/search")
                or (p.hostname in ("www.youtube.com", "youtube.com")
                    and p.path == "/feeds/videos.xml"
                    and re.fullmatch(r"channel_id=UC[A-Za-z0-9_-]{20,30}", p.query or "") is not None))
    except ValueError:
        return False


def date(value: str | None) -> str:
    if not value:
        return ""
    try:
        return parsedate_to_datetime(value).astimezone(timezone.utc).isoformat()
    except (ValueError, TypeError, IndexError):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).isoformat()
        except ValueError:
            return ""


def relevant(title: str, summary: str) -> bool:
    t = normalize(title + " " + summary)
    return (("αρχελα" in t and any(x in t for x in ("κατεριν", "γασ ", "τοξοβολ", "handball",
                                                    "χαντμπολ", "βολει", "στιβο", "παλη")))
            or "gas archelaos katerinis" in t)


def parse_feed(xml: bytes, feed_id: str) -> list[dict]:
    if len(xml) > LIMIT:
        raise ValueError("Feed exceeds byte limit")
    root = ET.fromstring(xml)
    items = []
    for e in list(root.findall("./channel/item"))[:40] + list(root.findall(ATOM + "entry"))[:40]:
        title = text(e.findtext("title") or e.findtext(ATOM + "title"), 200)
        summary = text(e.findtext("description") or e.findtext(ATOM + "summary"), 200)
        href = e.findtext("link")
        if href is None:
            links = e.findall(ATOM + "link")
            href = next((x.get("href") for x in links if x.get("rel", "alternate") == "alternate"), None)
        if not title or not href or not relevant(title, summary):
            continue
        p = urlsplit(href.strip())
        if p.scheme != "https" or not p.hostname or p.username or p.password:
            continue
        items.append({"source_id":feed_id,"title":title,"url":href.strip(),
                      "published":date(e.findtext("pubDate") or e.findtext(ATOM + "published")),
                      "summary_excerpt":summary,"status":"candidate_unverified",
                      "human_review_required":True})
    return items


def collect(config: dict, opener=urlopen) -> dict:
    if config.get("schema_version") != 1 or config.get("publishing_disabled") is not True:
        raise ValueError("Source registry must disable publication")
    found = []
    warnings = []
    feeds = config.get("feeds", [])
    if len(feeds) > 12:
        raise ValueError("Excessive feed count")
    for entry in feeds:
        if not entry.get("active"):
            continue
        url = entry.get("url", "")
        if not allowed_feed(url):
            warnings.append(str(entry.get("id")) + ": feed URL not allowlisted")
            continue
        try:
            req = Request(url, headers={"Accept":"application/rss+xml, application/atom+xml, application/xml",
                                         "User-Agent":"ArchelaosPublicResearch/1.0"})
            # No cookies or credentials; bounded request, no social-network scraping.
            with opener(req, timeout=15) as response:
                # Do not follow provider redirects to an unapproved host.
                if not allowed_feed(response.geturl()):
                    raise ValueError("Feed redirected outside allowlist")
                body = response.read(LIMIT + 1)
            found.extend(parse_feed(body, str(entry["id"])))
        except (OSError, ValueError, ET.ParseError, KeyError) as error:
            warnings.append(str(entry.get("id")) + ": unavailable (" + type(error).__name__ + ")")
    unique = {x["url"]:x for x in found}
    return {
        "schema_version":1,
        "generated_at":datetime.now(timezone.utc).isoformat(),
        "purpose":"Private editorial review of PUBLIC mentions only; no verified achievements or automatic articles",
        "accounts_waiting_for_authorized_access":[a["platform"] for a in config.get("accounts",[]) if not a.get("active")],
        "candidate_count":len(unique),
        "candidates":list(unique.values())[:80],
        "warnings":warnings,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config",type=Path,default=DEFAULT)
    parser.add_argument("--output",type=Path,default=ROOT/"test-artifacts"/"public-mentions.json")
    args = parser.parse_args()
    config = json.loads(args.config.read_text(encoding="utf-8"))
    report = collect(config)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("PUBLIC MENTIONS:",report["candidate_count"],"unverified candidates,",
          len(report["warnings"]),"feed warnings; published: 0")
    return 0 if not report["warnings"] else 1


if __name__ == "__main__":
    sys.exit(main())
