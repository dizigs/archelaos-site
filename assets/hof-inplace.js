/* Canonical in-place Hall of Fame popups on every page. */
(()=>{'use strict';
if(window.ArchelaosBio?.__shared)return;
let collection=null, loading=null, dialog=null, previous=null, generation=0, newsLoading=null;
function syncDialogScroll(){
 document.body.classList.toggle('arch-dialog-open',Boolean(document.querySelector('dialog[open]')));
}
// Run after individual close/cancel handlers so a nested biography cannot unlock
// its still-open parent, or leave the page locked after that parent closes.
for(const event of ['toggle','close','cancel'])document.addEventListener(event,e=>{
 if(e.target.matches?.('dialog'))queueMicrotask(syncDialogScroll);
},true);
syncDialogScroll();
const load=()=>{
 if(collection)return Promise.resolve({people:collection});
 if(!loading)loading=fetch('/hall-of-fame-people.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('Hall of Fame data unavailable: '+r.status);return r.json()}).then(d=>{if(!Array.isArray(d.people))throw Error('Invalid Hall collection');collection=d.people;return d}).catch(e=>{loading=null;throw e});
 return loading;
};
// News records are the canonical source of relations; avoid duplicating links in biographies.
const relatedNews=()=>newsLoading??=fetch('/news.json',{cache:'no-cache'})
 .then(r=>{if(!r.ok)throw Error('News unavailable');return r.json()})
 .then(d=>Array.isArray(d.items)?d.items:[])
 .catch(()=>{newsLoading=null;return []});
const el=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e};
const isEn=()=>document.documentElement.lang==='en';
const tr=(a,b)=>isEn()?b:a;
function ensure(){
 if(dialog)return dialog;
 if(!document.getElementById('arch-bio-global-style')){
  const css=el('style');css.id='arch-bio-global-style';
  css.textContent='.arch-bio-global{box-sizing:border-box!important;position:fixed!important;inset:0!important;margin:auto!important;padding:0!important;width:min(720px,calc(100vw - 26px))!important;max-width:720px!important;max-height:min(88dvh,850px)!important;overflow:hidden!important;border:1px solid #d9c397!important;border-radius:23px!important;background:#fffdf8!important;color:#123d2a!important;box-shadow:0 26px 90px #00150f80!important;font:15px/1.7 Inter,system-ui,sans-serif!important}.arch-bio-global::backdrop{background:rgba(0,24,16,.7);backdrop-filter:blur(5px)}.arch-bio-global *{box-sizing:border-box}.arch-bio-scroll{overflow:auto;overscroll-behavior:contain;max-height:min(88dvh,850px);background:linear-gradient(155deg,#fffdf7,#f6eedc)}.arch-bio-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 22px;background:#f2e6ce;border-top:4px solid #c7a65e;border-bottom:1px solid #d8c59d;position:sticky;top:0;z-index:1}.arch-bio-head small{font-size:11px;font-weight:800;letter-spacing:.15em;color:#8d713b}.arch-bio-close{flex-shrink:0;display:grid;place-items:center;width:42px;height:42px;border:1px solid #b99e64;border-radius:11px;background:#fffdf8;color:#093b27;font:25px/1 sans-serif;cursor:pointer}.arch-bio-close:hover{background:#e9d9b5}.arch-bio-close:focus-visible,.arch-bio-sources a:focus-visible{outline:3px solid #a27c33;outline-offset:2px}.arch-bio-content{padding:clamp(23px,4vw,42px)}.arch-bio-role{font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:800;color:#987c41;margin:0 0 14px}.arch-bio-title{font:400 clamp(30px,5vw,43px)/1.2 Georgia,serif!important;margin:0 0 22px!important;color:#073d2a!important;overflow-wrap:anywhere}.arch-bio-description{white-space:pre-line;line-height:1.9!important;font-size:16px!important;color:#344c3d!important;margin:0!important}.arch-bio-sources{margin-top:22px;border-top:1px solid #e4d7b9;padding-top:18px;display:flex;gap:8px;flex-wrap:wrap}.arch-bio-sources a{display:inline-flex;padding:7px 11px;border:1px solid #d6c49c;background:#f9f0de;border-radius:9px;color:#164c32;text-decoration:none;font-size:12px}.arch-bio-sources a:hover{text-decoration:none;background:#e9dbbd}.arch-bio-foot{font-size:10px;color:#99804d;letter-spacing:.16em;font-weight:800;margin-top:26px}@media(max-width:600px){.arch-bio-global{width:calc(100vw - 18px)!important;max-height:88dvh!important}.arch-bio-head{padding:10px 14px}.arch-bio-content{padding:24px 19px}.arch-bio-description{font-size:15px!important}}';
  document.head.append(css);
 }
 dialog=el('dialog','arch-bio-global');dialog.setAttribute('aria-labelledby','arch-bio-global-title');
 const shell=el('div','arch-bio-scroll'),head=el('div','arch-bio-head'),tag=el('small','', 'ΑΡΧΕΛΑΟΣ · HALL OF FAME'),close=el('button','arch-bio-close','×');
 close.type='button';close.setAttribute('aria-label','Κλείσιμο βιογραφικού');close.addEventListener('click',()=>dialog.close());head.append(tag,close);
 const content=el('div','arch-bio-content'),role=el('p','arch-bio-role'),title=el('h2','arch-bio-title'),desc=el('p','arch-bio-description'),sources=el('div','arch-bio-sources'),footer=el('div','arch-bio-foot','70 ΧΡΟΝΙΑ · ΜΙΑ ΙΣΤΟΡΙΑ ΠΟΥ ΣΥΝΕΧΙΖΕΤΑΙ');
 title.id='arch-bio-global-title';content.append(role,title,desc,sources,footer);shell.append(head,content);dialog.append(shell);document.body.append(dialog);
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
 dialog.addEventListener('close',()=>{if(previous?.isConnected)previous.focus({preventScroll:true})});
 return dialog;
}
async function open(id){
 if(!id)return false;
 const token=++generation;
 try{
  const d=await load();if(token!==generation)return false;
  const p=d.people.find(x=>x.id===id);if(!p)return false;
  const modal=ensure();previous=document.activeElement;
  modal.querySelector('.arch-bio-role').textContent=tr(p.role||'',p.role_en||p.role||'');
  modal.querySelector('.arch-bio-title').textContent=tr(p.name||'',p.name_en||p.name||'');
  modal.querySelector('.arch-bio-description').textContent=tr(p.bio||'',p.bio_en||p.bio||'');
  const box=modal.querySelector('.arch-bio-sources');box.replaceChildren();
  if(Array.isArray(p.refs))p.refs.forEach(ref=>{
   if(!/^https:\/\//.test(ref.url||''))return;
   const a=el('a','',ref.label||'Πηγή');a.href=ref.url;a.target='_blank';a.rel='noopener noreferrer';box.append(a);
  });
  // Add direct links to published news related to this exact person ID.
  void relatedNews().then(items=>{
   if(token!==generation||!modal.isConnected)return;
   const matches=items.filter(x=>!x.unverified&&Array.isArray(x.personIds)&&x.personIds.includes(p.id))
     .sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
   if(!matches.length)return;
   const title=el('strong','arch-bio-related-title','Σχετικές ειδήσεις');
   title.style.cssText='width:100%;color:#80662f;font-size:12px;letter-spacing:.08em';
   box.append(title);
   for(const item of matches){
    // Facts are sourced per canonical person ID; never infer a result from a mere name mention.
    const fact=item.personFacts?.[p.id];
    if(typeof fact==='string'&&fact.trim()&&/^https:\/\//.test(item.sourceUrl||'')){
     const note=el('p','arch-bio-sourced-fact',fact);
     note.style.cssText='flex:0 0 100%;font-size:13px;line-height:1.6;margin:8px 0 0;color:#344c3d';
     box.append(note);
    }
    const a=el('a','arch-bio-news-link',item.title||'Δείτε την είδηση');
    a.href='/news.html?article='+encodeURIComponent(item.id);
    a.title='Άνοιγμα είδησης — '+(item.date||'');
    box.append(a);
   }
  });
  void window.ArchelaosLinks?.append(box,'person',p.id,{limit:8,excludeKinds:['news']});
  if(!modal.open)modal.showModal();
  syncDialogScroll();
  modal.querySelector('.arch-bio-scroll').scrollTop=0;
  modal.querySelector('.arch-bio-close').focus({preventScroll:true});
  return true;
 }catch(e){console.warn('Cannot open biography in place',e);return false}
}
function personId(a){
 if(a.dataset.archBioId)return a.dataset.archBioId;
 const href=a.getAttribute('href')||'';
 if(!/hall-of-fame\.html\?person=|(?:^|\/)people\/arch-[^/]+\.html/.test(href))return null;
 try{
  const url=new URL(href,location.href);if(url.origin!==location.origin)return null;
  if(/hall-of-fame\.html$/.test(url.pathname))return url.searchParams.get('person');
  return url.pathname.match(/\/people\/(arch-[a-zA-Z0-9._:-]+)\.html$/)?.[1]||null;
 }catch(e){return null}
}
document.addEventListener('click',e=>{
 const a=e.target.closest?.('a[href],button[data-arch-bio-id]');if(!a)return;
 if(e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||a.target==='_blank'||a.hasAttribute('download'))return;
 const id=personId(a);if(!id)return;
 e.preventDefault();e.stopPropagation();void open(id);
},true);
window.ArchelaosBio=Object.freeze({...window.ArchelaosBio,load,open,__shared:true});
})();
