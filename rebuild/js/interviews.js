(function(){'use strict';
const $=id=>document.getElementById(id),S={items:[],person:null,record:null};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=x=>String(x??'').toLocaleLowerCase('el').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ς/g,'σ');
const en=()=>document.documentElement.lang==='en'||document.body.classList.contains('lang-en');
const tr=(el,english)=>en()?english:el;
const kinds={interview:['Συνέντευξη','Interview'],statement:['Δήλωση','Statement'],report:['Δημοσιογραφικό ρεπορτάζ','Press report'],clipping:['Απόκομμα Τύπου','Press clipping']};
const sports={handball:['Χάντμπολ','Handball'],gymnastics:['Ενόργανη','Gymnastics'],track:['Στίβος','Athletics'],volleyball:['Βόλεϊ','Volleyball'],basketball:['Μπάσκετ','Basketball'],archery:['Τοξοβολία','Archery'],wrestling:['Πάλη','Wrestling'],shooting:['Σκοποβολή','Shooting'],administration:['Διοίκηση','Administration']};
let lastFocus=null;
const hay=x=>norm([x.name,x.event,x.context,x.source,x.quote,(x.qa||[]).map(v=>v.question+' '+v.answer).join(' ')].join(' '));

/* A classified news article is displayed here through its canonical article ID.
   It is not copied into interviews.json and never upgraded by keyword guesses. */
function fromNews(item){
 const kinds=Array.isArray(item.archiveKinds)?item.archiveKinds:[];
 if(item.unverified||!item.id||!item.title||!/^https:\/\//.test(item.sourceUrl||''))return [];
 const base={event:item.title,context:item.summary||'',
   year:String(item.eventDate||item.date||'').slice(0,4),period:item.date,
   source:item.source||'Δημοσιευμένη είδηση',sourceUrl:item.sourceUrl,
   sport:item.interviewSport||item.sportSlug||Object.entries(sports).find(([,labels])=>labels.some(label=>norm(label)===norm(item.sport)))?.[0]||'administration',
   personIds:Array.isArray(item.personIds)?item.personIds:[],newsArticleId:item.id};
 const records=[];
 const voice=kinds.includes('interview')?'interview':kinds.includes('statement')?'statement':null;
 if(voice&&item.intervieweeName)
   records.push({...base,id:'news-'+item.id,kind:voice,name:item.intervieweeName});
 if(kinds.includes('press_clipping'))
   records.push({...base,id:'press-news-'+item.id,kind:'clipping',name:item.source||'Απόκομμα Τύπου'});
 return records;
}

function resultSet(){
 const params=new URLSearchParams(location.search);
 const q=norm(params.get('q')||'');
 const view=params.get('kind');
 return S.items.filter(x=>(!S.person||(x.personIds||[]).includes(S.person))
   &&(view!=='press'||x.kind==='clipping')
   &&(view!=='interview'||x.kind!=='clipping')
   &&(!q||hay(x).includes(q)));
}
function showCards(){
 const list=resultSet(),counter=$('count');counter.textContent=tr(list.length+' τεκμήρια',''+list.length+' records');
 const params=new URLSearchParams(location.search);if(params.has('person')||params.has('q')){const all=document.createElement('a');all.href='interviews.html';all.textContent=tr('Προβολή όλων','View all');counter.append(all)}
 const frag=document.createDocumentFragment();
 list.forEach(x=>{
  const btn=document.createElement('button');btn.type='button';btn.className='card'+(x.kind==='interview'?' feature':'');btn.dataset.id=x.id;
  btn.innerHTML='<span class="meta"><span>'+esc(tr(...kinds[x.kind]))+'</span><span>'+esc(tr(...sports[x.sport]))+'</span></span><span class="year">'+esc(x.year)+'</span><h3>'+esc(x.name.split(' (')[0])+'</h3><p>'+esc(x.event)+'</p><span class="foot"><span>'+esc(x.qa?tr(x.qa.length+' ερωτήσεις',x.qa.length+' questions'):tr('Αρχειακό τεκμήριο','Archive record'))+'</span></span>';
  btn.addEventListener('click',()=>open(x.id));frag.append(btn);
 });
 if(!list.length){const p=document.createElement('p');p.className='empty';p.textContent=tr('Δεν βρέθηκαν καταχωρίσεις. Δοκίμασε άλλη αναζήτηση.','No matching records. Try another query.');frag.append(p)}
 $('cards').replaceChildren(frag);
}
function open(id){
 const x=S.items.find(v=>v.id===id);if(!x)return;
 lastFocus=document.activeElement;
 if($('interview-dialog-title'))$('interview-dialog-title').textContent=x.name;
 let inner='<div class="detail-year">'+esc(x.year)+'</div><div class="sub">'+esc(tr(...kinds[x.kind]))+' · '+esc(tr(...sports[x.sport]))+'</div><p class="event">'+esc(x.event)+'</p>';
 if(x.context)inner+='<section class="context"><h3>'+tr('Ιστορικό πλαίσιο','Historical context')+'</h3><p>'+esc(x.context)+'</p></section>';
 if(x.qa){inner+='<section class="qa"><h3>'+tr('Η συνέντευξη','The interview')+'</h3>';x.qa.forEach((v,i)=>{inner+='<div class="qa-row"><p class="question">'+(i+1)+'. '+esc(v.question)+'</p><p class="answer">'+esc(v.answer)+'</p></div>'});inner+='</section>'}
 else if(x.quote)inner+='<blockquote class="quote">'+esc(x.quote)+'</blockquote>';
 inner+='<section class="source"><h3>'+tr('Πηγή & τεκμηρίωση','Source & provenance')+'</h3><p>'+esc(x.source)+'</p></section>';
 if(x.sourceUrl&&/^https:\/\//.test(x.sourceUrl)){inner+='<p class="source"><a href="'+esc(x.sourceUrl)+'" target="_blank" rel="noopener noreferrer">'+tr('Αυθεντική δημοσίευση · Άνοιγμα στην αρχική πηγή ↗','Original publication · Open source ↗')+'</a></p>';}
 if(x.newsArticleId){inner+='<p class="source"><a href="/news.html?article='+encodeURIComponent(x.newsArticleId)+'">'+tr('Διάβασε την είδηση στα Νέα','Read the original news entry')+'</a></p>';}
 if(x.needsReview)inner+='<div class="warning">'+tr('Ορισμένες συμπληρωματικές λεπτομέρειες του γεγονότος χρειάζονται διασταύρωση με το πρωτότυπο απόκομμα.','Some contextual details need verification against the original clipping.')+'</div>';
 if((x.relatedPeople&&x.relatedPeople.length)||(x.eventLinks&&x.eventLinks.length)){
  inner+='<section class="source"><h3>'+tr('Συνδεδεμένα τεκμήρια & πρόσωπα','Related archive records & people')+'</h3><div class="links">';
  (x.relatedPeople||[]).forEach(p=>{inner+='<a href="hall-of-fame.html?person='+encodeURIComponent(p.id)+'">'+tr('Βιογραφικό: '+p.name,'Biography: '+(p.nameEn||p.name))+'</a>'});
  (x.eventLinks||[]).forEach(link=>{if(!/^(?:history|70-stigmes|retro-matches)\.html(?:#(?:sport-[a-z]+|moment-\d+|match-\d+))?$/.test(link.href))return;inner+='<a href="'+esc(link.href)+'">'+esc(tr(link.labelEl,link.labelEn))+'</a>'});
  inner+='</div></section>';
 }
 $('detail').innerHTML=inner;
 // Connect this custom Voices dialog to the same source-backed public archive graph.
 void window.ArchelaosLinks?.append($('detail'),'interview',x.id,{limit:8});
 const slot=$('interview-favorite-slot');
 if(slot){slot.replaceChildren();
  if(window.ArchelaosFavorites)slot.append(window.ArchelaosFavorites.button('interview',x.id,'interview-header-favorite'));
 }
 const dlg=$('dialog');if(!dlg.open)dlg.showModal();$('close').focus();
 const url=new URL(location.href);url.searchParams.set('record',id);history.replaceState(null,'',url);
}
$('close').addEventListener('click',()=>$('dialog').close());
$('dialog').addEventListener('click',e=>{if(e.target===$('dialog'))$('dialog').close()});
$('dialog').addEventListener('close',()=>{lastFocus?.focus?.({preventScroll:true});const url=new URL(location.href);url.searchParams.delete('record');history.replaceState(null,'',url)});
Promise.all([
 fetch('/rebuild/data/interviews.json',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(Error('HTTP '+r.status))),
 fetch('/news.json',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(Error('News HTTP '+r.status)))
  .catch(err=>{console.warn('News interview index unavailable',err);return {items:[]};})
]).then(([d,news])=>{
 if(!Array.isArray(d.items))throw Error('Bad dataset');
 const legacyIds=new Set(d.items.map(x=>x.id));
 const knownArticles=new Set(d.items.map(x=>x.newsArticleId).filter(Boolean));
 const derived=(Array.isArray(news.items)?news.items:[])
  .flatMap(fromNews)
  .filter(x=>!legacyIds.has(x.id)&&(x.kind==='clipping'||!knownArticles.has(x.newsArticleId)));
 S.items=[...d.items,...derived];$('totalBadge').textContent=S.items.length+' '+tr('ΤΕΚΜΗΡΙΑ','RECORDS');
 const q=new URLSearchParams(location.search);S.person=q.get('person');S.record=q.get('record');
 showCards();
 if(S.record){
  // Curated interviews supersede generated duplicates, not their deep links.
  const target=S.items.find(x=>x.id===S.record)||(S.record.startsWith('news-')
   ?S.items.find(x=>x.newsArticleId===S.record.slice(5)&&x.kind!=='clipping'):null);
  if(target)open(target.id);
 }
}).catch(()=>{$('count').textContent=tr('Το αρχείο δεν είναι προσωρινά διαθέσιμο.','Archive currently unavailable.')});
function sync(){document.querySelectorAll('[data-el][data-en]').forEach(e=>e.textContent=e.getAttribute(en()?'data-en':'data-el'));if(S.items.length){$('totalBadge').textContent=S.items.length+' '+tr('ΤΕΚΜΗΡΙΑ','RECORDS');showCards()}}
new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
})();
