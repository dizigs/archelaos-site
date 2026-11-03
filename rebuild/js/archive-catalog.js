/* ARCHÉLAOS | One canonical client-side archive catalog for search, favorites,
   related content and future museum views. Source is published, reviewed JSON only.
   Cached once per page, no external services, no user data or stored biographies. */
(function(){'use strict';
let pending=null;
const NAMES=['people','moments','stories','home','museum','interviews','match-schedule'];
// The same canonical Hall identity feed is used by preview, release and individual popups.
const dataUrl=name=>name==='people'?'/hall-of-fame-people.json':'/rebuild/data/'+name+'.json';
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
  press:'/interviews.html?kind=press&record='+value,
  news:'/news.html?article='+value,
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
 press:'ΑΡΧΕΙΟ ΤΥΠΟΥ · ΑΠΟΚΟΜΜΑΤΑ',
 news:'ΝΕΑ & ΔΡΑΣΗ',
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
  const response=await fetch(dataUrl(name),{cache:name==='people'?'no-store':'default'});
  if(!response.ok)throw Error('Archive '+name+' HTTP '+response.status);
  return response.json();
 }));
 if(!Number.isInteger(people.count)||people.people?.length!==people.count||people.count<1||moments.moments?.length!==70||
  stories.stories?.length<21||home.sports?.length<8||
  museum.articles?.length<14||museum.press?.length<10||interviews.items?.length<25)
   throw Error('Incomplete canonical sports archive');
 // News is an independent live collection: if temporarily inaccessible,
 // people, stories and museum search remain functional.
 let news={items:[]};
 try{
  const response=await fetch('/news.json',{cache:'no-store'});
  if(response.ok)news=await response.json();
 }catch(error){console.warn('News unavailable in unified search',error)}
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
 for(const article of (Array.isArray(news.items)?news.items:[])){
  if(article.unverified||!article.id||!article.title||!article.date)continue;
  add('news',article.id,article.title,article.summary||'',
    [article.sport,article.source,...(article.body||[])].filter(Boolean).join(' '),
    article.date.slice(0,4),article);
 }
 for(const v of interviews.items)add('interview',v.id,v.name.split(' (')[0],v.event,
   [v.context,v.quote,...(v.qa||[]).map(q=>q.question+' '+q.answer)].join(' '),v.year,v,v.source);
 // One reviewed news article may appear in several archive facets, each linking
 // back to the canonical news ID. Never infer classifications from keywords.
 const linkedInterviews=new Set(interviews.items.map(v=>v.newsArticleId).filter(Boolean));
 for(const item of (Array.isArray(news.items)?news.items:[])){
  const kinds=Array.isArray(item.archiveKinds)?item.archiveKinds:[];
  if(item.unverified||!item.id||!item.title||!item.date||
     !/^https:\/\//.test(item.sourceUrl||''))continue;
  if((kinds.includes('interview')||kinds.includes('statement'))&&
     item.intervieweeName&&!linkedInterviews.has(item.id))
   add('interview','news-'+item.id,item.intervieweeName,item.title,
     item.summary,item.date.slice(0,4),item,item.source);
  if(kinds.includes('press_clipping'))
   add('press','press-news-'+item.id,item.title,item.source||'Απόκομμα Τύπου',
     item.summary,item.date.slice(0,4),item);
 }
 return Object.freeze({
  records:Object.freeze(records),
  get:(type,id)=>byType.get(String(type))?.get(String(id))||(type==='interview'?byType.get('press')?.get(String(id)):null)||null,
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