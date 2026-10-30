/* Shared biography dialog for links from Stories and Historical Events.
   Content comes exclusively from hall-of-fame-people.json; standalone profiles remain indexable. */
(()=>{'use strict';
const match=href=>{try{const url=new URL(href,location.href);if(url.origin!==location.origin)return null;return url.pathname.match(/^\/people\/([a-z0-9-]+)\.html$/)?.[1]||null}catch{return null}};
const linksSelector='a[href*="/people/"]';
let peoplePromise;
const fetchPeople=()=>peoplePromise??=fetch('/hall-of-fame-people.json').then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}).then(v=>new Map(v.people.map(p=>[p.id,p])));
const isEnglish=()=>document.documentElement.lang.toLowerCase().startsWith('en');
let dlg;
const create=()=>{
 if(dlg)return dlg;
 dlg=document.createElement('dialog');dlg.className='arc-bio-dialog';
 dlg.setAttribute('aria-labelledby','arc-bio-name');
 dlg.innerHTML='<div class="arc-bio-inner"><button class="arc-bio-close" type="button" aria-label="Close">×</button><div class="arc-bio-role"></div><h2 id="arc-bio-name"></h2><div class="arc-bio-text"></div><div class="arc-bio-sources"></div></div>';
 document.body.append(dlg);dlg.querySelector('.arc-bio-close').addEventListener('click',()=>dlg.close());
 dlg.addEventListener('click',e=>{if(e.target===dlg)dlg.close()});return dlg;
};
let current;
const render=p=>{
 const d=create(), en=isEnglish(), t=(el,english)=>en?(english||el):el;
 d.querySelector('.arc-bio-role').textContent=t(p.role,p.role_en);
 d.querySelector('#arc-bio-name').textContent=t(p.name,p.name_en);
 d.querySelector('.arc-bio-text').textContent=t(p.bio,p.bio_en);
 const sources=d.querySelector('.arc-bio-sources');sources.replaceChildren();
 const refs=(p.refs||[]).filter(x=>{try{return ['https:','http:'].includes(new URL(x.url).protocol)}catch{return false}});
 if(refs.length){const label=document.createElement('strong');label.textContent=en?'Sources':'Πηγές';sources.append(label);for(const ref of refs){const a=document.createElement('a');a.href=ref.url;a.rel='noopener noreferrer';a.target='_blank';a.textContent=ref.label||ref.url;sources.append(a)}}
 d.querySelector('.arc-bio-close').setAttribute('aria-label',en?'Close biography':'Κλείσιμο βιογραφικού');
};
document.addEventListener('click',async e=>{
 const link=e.target.closest?.(linksSelector);if(!link||e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||link.hasAttribute('download')||link.target==='_blank')return;
 const id=match(link.href);if(!id)return;
 e.preventDefault();
 try{const people=await fetchPeople(),p=people.get(id);if(!p){location.href=link.href;return}current=p;render(p);if(!dlg.open)dlg.showModal()}catch(err){console.warn('Biography dialog:',err);location.href=link.href}
});
document.addEventListener('archelaos:language-change',()=>{if(current&&dlg?.open)render(current)});
})();