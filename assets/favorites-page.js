(()=>{'use strict';const $=id=>document.getElementById(id),F=window.ArchelaosFavorites;if(!F)return;
const typeLabels={person:'ΠΡΟΣΩΠΟ',moment:'ΙΣΤΟΡΙΚΗ ΣΤΙΓΜΗ',story:'ΙΣΤΟΡΙΑ',photo:'ΦΩΤΟΓΡΑΦΙΑ',exhibit:'ΕΚΘΕΜΑ',interview:'ΣΥΝΕΝΤΕΥΞΗ',news:'ΝΕΑ & ΔΡΑΣΗ',view:'ΑΠΟΘΗΚΕΥΜΕΝΟ',match:'ΑΓΩΝΑΣ',page:'ΣΕΛΙΔΑ'};
const byKey=new Map();
function titleCase(x){return String(x||'').replace(/[-_]/g,' ')}
function getRecord(x){
 const m=F.meta()[x.type+':'+x.id];if(m?.href)return {title:m.title||'Αποθηκευμένο',href:m.href,summary:m.summary||''};
 const k=x.type+':'+x.id;if(byKey.has(k))return byKey.get(k);
 const href=x.type==='person'?'people/'+x.id+'.html':x.type==='interview'?'interviews.html?record='+encodeURIComponent(x.id):x.type==='news'?'news.html?article='+encodeURIComponent(x.id):x.type==='moment'?'70-stigmes.html':x.type==='story'?'stories.html':x.type==='photo'?'index.html#departments':'history.html';
 return {title:titleCase(x.id),href,summary:''};
}
const el=(tag,cls,txt)=>{const e=document.createElement(tag);e.className=cls||'';if(txt!=null)e.textContent=txt;return e};
function render(){
 const all=F.get(),frag=document.createDocumentFragment();
 for(const x of all){const r=getRecord(x),article=el('article','af-card');const tag=el('span','af-kind',typeLabels[x.type]||'ΑΓΑΠΗΜΕΝΟ'),title=el('h2','',r.title),p=el('p','',r.summary||'Αποθηκευμένο στοιχείο του Αρχέλαου');
 const actions=el('div','af-actions'),link=el('a','', 'Άνοιγμα ↗');
 link.href=r.href;const heart=F.button(x.type,x.id,'',r);actions.append(link,heart);article.append(tag,title,p,actions);frag.append(article)}
 if(!all.length){const p=el('div','af-empty');p.append(el('h2','','Η συλλογή σας περιμένει.'),el('p','','Πατήστε ♡ σε νέα, ιστορίες και βιογραφικά για να τα κρατήσετε εδώ.'));const a=el('a','','Εξερευνήστε τον Αρχέλαο ↗');a.href='search.html';p.append(a);frag.append(p)}
 $('af-grid').replaceChildren(frag);$('af-total').textContent=all.length+' αποθηκευμένα';$('af-clear').hidden=!all.length;
}
$('af-clear').addEventListener('click',()=>{if(confirm('Να αφαιρεθούν όλα τα αποθηκευμένα αγαπημένα από αυτή τη συσκευή;'))F.clear()});
document.addEventListener('archelaos:favorites-change',render);
Promise.all([
fetch('search-index.json').then(r=>r.ok?r.json():{records:[]}).catch(()=>({records:[]})),
fetch('hall-of-fame-people.json').then(r=>r.ok?r.json():{people:[]}).catch(()=>({people:[]})),
fetch('news.json').then(r=>r.ok?r.json():{items:[]}).catch(()=>({items:[]}))
]).then(([search,people,news])=>{
 (people.people||[]).forEach(p=>byKey.set('person:'+p.id,{title:p.name,href:'people/'+p.id+'.html',summary:p.role}));
 (news.items||[]).forEach(p=>byKey.set('news:'+p.id,{title:p.title,href:'news.html?article='+encodeURIComponent(p.id),summary:p.summary}));
 (search.records||[]).forEach(r=>{if(!r.href)return;const url=new URL(r.href,location.href);let type=r.type,id;
 if(type==='interview')id=url.searchParams.get('record');if(type==='person')id=url.pathname.match(/\/people\/(arch-[^/]+)\.html$/)?.[1];
 if(type==='moment')id=url.searchParams.get('moment')||url.hash.replace('#moment-','');if(type==='story')id=url.searchParams.get('story')||url.hash.replace('#story-','');
 if(id)byKey.set(type+':'+id,{title:r.title,href:r.href,summary:r.summary})});
 render()
}).catch(render);render();
})();