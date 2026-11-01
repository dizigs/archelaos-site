/* ARCHÉLAOS | One canonical client-side archive catalog for search, favorites,
   related content and future museum views. Source is published, reviewed JSON only.
   Cached once per page, no external services, no user data or stored biographies. */
(function(){'use strict';
let pending=null;
const NAMES=['people','moments','stories','home','museum','interviews','match-schedule'];
const normalize=text=>String(text||'').normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('el').replace(/\s+/g,' ').trim();
const urlFor=(type,id,entity)=>{
 const value=encodeURIComponent(String(id));
 const routes={
  person:'/hall-of-fame.html?person='+value,
  moment:'/70-stigmes.html#moment-'+value,
  story:'/stories.html#story-'+value,
  exhibit:'/history.html#archive-'+value,
  interview:'/interviews.html?record='+value,
  department:'/tmimata.html#sport-'+value,
  fixture:'/index.html?fixture='+value+'#upcoming-matches',
  photo:'/index.html#sport-photo-'+encodeURIComponent(String(entity?.key||''))
 };
 return routes[type]||null;
};
const LABELS=Object.freeze({
 person:'ΠΡΟΣΩΠΑ · HALL OF FAME',
 moment:'70 ΣΤΙΓΜΕΣ · ΙΣΤΟΡΙΚΟ ΑΡΧΕΙΟ',
 story:'ΑΦΗΓΗΣΕΙΣ · ΙΣΤΟΡΙΕΣ',
 photo:'ΦΩΤΟΓΡΑΦΙΕΣ · ΑΘΛΗΜΑΤΑ',
 exhibit:'ΨΗΦΙΑΚΟ ΜΟΥΣΕΙΟ · ΕΚΘΕΜΑΤΑ',
 interview:'ΟΙ ΦΩΝΕΣ · ΣΥΝΕΝΤΕΥΞΕΙΣ & ΔΗΛΩΣΕΙΣ',
 department:'ΑΘΛΗΤΙΚΑ ΤΜΗΜΑΤΑ',
 fixture:'ΗΜΕΡΟΛΟΓΙΟ · ΑΓΩΝΕΣ'
});
function plainText(html){
 const template=document.createElement('template');
 template.innerHTML=String(html||'');
 return (template.content.textContent||'').replace(/\s+/g,' ').trim();
}
async function create(){
 const [people,moments,stories,home,museum,interviews,schedule]=await Promise.all(NAMES.map(async name=>{
  const response=await fetch('/rebuild/data/'+name+'.json');
  if(!response.ok)throw Error('Archive '+name+' HTTP '+response.status);
  return response.json();
 }));
 if(people.people?.length<682||moments.moments?.length!==70||
  stories.stories?.length<21||home.sports?.length<8||
  museum.articles?.length<14||museum.press?.length<10||interviews.items?.length<25)
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
 const sportArticles=new Map((museum.articles||[]).map(a=>[a.id,a]));
 for(const sport of home.sports){
  const article=sportArticles.get(sport.key);
  add('department',sport.key,sport.name,'Αθλητικό τμήμα',
   [sport.description,article?.title,plainText(article?.html)].filter(Boolean).join(' '),
   article?.period||'',sport);
 }
 for(const game of schedule.matches||[]){
  if(game.approval?.status!=='owner_approved')continue;
  const sport=game.sport==='volleyball'?'Βόλεϊ':game.sport==='handball'?'Χάντμπολ':game.sport;
  add('fixture',game.id,game.home_team+' – '+game.away_team,sport+' · '+(game.category||''),
   [game.competition,game.venue,game.status,game.start_at].join(' '),game.start_at?.slice(0,10)||'',game);
 }
 for(const s of home.sports)add('photo','sport-'+s.key,
   'Φωτογραφία · '+s.name,'Αθλητικό τμήμα · Γ.Α.Σ. Αρχέλαος','', '',s);
 for(const a of [...museum.articles,...museum.press])add(
   'exhibit',a.id,a.title,'Ψηφιακό Μουσείο',
   plainText(a.html),a.period||a.year||'',a
 );
 for(const v of interviews.items)add('interview',v.id,v.name.split(' (')[0],v.event,
   [v.context,v.quote,...(v.qa||[]).map(q=>q.question+' '+q.answer)].join(' '),v.year,v,v.source);
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