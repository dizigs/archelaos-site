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
        self.images=[]
        self.linked=[]
    def handle_starttag(self, tag, attrs):
        d=dict(attrs)
        if tag=="meta":
            name=(d.get("property") or d.get("name") or "").lower()
            if name in ("og:image","og:image:url","twitter:image") and d.get("content"):
                self.linked.append(d["content"])
                if not self.og_image: self.og_image=d["content"]
            if name=="og:title": self.og_title=d.get("content")
        elif tag=="link" and "image_src" in d.get("rel","") and d.get("href"):
            self.linked.append(d["href"])
        elif tag=="img":
            # In-content and lazy-loaded WordPress/Joomla image URLs.
            for key in ("data-large-file","data-src","data-lazy-src","src"):
                if d.get(key): self.images.append((d[key],d.get("alt","")))
            if d.get("srcset"):
                self.images.extend((v.strip().split()[0],d.get("alt","")) for v in d["srcset"].split(",") if v.strip())
def fetch(url,max_bytes=9000000):
    if urlsplit(url).scheme!="https": raise ValueError("Only HTTPS image sources allowed")
    req=Request(url,headers={"User-Agent":UA,"Accept":"text/html,image/*;q=0.9,*/*;q=0.8"})
    with urlopen(req,timeout=15) as response:
        if urlsplit(response.geturl()).scheme!="https": raise ValueError("Unsafe redirect")
        data=response.read(max_bytes+1)
        if len(data)>max_bytes: raise ValueError("Resource too large")
        return data
def candidates(page_url, html, vetted=None):
    meta=Metadata()
    meta.feed(html)
    entries=[]
    if vetted: entries.append((vetted,"vetted",100))
    entries.extend((url,"featured",80) for url in meta.linked)
    entries.extend((url,alt,40) for url,alt in meta.images)
    seen=set()
    ranked=[]
    for url,alt,base in entries:
        full=urljoin(page_url,url)
        parts=urlsplit(full)
        if parts.scheme!="https" or not parts.hostname or full in seen: continue
        seen.add(full)
        path=parts.path.lower()
        if re.search(r"(?:logo|favicon|placeholder|default-image|no-image|social-preview|avatar|sprite|widget|banner|icon|gravatar)",path): continue
        if re.search(r"(?:\\.svg|\\.gif|\\.ico)(?:$|[?])",full,re.I): continue
        bonus=(15 if "/uploads/" in path or "/images/" in path else 0)
        if any(t in alt.lower() for t in ("αρχέλα","τοξοβ","πάλ","εθνικ","handball","wrestling","archery")): bonus+=8
        ranked.append((base+bonus,full))
    return [u for _,u in sorted(ranked,reverse=True)[:24]]
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
        # Empty articles are eligible for rechecking; this previously skipped all three.
        try:
            html=fetch(url,3500000).decode("utf-8","replace")
            source_images=candidates(url,html,item.get("imageSourceUrl"))
            if not source_images:
                raise ValueError("No credible article image candidates")
            best=None
            rejected=[]
            for candidate in source_images:
                try:
                    try:
                        raw=fetch(candidate)
                    except Exception:
                        # Some WordPress i0.wp.com images are retrievable at origin.
                        parts=urlsplit(candidate)
                        if not parts.hostname or not parts.hostname.endswith(".wp.com"):
                            raise
                        origin="https://"+parts.path.lstrip("/")
                        raw=fetch(origin)
                    with Image.open(io.BytesIO(raw)) as original:
                        im=ImageOps.exif_transpose(original)
                        if im.width<400 or im.height<250:
                            raise ValueError("Image below minimum dimensions")
                        im=im.convert("RGB")
                        im.thumbnail((1600,1200))
                        bio=io.BytesIO()
                        im.save(bio,format="JPEG",quality=84,optimize=True)
                    best=(candidate,bio.getvalue())
                    break
                except Exception as issue:
                    rejected.append(str(issue)[:70])
            if not best: raise ValueError("No downloadable matching image: "+"; ".join(rejected[:3]))
            candidate, photo_bytes=best
            rel="images/news/"+item["id"]+".jpg"
            (ROOT/rel).write_bytes(photo_bytes)
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
