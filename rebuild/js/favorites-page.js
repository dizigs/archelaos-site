/* Saved cards use canonical archive data, not stored biographies. */
(function(){'use strict';
const $=q=>document.querySelector(q),el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
const route=path=>window.ArchelaosRoutes?.toStage(path)||path;
let data,filter='all';
function card(saved){
 const record=data.get(saved.type,saved.id);if(!record)return null;
 const item=record.entity;
 const article=el('article','av-card'),kind=el('span','av-card-kind',record.kindLabel);
 const title=el('h2','',record.title);
 const summary=el('p','av-card-summary',saved.type==='person'?item.role:record.year||record.subtitle);
 const footer=el('div','av-card-actions'),links=el('div','av-action-links'),link=el('a','av-open','Εξερεύνηση ↗');
 link.href=route(record.url);
 const contribute=el('a','av-contribute','Προσθέστε στοιχείο ↗');
 const query=new URLSearchParams({kind:record.type,id:record.id,title:record.title});
 contribute.href=route('/contribute.html?'+query.toString());
 contribute.setAttribute('aria-label','Προτείνετε ιστορικό στοιχείο για '+record.title);
 links.append(link,contribute);
 footer.append(links,window.ArchelaosFavorites.button(saved.type,saved.id));
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
 window.ArchelaosCatalog.load().then(result=>{data=result;render()}).catch(e=>{console.error('Personal collection:',e);$('#av-count').textContent='Το αρχείο δεν φορτώθηκε.'});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();