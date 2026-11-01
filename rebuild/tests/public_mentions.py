#!/usr/bin/env python3
"""No-network regression for public mentions and security boundaries."""
import importlib.util
from io import BytesIO
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("mentions",ROOT/"tools/public_mentions.py")
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
good=b"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
 <item><title>ΓΑΣ Αρχέλαος Κατερίνης: Αθλητική εκδήλωση</title>
 <link>https://news.google.com/articles/abc</link>
 <description>Μια δημοσίευση για τον Αρχέλαο Κατερίνης.</description><pubDate>Sun, 01 Nov 2026 09:00:00 GMT</pubDate></item>
 <item><title>Άλλο θέμα</title><link>https://news.google.com/articles/def</link></item>
</channel></rss>"""
x=m.parse_feed(good,"test")
assert len(x)==1 and x[0]["status"]=="candidate_unverified" and x[0]["human_review_required"]
assert x[0]["published"].startswith("2026-11-01")
atom=b"""<feed xmlns="http://www.w3.org/2005/Atom"><entry>
<title>ΓΑΣ Αρχέλαος Κατερίνης</title><link href="https://www.youtube.com/watch?v=example123"/>
<published>2026-11-01T09:00:00Z</published></entry></feed>"""
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
