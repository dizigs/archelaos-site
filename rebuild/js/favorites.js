/* Private device-side favorites. Stores IDs only, never visitor identity or content. */
(function(){'use strict';
const KEY='archelaos:favorites:v1',MAX=800,TYPES=new Set(['person','moment','story','photo','exhibit','interview','news','view','match','page']);
// Historical aliases remain valid for saved favorites and deep links.
const PERSON_ALIASES=Object.freeze({"arch-fani-gkiousoglou-gym-2025":"arch-2cb062fabc11","arch-bdac478e7ea3":"arch-7f975b16bebf","arch-22eae49bbbc0":"arch-82df0f64b81d"});
const canonicalPersonId=id=>PERSON_ALIASES[String(id||'')]||String(id||'');
let memory=[],persist=true;
function normalized(type,id){
 type=String(type||'');id=String(id??'');
 if(!TYPES.has(type))return null;
 if(type==='person')id=canonicalPersonId(id);
 if(type==='person'&&!/^arch-[a-z0-9-]{6,90}$/.test(id))return null;
 if(type==='moment'&&!/^(?:[1-9]|[1-6][0-9]|70)$/.test(id))return null;
 if(type==='story'&&!/^[1-9][0-9]{0,3}$/.test(id))return null;
 if(type==='photo'&&!/^sport-(?:handball|track|archery|shooting|gymnastics|volleyball|wrestling|swimming)$/.test(id))return null;
 if(type==='exhibit'&&!/^[a-z0-9][a-z0-9-]{1,95}$/.test(id))return null;
 if(type==='interview'&&!/^[a-z0-9][a-z0-9-]{0,95}$/.test(id))return null;
 if(['news','view','match','page'].includes(type)&&! /^[a-zA-Z0-9._:-]{1,170}$/.test(id))return null;
 return {type,id};
}
function parse(raw){
 try{
  const json=JSON.parse(raw);
  if(json?.version!==1||!Array.isArray(json.items))return [];
  const seen=new Set(),results=[];
  for(const x of json.items){
   const item=normalized(x?.type,x?.id);if(!item)continue;
   const key=item.type+':'+item.id;if(seen.has(key))continue;
   seen.add(key);results.push(item);if(results.length===MAX)break;
  }return results;
 }catch{return []}
}
function get(){
 if(!persist)return [...memory];
 try{memory=parse(localStorage.getItem(KEY));return [...memory]}
 catch{persist=false;return [...memory]}
}
function has(type,id){
 const v=normalized(type,id);return !!v&&get().some(x=>x.type===v.type&&x.id===v.id);
}
function refresh(button){
 const active=has(button.dataset.favoriteKind,button.dataset.favoriteId);
 button.setAttribute('aria-pressed',String(active));
 button.setAttribute('aria-label',active?'Αφαίρεση από τα αγαπημένα':'Αποθήκευση στα αγαπημένα');
 button.title=active?'Αφαίρεση από τα αγαπημένα':'Αποθήκευση στα αγαπημένα';
 const mark=button.querySelector('.arch-favorite-symbol');if(mark)mark.textContent=active?'♥':'♡';
}
function notify(){
 document.querySelectorAll('[data-favorite-kind][data-favorite-id]').forEach(refresh);
 document.dispatchEvent(new CustomEvent('archelaos:favorites-change',{detail:{count:get().length,persistent:persist}}));
}
function save(items){
 memory=items.slice(0,MAX);
 if(persist)try{localStorage.setItem(KEY,JSON.stringify({version:1,items:memory}))}catch{persist=false}
 notify();
}
function toggle(type,id){
 const v=normalized(type,id);if(!v)return false;
 const items=get(),index=items.findIndex(x=>x.type===v.type&&x.id===v.id);
 if(index>=0)items.splice(index,1);
 else if(items.length<MAX)items.unshift(v);
 else return false;
 save(items);return index<0;
}
function clear(){save([])}
function button(type,id,cls=''){
 const v=normalized(type,id);if(!v)return document.createElement('span');
 const b=document.createElement('button');b.type='button';
 b.className='arch-favorite-toggle'+(cls?' '+cls:'');
 b.dataset.favoriteKind=v.type;b.dataset.favoriteId=v.id;
 const symbol=document.createElement('span');symbol.className='arch-favorite-symbol';symbol.setAttribute('aria-hidden','true');b.append(symbol);
 b.addEventListener('click',e=>{e.stopPropagation();toggle(v.type,v.id)});
 refresh(b);return b;
}
window.addEventListener('storage',e=>{if(e.key===KEY){persist=true;get();notify()}});
window.ArchelaosFavorites=Object.freeze({get,has,toggle,clear,button,persistent:()=>persist,canonicalPersonId});
// Load the same source-ID correction widget in the rebuilt release as on root pages.
if(!document.querySelector('script[data-arch-text-corrections]')){
 const css=document.createElement('link');css.rel='stylesheet';css.href='/assets/correction-suggestions.css?v=20261107';document.head.append(css);
 const js=document.createElement('script');js.src='/assets/correction-suggestions.js?v=20261107';js.async=true;js.dataset.archTextCorrections='';document.head.append(js);
}
})();