#!/usr/bin/env python3
"""Read-only, evidence-preserving crosscheck: explicit personIds and full names."""
import json
import re
import unicodedata
from pathlib import Path
from datetime import datetime, timezone

def norm(value):
    value=unicodedata.normalize('NFD',value.casefold())
    return re.sub(r'[^a-zα-ω0-9 ]+','', ''.join(c for c in value if not unicodedata.combining(c))).strip()
news=json.loads(Path('news.json').read_text(encoding='utf-8'))['items']
people=json.loads(Path('hall-of-fame-people.json').read_text(encoding='utf-8'))['people']
by_id={p['id']:p for p in people}
by_name={}
for p in people: by_name.setdefault(norm(p['name']),[]).append(p)
out={'generated_utc':datetime.now(timezone.utc).isoformat(),'articles_scanned':len(news),'hall_entries':len(people),
     'broken_person_references':[],'unlinked_exact_full_names':[],'ambiguous_full_names':[]}
for item in news:
    title=item.get('title','')
    ids=item.get('personIds') or []
    for pid in ids:
        if pid not in by_id:
            out['broken_person_references'].append({'article_id':item.get('id'),'title':title,'person_id':pid})
    text=' '.join([str(item.get('summary',''))]+[str(v) for v in (item.get('body') or [])])
    normalized=norm(text)
    for full,entries in by_name.items():
        if len(full)<9 or ' ' not in full:continue
        if re.search(r'(?<!\w)'+re.escape(full)+r'(?!\w)',normalized):
            unlinked=[p for p in entries if p['id'] not in ids]
            if not unlinked:continue
            target='ambiguous_full_names' if len(entries)>1 else 'unlinked_exact_full_names'
            out[target].append({'article_id':item.get('id'),'title':title,
                 'names':[{'name':p['name'],'id':p['id']} for p in unlinked[:5]],
                 'note':'Candidate only; a text match is not proof of identity'})
Path('hof-name-audit.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Scanned %d articles and %d people. Missing refs: %d; candidate full names: %d; ambiguous: %d.'%(
 len(news),len(people),len(out['broken_person_references']),len(out['unlinked_exact_full_names']),len(out['ambiguous_full_names'])))
