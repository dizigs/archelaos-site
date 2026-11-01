/* One local search over validated public archive data. No API calls, tracking or index service. */
(function(){'use strict';
const $=sel=>document.querySelector(sel);
const normalize=s=>window.ArchelaosCatalog.normalize(s);
const state={ready:false,items:[],query:'',filter:'all',limit:24};
const link=href=>window.ArchelaosRoutes?.toStage(href)||href;
const evidence=$('#sr-ai'),evidenceButton=$('#sr-ai-run'),evidenceOutput=$('#sr-ai-output');
const aiEnabled=Boolean(evidence&&evidence.dataset.enabled==='true');
let aiController=null;
function evidenceReset(){
 if(!evidence)return;
 if(aiController){aiController.abort();aiController=null}
 evidenceButton.disabled=false;
 evidenceOutput.replaceChildren();
 const q=state.query.trim();
 evidence.hidden=!aiEnabled||state.filter!=='all'||q.length<4||q.length>300;
}
function safeEvidenceUrl(href){
 if(typeof href!=='string'||!href.startsWith('/')||href.startsWith('//')||href.includes('\\'))return null;
 try{
  const u=new URL(href,location.origin);
  if(u.origin!==location.origin||!/^\/(?:hall-of-fame|70-stigmes|stories|history|tmimata|interviews|index)\.html$/.test(u.pathname))return null;
  return window.ArchelaosRoutes?.toStage(u.pathname+u.search+u.hash)||u.pathname+u.search+u.hash;
 }catch(_){return null}
}
async function askEvidence(){
 if(!aiEnabled||!state.ready||!evidence||evidence.hidden)return;
 const q=state.query.trim();
 if(q.length<4||q.length>300)return;
 if(aiController)aiController.abort();
 const controller=new AbortController();aiController=controller;
 evidenceButton.disabled=true;
 evidenceOutput.replaceChildren(make('p','', 'Αναζητούνται τεκμηριωμένες πληροφορίες…'));
 try{
  const response=await fetch('/api/ask',{
   method:'POST',credentials:'same-origin',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({question:q}),signal:controller.signal
  });
  if(!response.ok)throw Error(response.status===429?'limit':'service');
  const data=await response.json();
  if(controller!==aiController||q!==state.query.trim())return;
  evidenceOutput.replaceChildren(make('p','',String(data.answer||'Δεν υπάρχουν επαρκή τεκμήρια.').slice(0,2500)));
  const sources=Array.isArray(data.sources)?data.sources.slice(0,6):[];
  if(sources.length){
   const heading=make('strong','', 'Τεκμήρια στο αρχείο'),list=make('ol','sr-ai-sources');
   for(const src of sources){
    const href=safeEvidenceUrl(src?.url);
    if(!href)continue;
    const li=make('li'),a=make('a','',String(src.title||'Πηγή').slice(0,160));
    a.href=href;li.append(a);list.append(li);
   }
   if(list.children.length)evidenceOutput.append(heading,list);
  }
 }catch(error){
  if(error.name!=='AbortError'&&controller===aiController){
   evidenceOutput.replaceChildren(make('p','',error.message==='limit'
    ?'Η ημερήσια δυνατότητα τεκμηριωμένης σύνοψης εξαντλήθηκε. Τα κανονικά αποτελέσματα παραμένουν διαθέσιμα.'
    :'Η σύνοψη δεν είναι διαθέσιμη αυτή τη στιγμή. Δείτε τα κανονικά αποτελέσματα παρακάτω.'));
  }
 }finally{
  if(controller===aiController){aiController=null;evidenceButton.disabled=false}
 }
}
if(evidenceButton)evidenceButton.addEventListener('click',askEvidence);

const make=(tag,cls,value)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(value!==undefined)e.textContent=value;return e};
function score(item,tokens){
 const title=normalize(item.title),sub=normalize(item.subtitle),scoreText=item.text;
 let points=0;
 for(const token of tokens){
  if(!scoreText.includes(token))return -1;
  points+=title===token?30:title.startsWith(token)?16:title.includes(token)?11:normalize(sub).includes(token)?6:2;
 }
 return points;
}
function card(item){
 const a=make('a','sr-card');a.href=link(item.url);
 a.append(make('span','sr-card-kind',item.kindLabel));
 a.append(make('strong','sr-card-title',item.title));
 if(item.excerpt)a.append(make('span','sr-card-excerpt',item.excerpt));
 if(item.year)a.append(make('small','sr-card-year',item.year));

 const wrap=make('div','sr-card-wrap');wrap.append(a);if(!['interview','department','fixture'].includes(item.type)&&window.ArchelaosFavorites?.button)wrap.append(window.ArchelaosFavorites.button(item.type,item.id));return wrap;
}
function render(){
 if(!state.ready)return;
 const q=normalize(state.query),tokens=q.split(/\s+/).filter(Boolean);
 const matched=state.items.filter(item=>state.filter==='all'||item.type===state.filter)
  .map(item=>({item,relevance:tokens.length?score(item,tokens):0}))
  .filter(result=>result.relevance>=0)
  .sort((a,b)=>b.relevance-a.relevance||a.item.title.localeCompare(b.item.title,'el'));
 const results=$('#sr-results'),limit=matched.slice(0,state.limit);
 results.replaceChildren();
 if(!limit.length){
  results.append(make('p','sr-empty','Δεν βρέθηκαν αποτελέσματα. Δοκιμάστε διαφορετικό όνομα, άθλημα ή χρονολογία.'));
 }else{
  const frag=document.createDocumentFragment();
  for(const row of limit)frag.append(card(row.item));
  results.append(frag);
 }
 $('#sr-status').textContent=matched.length+' αποτελέσματα από '+state.items.length+' αρχειακές καταχωρίσεις';
 $('#sr-clear').hidden=!q;
 evidenceReset();
 $('#sr-more').hidden=matched.length<=state.limit;
 window.ArchelaosMotion?.observe(results);
}
async function init(){
 const input=$('#sr-query');let debounce;
 input.addEventListener('input',()=>{
  clearTimeout(debounce);debounce=setTimeout(()=>{state.query=input.value;state.limit=24;render()},140);
 });
 $('#sr-clear').addEventListener('click',()=>{input.value='';state.query='';state.limit=24;render();input.focus()});
 document.querySelectorAll('[data-sr-filter]').forEach(btn=>btn.addEventListener('click',()=>{
  state.filter=btn.dataset.srFilter;state.limit=24;
  document.querySelectorAll('[data-sr-filter]').forEach(other=>other.setAttribute('aria-pressed',String(other===btn)));
  render();
 }));
 $('#sr-more-button').addEventListener('click',()=>{state.limit+=24;render()});
 try{
  const catalog=await window.ArchelaosCatalog.load();
  // Photos have their own collection, not thousands of duplicate search thumbnails.
  state.items=catalog.records.filter(item=>item.type!=='photo')
    .map(item=>({...item,text:item.searchText}));
  state.ready=true;
  const params=new URLSearchParams(location.search),seed=params.get('q')||'';
  if(seed){input.value=seed.slice(0,120);state.query=input.value}
  render();
  if(!seed&&matchMedia('(min-width:850px)').matches)input.focus({preventScroll:true});
 }catch(err){console.error('Archive search failed:',err);$('#sr-status').textContent='Η αναζήτηση δεν είναι προσωρινά διαθέσιμη. Μπορείτε να περιηγηθείτε από το μενού.'}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
