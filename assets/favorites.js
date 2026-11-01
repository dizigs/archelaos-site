/* Archelaos unified, private on-device favorites: shared with the rebuilt archive. */
(()=>{'use strict';if(window.ArchelaosFavorites)return;
const KEY='archelaos:favorites:v1',MKEY='archelaos:favorites:metadata:v1',MAX=800;
const TYPES=new Set(['person','moment','story','photo','exhibit','interview','news','view','match','page']);
let fallback=[],fallbackMeta={},storageOK=true;
const valid=(t,id)=>TYPES.has(String(t))&&/^[a-zA-Z0-9._:-]{1,170}$/.test(String(id||''));
function get(){try{const d=JSON.parse(localStorage.getItem(KEY)||'{}');return d.version===1&&Array.isArray(d.items)?d.items.filter(x=>valid(x.type,x.id)).slice(0,MAX):[]}catch{return fallback.slice()}}
function meta(){try{const v=JSON.parse(localStorage.getItem(MKEY)||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}catch{return {...fallbackMeta}}}
function has(t,id){return valid(t,id)&&get().some(x=>x.type===t&&x.id===id)}
function refresh(b){const on=has(b.dataset.favoriteKind,b.dataset.favoriteId);b.setAttribute('aria-pressed',String(on));b.setAttribute('aria-label',on?'Αφαίρεση από τα αγαπημένα':'Προσθήκη στα αγαπημένα');b.title=b.getAttribute('aria-label');const sp=b.querySelector('.arch-favorite-symbol');if(sp)sp.textContent=on?'♥':'♡'}
function refreshAll(){document.querySelectorAll('[data-favorite-kind][data-favorite-id]').forEach(refresh);syncCounter()}
function syncCounter(){
 const count=get().length;
 document.querySelectorAll('[data-arch-favorites-count]').forEach(b=>{b.textContent=String(count);b.setAttribute('aria-label',count+' αγαπημένα')});
 document.querySelectorAll('[data-arch-favorites-shortcut]').forEach(a=>{
   const en=document.documentElement.lang==='en';
   a.setAttribute('aria-label',(en?'Saved items: ':'Αγαπημένα: ')+count);
   a.setAttribute('title',(en?'Saved items: ':'Αγαπημένα: ')+count);
 });
}
function makeShortcut(cls){
 const a=document.createElement('a');a.href='/favorites.html';a.className='arch-favs-shortcut '+cls;a.dataset.archFavoritesShortcut='';
 a.innerHTML='<span class="arch-favs-icon" aria-hidden="true">♥</span><span class="arch-favs-count" data-arch-favorites-count>0</span>';
 return a;
}
function installCounter(){
 const nav=document.getElementById('arch-global-nav-root');
 if(nav){
  const desktop=nav.querySelector('.asn-desktop'),mobile=nav.querySelector('.asn-mobile-actions');
  if(desktop&&!desktop.querySelector('[data-arch-favorites-shortcut]')){
    const anchor=desktop.querySelector('.asn-search-link');const badge=makeShortcut('arch-favs-desktop');
    if(anchor)anchor.before(badge);else desktop.append(badge);
  }
  if(mobile&&!mobile.querySelector('[data-arch-favorites-shortcut]')){
    const anchor=mobile.querySelector('.asn-menu-btn');const badge=makeShortcut('arch-favs-mobile');
    if(anchor)anchor.before(badge);else mobile.append(badge);
  }
  nav.querySelectorAll('a[href$="favorites.html"]').forEach(a=>{
    if(a.hasAttribute('data-arch-favorites-shortcut')||a.querySelector('[data-arch-favorites-count]'))return;
    const small=document.createElement('span');small.className='arch-favs-link-count';small.dataset.archFavoritesCount='';small.textContent='0';
    const arrow=a.querySelector('.asn-m-arrow');if(arrow)arrow.before(small);else a.append(small);
  });
 }
 syncCounter();
}
function initCounter(){
 installCounter();
 // Navigation may be inserted by a deferred script after the favorites module.
 if(!document.getElementById('arch-global-nav-root')){
   let attempts=0;const observer=new MutationObserver(()=>{
     if(document.getElementById('arch-global-nav-root')){observer.disconnect();installCounter()}
     else if(++attempts>60)observer.disconnect();
   });observer.observe(document.documentElement,{childList:true,subtree:true});
   window.addEventListener('load',()=>{installCounter();observer.disconnect()},{once:true});
 }
 const languageObserver=new MutationObserver(syncCounter);
 languageObserver.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 window.addEventListener('pageshow',syncCounter);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initCounter,{once:true});else initCounter();
function save(arr,m){fallback=arr;fallbackMeta=m;try{localStorage.setItem(KEY,JSON.stringify({version:1,items:arr.map(x=>({type:x.type,id:x.id}))}));localStorage.setItem(MKEY,JSON.stringify(m))}catch{storageOK=false}refreshAll();document.dispatchEvent(new CustomEvent('archelaos:favorites-change',{detail:{count:arr.length,persistent:storageOK}}))}
function toggle(type,id,info){if(!valid(type,id))return false;let a=get(),m=meta(),at=a.findIndex(x=>x.type===type&&x.id===id);if(at<0){if(a.length>=MAX)return false;a.unshift({type,id});if(info)m[type+':'+id]={title:String(info.title||'').slice(0,250),href:String(info.href||'').slice(0,500),summary:String(info.summary||'').slice(0,350)}}else{a.splice(at,1);delete m[type+':'+id]}save(a,m);return at<0}
function button(type,id,cls='',info){const b=document.createElement('button');b.type='button';b.className='arch-favorite-toggle'+(cls?' '+cls:'');b.dataset.favoriteKind=type;b.dataset.favoriteId=id;b.innerHTML='<span class="arch-favorite-symbol" aria-hidden="true">♡</span>';b.addEventListener('click',e=>{e.stopPropagation();e.preventDefault();toggle(type,id,info||b._favoriteInfo)});b._favoriteInfo=info||null;refresh(b);return b}
function clear(){save([],{})}
window.addEventListener('storage',e=>{if(e.key===KEY||e.key===MKEY)refreshAll()});
window.ArchelaosFavorites=Object.freeze({live:true,get,has,toggle,clear,button,meta,persistent:()=>storageOK});
})();
