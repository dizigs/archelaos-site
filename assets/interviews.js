(function(){'use strict';
const $=id=>document.getElementById(id),S={items:[],person:null,record:null};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=x=>String(x??'').toLocaleLowerCase('el').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ς/g,'σ');
const en=()=>document.documentElement.lang==='en'||document.body.classList.contains('lang-en');
const tr=(el,english)=>en()?english:el;
const kinds={interview:['Συνέντευξη','Interview'],statement:['Δήλωση','Statement'],report:['Δημοσιογραφικό ρεπορτάζ','Press report']};
const sports={handball:['Χάντμπολ','Handball'],gymnastics:['Ενόργανη','Gymnastics'],track:['Στίβος','Athletics'],volleyball:['Βόλεϊ','Volleyball'],basketball:['Μπάσκετ','Basketball'],administration:['Διοίκηση','Administration']};
let lastFocus=null;
const hay=x=>norm([x.name,x.event,x.context,x.source,x.quote,(x.qa||[]).map(v=>v.question+' '+v.answer).join(' ')].join(' '));
function resultSet(){
 const q=norm($('search').value.trim()),kind=$('kind').value,sport=$('sport').value;
 return S.items.filter(x=>(!S.person||(x.personIds||[]).includes(S.person))&&(!S.record||x.id===S.record)&&(kind==='all'||x.kind===kind)&&(sport==='all'||x.sport===sport)&&(!q||hay(x).includes(q)));
}
function showCards(){
 const list=resultSet();$('count').textContent=tr(list.length+' από '+S.items.length+' τεκμήρια',list.length+' of '+S.items.length+' records');
 const frag=document.createDocumentFragment();
 list.forEach(x=>{
  const btn=document.createElement('button');btn.type='button';btn.className='card'+(x.kind==='interview'?' feature':'');btn.dataset.id=x.id;
  btn.innerHTML='<span class="meta"><span>'+esc(tr(...kinds[x.kind]))+'</span><span>'+esc(tr(...sports[x.sport]))+'</span></span><span class="year">'+esc(x.year)+'</span><h3>'+esc(x.name.split(' (')[0])+'</h3><p>'+esc(x.event)+'</p><span class="foot"><span>'+esc(x.qa?tr(x.qa.length+' ερωτήσεις',x.qa.length+' questions'):tr('Αρχειακό τεκμήριο','Archive record'))+'</span><span>↗</span></span>';
  btn.addEventListener('click',()=>open(x.id));frag.append(btn);
 });
 if(!list.length){const p=document.createElement('p');p.className='empty';p.textContent=tr('Δεν βρέθηκαν καταχωρίσεις. Δοκίμασε άλλη αναζήτηση.','No matching records. Try another query.');frag.append(p)}
 $('cards').replaceChildren(frag);
}
function open(id){
 const x=S.items.find(v=>v.id===id);if(!x)return;
 lastFocus=document.activeElement;
 let inner='<div class="detail-year">'+esc(x.year)+'</div><div class="sub">'+esc(tr(...kinds[x.kind]))+' · '+esc(tr(...sports[x.sport]))+'</div><h2>'+esc(x.name)+'</h2><p class="event">'+esc(x.event)+'</p>';
 if(x.context)inner+='<section class="context"><h3>'+tr('Ιστορικό πλαίσιο','Historical context')+'</h3><p>'+esc(x.context)+'</p></section>';
 if(x.qa){inner+='<section class="qa"><h3>'+tr('Η συνέντευξη','The interview')+'</h3>';x.qa.forEach((v,i)=>{inner+='<div class="qa-row"><p class="question">'+(i+1)+'. '+esc(v.question)+'</p><p class="answer">'+esc(v.answer)+'</p></div>'});inner+='</section>'}
 else if(x.quote)inner+='<blockquote class="quote">'+esc(x.quote)+'</blockquote>';
 inner+='<section class="source"><h3>'+tr('Πηγή & τεκμηρίωση','Source & provenance')+'</h3><p>'+esc(x.source)+'</p></section>';
 if(x.needsReview)inner+='<div class="warning">'+tr('Ορισμένες συμπληρωματικές λεπτομέρειες του γεγονότος χρειάζονται διασταύρωση με το πρωτότυπο απόκομμα.','Some contextual details need verification against the original clipping.')+'</div>';
 if(x.personIds&&x.personIds.length){inner+='<div class="links">';x.personIds.forEach(id=>{inner+='<a href="hall-of-fame.html?person='+encodeURIComponent(id)+'">'+tr('Βιογραφικό στο Hall of Fame','Hall of Fame biography')+' ↗</a>'});inner+='</div>'}
 $('detail').innerHTML=inner;
 const dlg=$('dialog');if(!dlg.open)dlg.showModal();$('close').focus();
 const url=new URL(location.href);url.searchParams.set('record',id);history.replaceState(null,'',url);
}
$('close').addEventListener('click',()=>$('dialog').close());
$('dialog').addEventListener('click',e=>{if(e.target===$('dialog'))$('dialog').close()});
$('dialog').addEventListener('close',()=>{lastFocus?.focus?.({preventScroll:true});const url=new URL(location.href);url.searchParams.delete('record');history.replaceState(null,'',url)});
['search','kind','sport'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',showCards));
fetch('interviews.json',{cache:'no-cache'}).then(r=>r.ok?r.json():Promise.reject(Error('HTTP '+r.status))).then(d=>{
 if(!Array.isArray(d.items))throw Error('Bad dataset');
 S.items=d.items;$('totalBadge').textContent=S.items.length+' '+tr('ΤΕΚΜΗΡΙΑ','RECORDS');
 const q=new URLSearchParams(location.search);S.person=q.get('person');S.record=q.get('record');if(q.get('q'))$('search').value=q.get('q');
 showCards();
 if(S.record&&S.items.some(x=>x.id===S.record))open(S.record);
}).catch(()=>{$('count').textContent=tr('Το αρχείο δεν είναι προσωρινά διαθέσιμο.','Archive currently unavailable.')});
function sync(){document.querySelectorAll('[data-el][data-en]').forEach(e=>e.textContent=e.getAttribute(en()?'data-en':'data-el'));if(S.items.length){$('totalBadge').textContent=S.items.length+' '+tr('ΤΕΚΜΗΡΙΑ','RECORDS');showCards()}}
new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
})();
