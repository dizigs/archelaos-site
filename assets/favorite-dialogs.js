/* Favorite hearts for historical content dialogs, never forms, menus or access settings. */
(()=>{'use strict';
const F=()=>window.ArchelaosFavorites;
const targets=[
 ['person-dialog','#dialog-name','person'],
 ['honors-detail-dialog','#honors-detail-title','view'],
 ['historyArchiveModal','#historyArchiveTitle','view'],
 ['historyPresidentModal','#historyPresidentModalName','view'],
 ['timelineDetailModal','#timelineModalTitle','view'],
 ['deptHistoryModal','#deptModalTitle','view'],
 ['overlay','#reader-title','story'],
 ['archiveStoryModalV56','#archiveStoryHeadingV56','moment'],
 ['pbh-dialog','#pbh-dialog-title','view']
];
let personIndexPromise,personIndex;
const norm=s=>String(s||'').toLocaleLowerCase('el').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ς/g,'σ').replace(/\s+/g,' ').trim();
const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(36)};
async function loadPersons(){
 if(personIndex)return personIndex;
 if(!personIndexPromise)personIndexPromise=fetch('archelaos-person-index.json').then(r=>{if(!r.ok)throw Error('person-index');return r.json()}).then(a=>{const m=new Map();a.forEach(p=>{for(const value of [...(p.names||[]),p.name,p.name_en].filter(Boolean)){const k=norm(value);if(!m.has(k))m.set(k,[]);m.get(k).push(p.id)}});personIndex=m;return m}).catch(()=>new Map());
 return personIndexPromise;
}
function opened(root){
 if(root.tagName==='DIALOG')return root.open;
 if(root.id==='overlay')return root.classList.contains('open')&&root.getAttribute('aria-hidden')!=='true';
 if(root.id==='archiveStoryModalV56')return !root.hidden;
 return root.getAttribute('aria-hidden')==='false'||root.classList.contains('is-open')||root.classList.contains('open');
}
function cleanTitle(root,selector){
 let h=root.querySelector(selector)||root.querySelector('h2,h3');if(!h)return '';
 const visible=[...h.querySelectorAll('[data-lang]')].find(el=>!el.hidden&&getComputedStyle(el).display!=='none');return (visible?.textContent||h.textContent||'').replace(/\s+/g,' ').trim().slice(0,180);
}
function stableId(root,title){return (root.id||'dialog').replace(/[^a-z0-9-]/gi,'')+'-'+hash(location.pathname+'|'+norm(title))}
function mount(root,kind,id,title){
 if(!F()||!id)return;
 const host=root.querySelector('.dialog-inner,.archive-story-panel,.reader,.modal-box,.pbh-dialog-body')||root;
 const existing=host.querySelector('.arch-fav-dialog-heart');
 if(existing?.dataset.favoriteKind===kind&&existing?.dataset.favoriteId===id)return;
 existing?.remove();
 const url=new URL(location.href);url.hash='';const href=url.pathname+url.search;
 const summary=kind==='view'?'Αποθηκευμένο από το '+document.title:'';
 const button=F().button(kind,id,'arch-fav-dialog-heart',{title,href,summary});
 button.setAttribute('data-fav-dialog-title',title);
 const close=root.querySelector('.dialog-close,.reader-buttons .close-btn,.archive-story-close,[data-pbh-close],.modal-close-btn,.v70-archive-close,.an-close,[aria-label="Κλείσιμο"]');
 const container=close?.parentElement;
 if(container&&getComputedStyle(container).display.includes('flex')&&container!==host){container.insertBefore(button,close)}
 else host.append(button);
}
let serial=0;
async function inspect(){
 if(!F())return;
 const seq=++serial;
 for(const [domId,selector,defaultType] of targets){
  const root=document.getElementById(domId);if(!root||!opened(root))continue;
  let title=cleanTitle(root,selector);if(!title)continue;
  let type=defaultType,id=stableId(root,title);
  if(defaultType==='person'){
   const ix=await loadPersons();if(seq!==serial)return;
   const matches=[...new Set(ix.get(norm(title))||[])];if(matches.length===1){type='person';id=matches[0]}else type='view';
  }
  if(defaultType==='story'){
   const candidate=root.querySelector('[data-story-id],[data-id]');const numeric=candidate?.dataset.storyId||candidate?.dataset.id;
   if(/^[1-9]\d{0,3}$/.test(numeric||'')){id=numeric}else{type='view'}
  }
  if(defaultType==='moment'){
   const anchor=document.querySelector('.archive-moment-card:focus,.archive-moment-card[aria-expanded="true"]');const match=anchor?.id?.match(/^moment-(\d{1,2})$/);
   if(match){id=String(Number(match[1]))}else{type='view'}
  }
  mount(root,type,id,title)
 }
}
let scheduled=false;
const queue=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;void inspect()})};
function ready(){
 new MutationObserver(changes=>{
  if(changes.some(c=>c.type==='childList'||c.target?.matches?.('#person-dialog,#dialog-name,#overlay,#reader-title,#archiveStoryModalV56,#historyArchiveModal,#historyPresidentModal,#timelineDetailModal,#deptHistoryModal,#honors-detail-dialog,#pbh-dialog,[id*="Modal"]'))){queue()}
 }).observe(document.body,{attributes:true,childList:true,subtree:true,attributeFilter:['class','open','hidden','aria-hidden']});
 document.addEventListener('click',e=>{if(e.target.closest?.('button,a,[role="button"]'))queue()},true);
 document.addEventListener('archelaos:favorites-change',queue);
 queue();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();