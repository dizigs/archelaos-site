/* Saved cards use canonical archive data, not stored biographies. */
(function(){'use strict';
const $=q=>document.querySelector(q),el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
const route=path=>window.ArchelaosRoutes?.toStage(path)||path;
let data,filter='all';
async function load(){
 const [p,m,s,h,archive]=await Promise.all(['people','moments','stories','home','museum'].map(name=>fetch('/rebuild/data/'+name+'.json').then(r=>{
  if(!r.ok)throw Error(name+' HTTP '+r.status);return r.json()
 })));
 return {person:new Map(p.people.map(x=>[String(x.id),x])),moment:new Map(m.moments.map(x=>[String(x.id),x])),story:new Map(s.stories.map((x,i)=>[String(i+1),x])),photo:new Map(h.sports.map(x=>['sport-'+x.key,x])),exhibit:new Map([...archive.articles,...archive.press].map(x=>[x.id,x]))};
}
function card(saved){
 const item=data[saved.type]?.get(saved.id);if(!item)return null;
 const article=el('article','av-card'),kind=el('span','av-card-kind',{
  person:'ΠΡΟΣΩΠΑ · HALL OF FAME',moment:'70 ΣΤΙΓΜΕΣ · ΙΣΤΟΡΙΚΟ',story:'ΑΦΗΓΗΣΕΙΣ · ΙΣΤΟΡΙΕΣ',photo:'ΦΩΤΟΓΡΑΦΙΕΣ · ΑΘΛΗΜΑΤΑ',exhibit:'ΨΗΦΙΑΚΟ ΜΟΥΣΕΙΟ · ΕΚΘΕΜΑΤΑ'
 }[saved.type]);
 const title=el('h2','',saved.type==='person'?item.name:saved.type==='photo'?'Φωτογραφία · '+item.name:item.title);
 const summary=el('p','av-card-summary',saved.type==='person'?item.role:saved.type==='moment'?String(item.year):saved.type==='photo'?'Αθλητικό τμήμα · Γ.Α.Σ. Αρχέλαος':saved.type==='exhibit'?String(item.period||item.year||'Ιστορικό αρχείο'): [item.sport,item.year].filter(Boolean).join(' · '));
 const footer=el('div','av-card-actions'),link=el('a','av-open','Εξερεύνηση ↗');
 link.href=route(saved.type==='person'?'/hall-of-fame.html?person='+encodeURIComponent(saved.id):
  saved.type==='moment'?'/70-stigmes.html#moment-'+saved.id:saved.type==='photo'?'/index.html#sport-photo-'+item.key:saved.type==='exhibit'?'/history.html#archive-'+encodeURIComponent(saved.id):'/stories.html#story-'+saved.id);
 footer.append(link,window.ArchelaosFavorites.button(saved.type,saved.id));
 article.append(kind);
 if(saved.type==='photo'){
  const img=el('img','av-photo');img.src=item.photo;img.alt=item.name;img.loading='lazy';img.decoding='async';
  img.addEventListener('error',()=>{img.hidden=true},{once:true});article.append(img);
 }
 article.append(title,summary,footer);return article;
}
function render(){
 if(!data)return;
 const all=window.ArchelaosFavorites.get(),shown=filter==='all'?all:all.filter(x=>x.type===filter);
 const grid=$('#av-grid'),fragment=document.createDocumentFragment();let count=0;
 for(const item of shown){const block=card(item);if(block){fragment.append(block);count++}}
 if(!count){
  const empty=el('div','av-empty');empty.append(el('h2','','Η συλλογή σας περιμένει.'));
  empty.append(el('p','','Αποθηκεύστε πρόσωπα, στιγμές και ιστορίες με το σύμβολο ♡.'));
  const a=el('a','av-primary-link','Εξερευνήστε το αρχείο ↗');a.href=route('/search.html');empty.append(a);fragment.append(empty);
 }
 grid.replaceChildren(fragment);
 $('#av-count').textContent=all.length+' αποθηκευμένα · '+count+' στην προβολή';
 $('#av-clear').hidden=!all.length;
 $('#av-privacy').textContent=window.ArchelaosFavorites.persistent()?
  'Τα αγαπημένα σας μένουν μόνο στον συγκεκριμένο περιηγητή και τη συσκευή. Δεν μεταφέρονται σε άλλες συσκευές.':
  'Η μόνιμη αποθήκευση είναι αποκλεισμένη. Τα αγαπημένα διατηρούνται μόνο προσωρινά σε αυτή τη σελίδα.';
 window.ArchelaosMotion?.observe(grid);
}
function init(){
 document.querySelectorAll('[data-av-filter]').forEach(b=>b.addEventListener('click',()=>{
  filter=b.dataset.avFilter;
  document.querySelectorAll('[data-av-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();
 }));
 $('#av-clear').addEventListener('click',()=>{
  if(window.confirm('Θέλετε να διαγράψετε όλα τα αγαπημένα από αυτόν τον περιηγητή;'))window.ArchelaosFavorites.clear();
 });
 document.addEventListener('archelaos:favorites-change',render);
 load().then(result=>{data=result;render()}).catch(e=>{console.error('Personal collection:',e);$('#av-count').textContent='Το αρχείο δεν φορτώθηκε.'});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();