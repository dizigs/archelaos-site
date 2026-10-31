/* One local search over validated public archive data. No API calls, tracking or index service. */
(function(){'use strict';
const $=sel=>document.querySelector(sel);
const normalize=s=>window.ArchelaosCatalog.normalize(s);
const state={ready:false,items:[],query:'',filter:'all',limit:24};
const link=href=>window.ArchelaosRoutes?.toStage(href)||href;
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
 const arrow=make('span','sr-card-arrow','↗');arrow.setAttribute('aria-hidden','true');a.append(arrow);
 const wrap=make('div','sr-card-wrap');wrap.append(a,window.ArchelaosFavorites.button(item.type,item.id));return wrap;
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
