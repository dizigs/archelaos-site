/* Saved cards use canonical archive data, not stored biographies. */
(function(){'use strict';
const $=q=>document.querySelector(q),el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
const route=path=>window.ArchelaosRoutes?.toStage(path)||path;
let data,filter='all';
const departmentNames={handball:'Χάντμπολ',track:'Στίβος',archery:'Τοξοβολία',shooting:'Σκοποβολή',gymnastics:'Ενόργανη Γυμναστική',volleyball:'Βόλεϊ',wrestling:'Πάλη',swimming:'Κολύμβηση',basketball:'Καλαθοσφαίριση','fin-swimming':'Ιστορία κολύμβησης','inactive-depts':'Ιστορικά τμήματα'};
function fallbackSaved(saved){
 const {type,id}=saved;
 if(type==='page'&&id.startsWith('department-')){
  const key=id.slice('department-'.length),title=departmentNames[key];
  if(!title)return null;
  return {type,id,title,kindLabel:'ΑΘΛΗΤΙΚΟ ΤΜΗΜΑ',subtitle:'Πληροφορίες και ιστορία τμήματος',year:'',url:'/tmimata.html#sport-'+key,entity:{}};
 }
 if(!['news','view','match','page'].includes(type))return null;
 let metadata={};
 try{metadata=JSON.parse(localStorage.getItem('archelaos:favorites:metadata:v1')||'{}')[type+':'+id]||{}}catch(e){}
 const title=metadata.title||id.replace(/[-_]/g,' '),url=type==='news'?'/news.html?article='+encodeURIComponent(id):type==='match'?'/retro-matches.html':type==='view'?'/history.html':'/index.html';
 return {type,id,title,kindLabel:type==='news'?'ΝΕΑ & ΔΡΑΣΗ':'ΑΠΟΘΗΚΕΥΜΕΝΟ',subtitle:metadata.summary||'Αποθηκευμένο από τον Αρχέλαο',year:'',url,entity:{}};
}
async function openSaved(record){
 const item=record.entity, type=record.type, ui=window.ArchelaosUI;
 if(!ui)throw Error('Popup system unavailable');
 // Preserve the full original interviews/statements popup and its sticky
 // heart by opening the canonical record view, instead of a shortened duplicate.
 if(type==='interview'){
  location.assign(route(record.url));
  return;
 }
 if(['news','page','match','view'].includes(type)){location.assign(route(record.url));return;}
 if(type==='person'){
  if(!window.ArchelaosBio?.show(item))throw Error('Biography viewer unavailable');
  return;
 }
 if(type==='moment'){
  ui.openDialog({
   title:record.title,subtitle:String(item.year||''),
   paragraphs:Array.isArray(item.body)?item.body:[],
   favorite:{type,id:record.id},closeLabel:'Κλείσιμο ιστορίας'
  });
  return;
 }
 if(type==='story'){
  const paragraphs=String(item.text||'').split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean);
  ui.openDialog({
   title:record.title,subtitle:[item.sport,item.year].filter(Boolean).join(' · '),
   paragraphs,favorite:{type,id:record.id},closeLabel:'Κλείσιμο ιστορίας'
  });
  document.querySelectorAll('.arch-dialog-body p').forEach(p=>{
   if(/^[«“"]/.test(p.textContent.trim()))p.classList.add('arch-dialog-quote');
  });
  return;
 }
 if(type==='exhibit'){
  const content=window.ArchelaosArchive?.fragment(item.html);
  if(!content)throw Error('Museum archive viewer unavailable');
  ui.openDialog({
   title:record.title,subtitle:String(item.period||item.year||''),
   contentNode:content,favorite:{type,id:record.id},
   closeLabel:'Κλείσιμο εκθέματος'
  });
  return;
 }
 if(type==='photo'){
  const content=el('figure','av-dialog-photo');
  const image=el('img');image.src=item.photo;image.alt=item.name||record.title;
  image.loading='eager';image.decoding='async';
  image.addEventListener('error',()=>{
   image.remove();
   content.append(el('p','', 'Η φωτογραφία δεν είναι προσωρινά διαθέσιμη.'));
  },{once:true});
  const caption=el('figcaption','',item.name||'Αθλητικό τμήμα');
  content.append(image,caption);
  ui.openDialog({
   title:item.name||record.title,subtitle:'ΦΩΤΟΓΡΑΦΙΑ · ΑΘΛΗΤΙΚΑ ΤΜΗΜΑΤΑ',
   contentNode:content,favorite:{type,id:record.id},
   closeLabel:'Κλείσιμο φωτογραφίας'
  });
 }
}
function card(saved){
 const record=data.get(saved.type,saved.id)||fallbackSaved(saved);if(!record)return null;
 const item=record.entity;
 const article=el('article','av-card');
 const hit=el('button','av-card-hit');hit.type='button';
 hit.setAttribute('aria-label','Άνοιγμα: '+record.title);
 hit.setAttribute('aria-haspopup','dialog');
 hit.addEventListener('click',()=>{
  void openSaved(record).catch(error=>{
   console.warn('Saved archive popup:',error);
   // A real destination is the fallback; the card never becomes a dead end.
   location.assign(route(record.url));
  });
 });
 const kind=el('span','av-card-kind',record.kindLabel);
 const title=el('h2','',record.title);
 const summary=el('p','av-card-summary',saved.type==='person'?item.role:record.year||record.subtitle);
 const footer=el('div','av-card-actions'),links=el('div','av-action-links');
 const contribute=el('a','av-contribute','Προσθέστε στοιχείο');
 const query=new URLSearchParams({kind:record.type,id:record.id,title:record.title});
 contribute.href=route('/contribute.html?'+query.toString());
 contribute.setAttribute('aria-label','Προτείνετε ιστορικό στοιχείο για '+record.title);
 links.append(contribute);
 footer.append(links,window.ArchelaosFavorites.button(saved.type,saved.id));
 article.append(hit,kind);
 if(saved.type==='photo'){
  const img=el('img','av-photo');img.src=item.photo;img.alt=item.name;img.loading='lazy';img.decoding='async';
  img.addEventListener('error',()=>{img.hidden=true},{once:true});article.append(img);
 }
 article.append(title,summary,footer);
 return article;
}
function render(){
 if(!data)return;
 const all=window.ArchelaosFavorites.get(),shown=filter==='all'?all:all.filter(x=>x.type===filter);
 const grid=$('#av-grid'),fragment=document.createDocumentFragment();let count=0;
 for(const item of shown){const block=card(item);if(block){fragment.append(block);count++}}
 if(!count){
  const empty=el('div','av-empty');empty.append(el('h2','','Η συλλογή σας περιμένει.'));
  empty.append(el('p','','Αποθηκεύστε πρόσωπα, στιγμές, ιστορίες και συνεντεύξεις με το σύμβολο ♡.'));
  const a=el('a','av-primary-link','Εξερευνήστε το αρχείο');a.href=route('/search.html');empty.append(a);fragment.append(empty);
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