(function(){'use strict';
const $=id=>document.getElementById(id),field=$('query'),list=$('results'),count=$('count'),more=$('more');
let data=[],found=[],limit=30;
const en=()=>document.documentElement.lang==='en'||document.body.classList.contains('lang-en');
const L=(a,b)=>en()?b:a;
const norm=s=>String(s||'').toLocaleLowerCase('el').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ς/g,'σ').replace(/\s+/g,' ').trim();
const labels={person:['ΠΡΟΣΩΠΟ · HALL OF FAME','PERSON · HALL OF FAME'],interview:['ΣΥΝΕΝΤΕΥΞΗ / ΔΗΛΩΣΗ','INTERVIEW / STATEMENT'],moment:['ΙΣΤΟΡΙΚΟ ΓΕΓΟΝΟΣ','HISTORICAL MOMENT'],match:['RETRO MATCH','RETRO MATCH'],page:['ΣΥΛΛΟΓΗ','COLLECTION']};
function rank(x,q){const t=norm(x.title),s=norm(x.summary),k=norm(x.keywords);
 if(t===q)return 0;if(t.startsWith(q))return 1;if(t.includes(q))return 2;if(s.includes(q))return 3;if(k.includes(q))return 4;return 99}
function search(){
 const value=field.value.trim(),q=norm(value);if(q.length<2){list.replaceChildren();more.style.display='none';count.textContent=L('Αναζήτησε με τουλάχιστον δύο χαρακτήρες.','Search with at least two characters.');return}
 found=data.map((x,i)=>({x,i,r:rank(x,q)})).filter(v=>v.r<99).sort((a,b)=>a.r-b.r||(a.x.type==='interview'?-1:0)-(b.x.type==='interview'?-1:0)||a.i-b.i);
 limit=30;draw();const url=new URL(location.href);url.searchParams.set('q',value);history.replaceState(null,'',url)
}
function draw(){
 const f=document.createDocumentFragment();found.slice(0,limit).forEach(({x})=>{
 const a=document.createElement('a');a.className='hit';a.href=x.href;
 const tag=document.createElement('span');tag.className='tag';tag.textContent=L(...(labels[x.type]||labels.page))+(x.year?' · '+x.year:'');
 const title=document.createElement('strong');title.textContent=x.title;
 const summary=document.createElement('small');summary.textContent=x.summary||'';
 a.append(tag,title,summary);f.append(a);
 });
 list.replaceChildren(f);count.textContent=L(found.length+' αποτελέσματα · '+data.length+' καταχωρίσεις',found.length+' results · '+data.length+' indexed records');
 if(!found.length){const p=document.createElement('p');p.className='empty';p.textContent=L('Δεν βρέθηκαν αποτελέσματα. Δοκίμασε άλλο όνομα ή χρονολογία.','No results found. Try another name or year.');list.append(p)}
 more.style.display=limit<found.length?'block':'none'
}
field.addEventListener('input',search);more.addEventListener('click',()=>{limit+=30;draw()});
fetch('search-index.json',{cache:'no-cache'}).then(r=>r.ok?r.json():Promise.reject()).then(d=>{
 if(!Array.isArray(d.records))throw Error('Bad index');data=d.records;
 const q=new URLSearchParams(location.search).get('q');if(q)field.value=q;search();
}).catch(()=>{count.textContent=L('Η αναζήτηση δεν είναι προσωρινά διαθέσιμη.','Search is temporarily unavailable.')});
new MutationObserver(()=>{
 document.querySelectorAll('[data-el][data-en]').forEach(e=>e.textContent=e.getAttribute(en()?'data-en':'data-el'));
 if(data.length)search();
}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
})();