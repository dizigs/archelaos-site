#!/usr/bin/env python3
"""Import the original article's featured image into the site's own news archive.
Skips inaccessible or generic imagery; never fabricates image provenance.
"""
import io, json, re, time
from pathlib import Path
from html.parser import HTMLParser
from urllib.request import Request, urlopen
from urllib.parse import urljoin, urlsplit
from PIL import Image, ImageOps

ROOT=Path(__file__).resolve().parents[1]
INDEX=ROOT/"news.json"
DEST=ROOT/"images"/"news"
UA="Mozilla/5.0 (compatible; ArchelaosNewsArchive/1.0)"
class Metadata(HTMLParser):
    def __init__(self):
        super().__init__()
        self.og_image=None
        self.og_title=None
    def handle_starttag(self, tag, attrs):
        if tag!="meta": return
        d=dict(attrs)
        name=(d.get("property") or d.get("name") or "").lower()
        if name in ("og:image","twitter:image") and not self.og_image: self.og_image=d.get("content")
        if name=="og:title": self.og_title=d.get("content")
def fetch(url,max_bytes=9000000):
    if urlsplit(url).scheme!="https": raise ValueError("Only HTTPS image sources allowed")
    req=Request(url,headers={"User-Agent":UA,"Accept":"text/html,image/*;q=0.9,*/*;q=0.8"})
    with urlopen(req,timeout=15) as response:
        if urlsplit(response.geturl()).scheme!="https": raise ValueError("Unsafe redirect")
        data=response.read(max_bytes+1)
        if len(data)>max_bytes: raise ValueError("Resource too large")
        return data
def main():
    data=json.loads(INDEX.read_text("utf-8"))
    DEST.mkdir(parents=True,exist_ok=True)
    changed=0
    for item in data["items"]:
        url=item.get("sourceUrl")
        if not url or not url.startswith("https://"): continue
        # Never overwrite vetted archive photos or the supplied Meteora photo.
        if item.get("image","").startswith("images/news/"): continue
        if item.get("id")=="wrestling-meteora-international-2026": continue
        # If the source has no confirmed picture, never reuse the department
        # slideshow or import a newspaper's generic social preview.
        if not item.get("image") and not item.get("imageSourceUrl"): continue
        try:
            vetted=item.get("imageSourceUrl")
            if vetted:
                candidate=vetted
            else:
                html=fetch(url,2500000).decode("utf-8","replace")
                meta=Metadata();meta.feed(html)
                if not meta.og_image: raise ValueError("No article photo metadata")
                candidate=urljoin(url,meta.og_image)
            path=urlsplit(candidate).path.lower()
            if re.search(r"(?:logo|favicon|placeholder|default-image|no-image|social-preview|avatar)",path):
                raise ValueError("Generic image not suitable for article")
            try:
                raw=fetch(candidate)
            except Exception:
                # WordPress proxy occasionally blocks image requests.
                parts=urlsplit(candidate)
                if not parts.hostname or not parts.hostname.endswith(".wp.com"):
                    raise
                origin="https://"+parts.path.lstrip("/")
                raw=fetch(origin)
            with Image.open(io.BytesIO(raw)) as original:
                im=ImageOps.exif_transpose(original)
                if im.width<400 or im.height<250: raise ValueError("Featured image too small")
                im=im.convert("RGB")
                im.thumbnail((1600,1200))
                bio=io.BytesIO();im.save(bio,format="JPEG",quality=84,optimize=True)
            rel="images/news/"+item["id"]+".jpg"
            (ROOT/rel).write_bytes(bio.getvalue())
            item["image"]=rel
            item["imageNote"]="Φωτογραφία από το αρχικό δημοσίευμα: "+item.get("source","πηγή άρθρου")
            item["imageSourceUrl"]=candidate
            print("IMPORTED",item["id"],candidate)
            changed+=1
        except Exception as error:
            print("SKIPPED",item["id"],str(error)[:180])
        time.sleep(0.2)
    if changed:
        INDEX.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"Imported {changed} article photographs.")
if __name__=="__main__": main()
