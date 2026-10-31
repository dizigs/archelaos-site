/* Reciprocal, source-backed event relationships; only approved graph is displayed. */
(function(){'use strict';
let catalog=null,pending=null,serial=0;
const isStage=()=>location.pathname.startsWith('/rebuild/');
const file=()=>isStage()?'/rebuild/data/approved-event-graph.json':'/assets/site/data/approved-event-graph.json';
const urlFor=href=>window.ArchelaosRoutes?.toStage(href)||href;
const create=(tag,cls,text)=>{
 const node=document.createElement(tag);if(cls)node.className=cls;
 if(text!==undefined)node.textContent=String(text);return node;
};
const year=event=>{
 const t=event.temporal||{};
 return t.date||t.season||(t.year?String(t.year):'');
};
function load(){
 if(catalog)return Promise.resolve(catalog);
 if(!pending)pending=fetch(file()).then(r=>{if(!r.ok)throw Error('Approved graph unavailable');return r.json()})
  .then(data=>{
   if(data?.schema_version!==1||data?.publication_scope!=='approved_only'||!Array.isArray(data.events))
    throw Error('Invalid approved event graph');
   catalog={byId:new Map(data.events.map(x=>[x.id,x])),
            byPerson:data.by_person||{},events:data.events};
   return catalog;
  }).catch(err=>{pending=null;throw err});
 return pending;
}
function personLink(person){
 const b=create('button','arch-related-card');
 b.type='button';
 b.append(create('strong','',person.name),create('span','',person.role+' ↗'));
 b.addEventListener('click',()=>{
  if(window.ArchelaosBio)window.ArchelaosBio.open(person.id);
  else location.assign(urlFor('/hall-of-fame.html?person='+encodeURIComponent(person.id)));
 });
 return b;
}
function openEvent(eventId){
 serial++;
 return load().then(data=>{
  const item=data.byId.get(eventId);
  if(!item)return false;
  window.ArchelaosUI.openDialog({
   title:item.title,subtitle:year(item)+' · ΙΣΤΟΡΙΚΟ ΓΕΓΟΝΟΣ',
   paragraphs:[item.summary],
   sources:(item.sources||[]).map(s=>({label:s.provider+' · '+s.title,url:s.url})),
   sourcesLabel:'Τεκμηριωμένες πηγές',
   closeLabel:'Κλείσιμο ιστορικού γεγονότος'
  });
  const body=document.querySelector('dialog.arch-dialog[open] .arch-dialog-body');
  if(!body)return false;
  if(item.people?.length){
   const section=create('section','arch-related-section');
   section.append(create('h3','','Συνδεδεμένα πρόσωπα'));
   const grid=create('div','arch-related-list');
   for(const person of item.people)grid.append(personLink(person));
   section.append(grid);body.append(section);
  }
  const a=create('a','arch-related-contribute','Προτείνετε τεκμήριο ή διόρθωση ↗');
  a.href=urlFor('/contribute.html?kind=event&id='+encodeURIComponent(item.id)+
    '&title='+encodeURIComponent(item.title)+'#ac-guide');
  body.append(a);
  return true;
 }).catch(err=>{console.warn('Approved event not available',err);return false});
}
function appendPerson(personId){
 const request=++serial;
 const body=document.querySelector('dialog.arch-dialog[open] .arch-dialog-body');
 if(!body)return;
 load().then(data=>{
  if(request!==serial||!body.isConnected||!body.closest('dialog')?.open)return;
  const eventIds=data.byPerson[personId]||[];
  const records=eventIds.map(id=>data.byId.get(id)).filter(Boolean);
  if(!records.length)return;
  const section=create('section','arch-related-section');
  section.append(create('h3','','Σχετικά ιστορικά γεγονότα'));
  const grid=create('div','arch-related-list');
  for(const record of records){
   const b=create('button','arch-related-card');b.type='button';
   b.append(create('span','arch-related-year',year(record)),
            create('strong','',record.title),
            create('span','arch-related-open','Πηγές και πρόσωπα ↗'));
   b.addEventListener('click',()=>{void openEvent(record.id)});
   grid.append(b);
  }
  section.append(grid);body.append(section);
 }).catch(err=>console.warn('Could not load related events',err));
}
window.ArchelaosRelated=Object.freeze({load,appendPerson,openEvent});
})();
