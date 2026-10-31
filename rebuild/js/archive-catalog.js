/* ARCHÉLAOS | One canonical client-side archive catalog for search, favorites,
   related content and future museum views. Source is published, reviewed JSON only.
   Cached once per page, no external services, no user data or stored biographies. */
(function(){'use strict';
let pending=null;
const NAMES=['people','moments','stories','home','museum'];
const normalize=text=>String(text||'').normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('el').replace(/\s+/g,' ').trim();
const urlFor=(type,id,entity)=>{
 const value=encodeURIComponent(String(id));
 const routes={
  person:'/hall-of-fame.html?person='+value,
  moment:'/70-stigmes.html#moment-'+value,
  story:'/stories.html#story-'+value,
  exhibit:'/history.html#archive-'+value,
  photo:'/index.html#sport-photo-'+encodeURIComponent(String(entity?.key||''))
 };
 return routes[type]||null;
};
const LABELS=Object.freeze({
 person:'ΠΡΟΣΩΠΑ · HALL OF FAME',
 moment:'70 ΣΤΙΓΜΕΣ · ΙΣΤΟΡΙΚΟ ΑΡΧΕΙΟ',
 story:'ΑΦΗΓΗΣΕΙΣ · ΙΣΤΟΡΙΕΣ',
 photo:'ΦΩΤΟΓΡΑΦΙΕΣ · ΑΘΛΗΜΑΤΑ',
 exhibit:'ΨΗΦΙΑΚΟ ΜΟΥΣΕΙΟ · ΕΚΘΕΜΑΤΑ'
});
function plainText(html){
 const template=document.createElement('template');
 template.innerHTML=String(html||'');
 return (template.content.textContent||'').replace(/\s+/g,' ').trim();
}
async function create(){
 const [people,moments,stories,home,museum]=await Promise.all(NAMES.map(async name=>{
  const response=await fetch('/rebuild/data/'+name+'.json');
  if(!response.ok)throw Error('Archive '+name+' HTTP '+response.status);
  return response.json();
 }));
 if(people.people?.length<682||moments.moments?.length!==70||
  stories.stories?.length<21||home.sports?.length<8||
  museum.articles?.length<14||museum.press?.length<10)
   throw Error('Incomplete canonical sports archive');
 const records=[],byType=new Map();
 function add(type,id,title,subtitle,body,year,entity,secondary=''){
  const key=String(id),group=byType.get(type)||new Map();
  if(group.has(key))throw Error('Duplicate archive ID: '+type+':'+key);
  const record=Object.freeze({
   type,id:key,title:String(title||''),subtitle:String(subtitle||''),
   year:String(year||''),url:urlFor(type,key,entity),
   kindLabel:LABELS[type],entity,
   excerpt:String(body||subtitle||'').replace(/\s+/g,' ').trim().slice(0,205),
   searchText:normalize([title,subtitle,body,secondary,year].join(' '))
  });
  group.set(key,record);byType.set(type,group);records.push(record);
 }
 for(const p of people.people)add('person',p.id,p.name,p.role,p.bio,'',p,
   [p.name_en,p.role_en,p.bio_en].join(' '));
 for(const m of moments.moments)add('moment',m.id,m.title,'70 Στιγμές',
   m.body.join(' '),m.year,m,[m.title_en,...m.body_en].join(' '));
 stories.stories.forEach((s,i)=>add('story',i+1,s.title,s.sport,
   s.lead+' '+s.text,s.year,s));
 for(const s of home.sports)add('photo','sport-'+s.key,
   'Φωτογραφία · '+s.name,'Αθλητικό τμήμα · Γ.Α.Σ. Αρχέλαος','', '',s);
 for(const a of [...museum.articles,...museum.press])add(
   'exhibit',a.id,a.title,'Ψηφιακό Μουσείο',
   plainText(a.html),a.period||a.year||'',a
 );
 return Object.freeze({
  records:Object.freeze(records),
  get:(type,id)=>byType.get(String(type))?.get(String(id))||null,
  counts:Object.freeze(Object.fromEntries([...byType].map(([type,items])=>[type,items.size]))),
  normalize,urlFor,labels:LABELS
 });
}
function load(){
 if(!pending)pending=create().catch(error=>{pending=null;throw error});
 return pending;
}
window.ArchelaosCatalog=Object.freeze({load,normalize,urlFor,labels:LABELS});
})();