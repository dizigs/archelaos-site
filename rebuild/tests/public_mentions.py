#!/usr/bin/env python3
"""No-network regression for public mentions and security boundaries."""
import importlib.util
from io import BytesIO
import json
import sys
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
spec=importlib.util.spec_from_file_location("mentions",ROOT/"tools/public_mentions.py")
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
good="""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
 <item><title>ΓΑΣ Αρχέλαος Κατερίνης: Αθλητική εκδήλωση</title>
 <link>https://news.google.com/articles/abc</link>
 <description>Μια δημοσίευση για τον Αρχέλαο Κατερίνης.</description><pubDate>Sun, 01 Nov 2026 09:00:00 GMT</pubDate></item>
 <item><title>Άλλο θέμα</title><link>https://news.google.com/articles/def</link></item>
</channel></rss>""".encode("utf-8")
x=m.parse_feed(good,"test")
assert len(x)==1 and x[0]["status"]=="candidate_unverified" and x[0]["human_review_required"]
assert x[0]["published"].startswith("2026-11-01")
atom="""<feed xmlns="http://www.w3.org/2005/Atom"><entry>
<title>ΓΑΣ Αρχέλαος Κατερίνης</title><link href="https://www.youtube.com/watch?v=example123"/>
<published>2026-11-01T09:00:00Z</published></entry></feed>""".encode("utf-8")
assert len(m.parse_feed(atom,"test-video"))==1
assert not m.parse_feed(b"<rss><channel/></rss>","test")
assert m.allowed_feed("https://news.google.com/rss/search?q=a")
assert m.allowed_feed("https://www.youtube.com/feeds/videos.xml?channel_id=UC"+"a"*22)
for bad in ["http://news.google.com/rss/search?q=x", "https://evil.com/rss/search",
            "https://news.google.com.evil.com/rss/search",
            "https://news.google.com/private", "https://username:pw@news.google.com/rss/search"]:
    assert not m.allowed_feed(bad),bad
cfg=json.loads((ROOT/"research/public-mentions-sources.json").read_text(encoding="utf-8"))
assert cfg["publishing_disabled"] and all(not a["active"] for a in cfg["accounts"])

# Ten additional sport-specific Google News feeds retain the strict public allowlist.
assert len(cfg["feeds"]) == 12, "Expected two existing feeds and ten sport feeds"
assert len(set(f["id"] for f in cfg["feeds"])) == 12
assert all(m.allowed_feed(f["url"]) for f in cfg["feeds"] if f["active"])
for sport in ("χάντμπολ", "στίβος", "ενόργανη", "τοξοβολία",
              "σκοποβολή", "πάλη", "κολύμβηση", "τεχνική κολύμβηση",
              "βόλεϊ", "άρση βαρών"):
    assert m.relevant("Αρχέλαος: " + sport, ""), sport
assert not m.relevant("Νίκη Αιγινίου: νίκη στο βόλεϊ", "")
assert not m.relevant("ΣΦΚ Πιερικός Αρχέλαος: μπάσκετ", "")

class FakeResponse:
    def __enter__(self): return self
    def __exit__(self,*args): return False
    def read(self,limit): return good[:limit]
    def geturl(self): return "https://news.google.com/rss/search?q=x"
def opener(request,timeout): return FakeResponse()
report=m.collect({"schema_version":1,"publishing_disabled":True,
                  "feeds":[{"active":True,"id":"fake","url":"https://news.google.com/rss/search?q=x"}],
                  "accounts":[]},opener)
assert report["candidate_count"]==1 and not report["warnings"]
assert all(x["status"]=="candidate_unverified" for x in report["candidates"])
print("PUBLIC SOCIAL/PRESS MONITOR OK: RSS, Atom, URL whitelist, human-only publication.")
security_spec=importlib.util.spec_from_file_location("mentions_security_checks",ROOT/"tests/public_mentions_security_test.py")
security=importlib.util.module_from_spec(security_spec)
security_spec.loader.exec_module(security)
suite=unittest.defaultTestLoader.loadTestsFromTestCase(security.MentionsSecurity)
assert suite.countTestCases(),"No public-mentions security tests selected"
if not unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful():
    raise SystemExit(1)
