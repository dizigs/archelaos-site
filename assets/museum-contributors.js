/* Public museum contributors: publish only entries explicitly approved in the public registry. */
(()=>{'use strict';
 const section=document.getElementById('museum-contributors-section');
 const list=document.getElementById('museum-contributors-list');
 if(!section||!list)return;
 const text=(node,value)=>{node.textContent=String(value||'');return node};
 const make=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)text(n,value);return n};
 const safeLink=value=>{try{const u=new URL(value,location.origin);return u.origin===location.origin&&['http:','https:'].includes(u.protocol)?u.href:null}catch{return null}};
 Promise.all([
  fetch('/museum-contributors.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('registry');return r.json()}),
  fetch('/hall-of-fame-people.json',{cache:'no-store'}).then(r=>r.ok?r.json():{people:[]})
 ]).then(([registry,hall])=>{
  if(!Array.isArray(registry.contributors))return;
  const known=new Map((hall.people||[]).filter(p=>p&&p.id).map(p=>[p.id,p]));
  const seen=new Set();
  for(const person of registry.contributors){
   if(!person||!person.id||!person.displayName||seen.has(person.id))continue;
   /* This registry contains only approved and consented entries. Never read private intake data. */
   seen.add(person.id);
   const existing=person.personId&&known.get(person.personId);
   const card=make('article');
   card.style.cssText='background:#fffdf8;border:1px solid #d9c9a6;border-radius:18px;padding:24px;box-shadow:0 8px 22px rgba(13,48,31,.045)';
   card.append(make('span','',existing?'ΣΥΝΤΕΛΕΣΤΗΣ · HALL OF FAME':'ΣΥΝΤΕΛΕΣΤΗΣ ΜΟΥΣΕΙΟΥ'));
   card.lastChild.style.cssText='display:block;color:#99763d;font-size:11px;font-weight:800;letter-spacing:.10em;margin-bottom:10px';
   card.append(make('h3','',person.displayName));
   card.lastChild.style.cssText='font:normal 25px Georgia,serif;color:#073d2a;margin:0 0 12px';
   if(person.summary){const p=make('p','',person.summary);p.style.cssText='line-height:1.65;color:#3a5144;margin:0 0 14px';card.append(p)}
   const contributions=Array.isArray(person.contributions)?person.contributions:[];
   const ul=make('ul');ul.style.cssText='list-style:none;padding:0;margin:0;display:grid;gap:11px';
   for(const item of contributions){
    if(!item)continue;
    const li=make('li');
    if(item.summary)li.append(make('div','',item.summary));
    const links=Array.isArray(item.publishedLinks)?item.publishedLinks:[];
    for(const entry of links){const url=safeLink(typeof entry==='string'?entry:entry?.url);if(!url)continue;
     const a=make('a','',typeof entry==='string'?'Δες το τεκμήριο':entry.title||'Δες το τεκμήριο');
     a.href=url;a.style.cssText='display:inline-block;margin:6px 12px 2px 0;color:#876322;font-weight:700;text-decoration:none';li.append(a)}
    if(li.childNodes.length)ul.append(li);
   }
   if(ul.childNodes.length)card.append(ul);
   if(existing){const a=make('a','','Βιογραφικό στο Hall of Fame');a.href='/hall-of-fame.html?person='+encodeURIComponent(person.personId);a.style.cssText='display:inline-block;margin-top:14px;color:#073d2a;font-weight:750';card.append(a)}
   list.append(card);
  }
  if(list.childNodes.length)section.hidden=false;
 }).catch(()=>{/* Keep the section hidden if public data cannot be loaded. */});
})();