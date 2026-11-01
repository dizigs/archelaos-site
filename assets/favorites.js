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
function refreshAll(){document.querySelectorAll('[data-favorite-kind][data-favorite-id]').forEach(refresh)}
function save(arr,m){fallback=arr;fallbackMeta=m;try{localStorage.setItem(KEY,JSON.stringify({version:1,items:arr.map(x=>({type:x.type,id:x.id}))}));localStorage.setItem(MKEY,JSON.stringify(m))}catch{storageOK=false}refreshAll();document.dispatchEvent(new CustomEvent('archelaos:favorites-change',{detail:{count:arr.length,persistent:storageOK}}))}
function toggle(type,id,info){if(!valid(type,id))return false;let a=get(),m=meta(),at=a.findIndex(x=>x.type===type&&x.id===id);if(at<0){if(a.length>=MAX)return false;a.unshift({type,id});if(info)m[type+':'+id]={title:String(info.title||'').slice(0,250),href:String(info.href||'').slice(0,500),summary:String(info.summary||'').slice(0,350)}}else{a.splice(at,1);delete m[type+':'+id]}save(a,m);return at<0}
function button(type,id,cls='',info){const b=document.createElement('button');b.type='button';b.className='arch-favorite-toggle'+(cls?' '+cls:'');b.dataset.favoriteKind=type;b.dataset.favoriteId=id;b.innerHTML='<span class="arch-favorite-symbol" aria-hidden="true">♡</span>';b.addEventListener('click',e=>{e.stopPropagation();e.preventDefault();toggle(type,id,info||b._favoriteInfo)});b._favoriteInfo=info||null;refresh(b);return b}
function clear(){save([],{})}
window.addEventListener('storage',e=>{if(e.key===KEY||e.key===MKEY)refreshAll()});
window.ArchelaosFavorites=Object.freeze({live:true,get,has,toggle,clear,button,meta,persistent:()=>storageOK});
})();
