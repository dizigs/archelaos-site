/* Standalone 70 Moments reader. Data is verbatim from backup and fetched once. */
(function(){'use strict';
const q=s=>document.querySelector(s);
const state={data:[],decade:'all',lang:'el'};
const decades=['all','1950','1960','1970','1980','1990','2000','2010','2020'];
const picks=[3,50,53,41,57];
const en=()=>state.lang==='en';
const tr=(el,english)=>en()?english:el;
const field=(item,k)=>en()?(item[k+'_en']||item[k]):item[k];
function elem(tag,cls,txt){const node=document.createElement(tag);if(cls)node.className=cls;if(txt!==undefined)node.textContent=txt;return node}
const yearDecade=item=>Math.floor(parseInt(item.year,10)/10)*10;
function show(item){
 const body=field(item,'body')||[];
 window.ArchelaosUI.openDialog({
  title:field(item,'title'),subtitle:String(item.year),
  paragraphs:body,sources:[],closeLabel:tr('Κλείσιμο ιστορίας','Close story')
 });
}
function filters(){
 const root=q('#rm-filters');root.replaceChildren();
 for(const decade of decades){
  const label=decade==='all'?tr('Όλες οι περίοδοι','All periods'):
    decade==='2020'?'2020–26':decade+'–'+String(Number(decade)+9).slice(-2);
  const button=elem('button',decade===state.decade?'selected':'',label);button.type='button';button.setAttribute('aria-pressed',String(decade===state.decade));
  button.addEventListener('click',()=>{state.decade=decade;render()});root.append(button);
 }
}
function makeCard(item){
 const article=elem('article','rm-moment');article.id='moment-'+item.id;
 const btn=elem('button','rm-card');btn.type='button';
 btn.setAttribute('aria-label',item.year+' — '+field(item,'title'));
 const year=elem('span','rm-year',item.year),arrow=elem('span','rm-arrow','↗'),title=elem('span','rm-title',field(item,'title')),watermark=elem('span','rm-watermark',item.year);
 arrow.setAttribute('aria-hidden','true');watermark.setAttribute('aria-hidden','true');
 btn.append(year,arrow,title,watermark);
 btn.addEventListener('click',()=>show(item));article.append(btn);return article;
}
function render(){
 filters();
 const filtered=state.data.filter(item=>state.decade==='all'||yearDecade(item)===Number(state.decade));
 q('#rm-count').textContent=tr(filtered.length+' από τις 70 ιστορικές στιγμές',filtered.length+' of 70 historical moments');
 const container=q('#moments-list');container.replaceChildren();
 const fragment=document.createDocumentFragment();let lastDecade;
 for(const item of filtered){
  const d=yearDecade(item);
  if(d!==lastDecade){const label=d===2020?'2020 — 2026':d+' — '+(d+9);fragment.append(elem('h2','rm-decade',label));lastDecade=d}
  fragment.append(makeCard(item));
 }
 container.append(fragment);
}
function renderFeatured(){
 const root=q('#rm-featured-grid');root.replaceChildren();
 const fragment=document.createDocumentFragment();
 for(const id of picks){
  const item=state.data.find(row=>row.id===id);if(!item)continue;
  const btn=elem('button','rm-featured-item');btn.type='button';
  btn.append(elem('span','',item.year),elem('strong','',field(item,'title')),elem('span','rm-featured-arrow','↗'));
  btn.addEventListener('click',()=>{
   state.decade='all';render();
   const card=q('#moment-'+id);card?.scrollIntoView({block:'center',behavior:'auto'});card?.querySelector('button')?.focus({preventScroll:true});
  });fragment.append(btn);
 }root.append(fragment);
}
function apply(){
 document.documentElement.lang=state.lang;
 document.querySelectorAll('[data-el][data-en]').forEach(node=>node.textContent=node.getAttribute(en()?'data-en':'data-el'));
 q('#rm-language').textContent=en()?'EN / GR':'GR / EN';
 render();renderFeatured();
}
async function init(){
 try{state.lang=localStorage.getItem('archelaos_lang')==='en'?'en':'el'}catch(_){}
 q('#rm-language').addEventListener('click',()=>{
  state.lang=en()?'el':'en';try{localStorage.setItem('archelaos_lang',state.lang)}catch(_){}
  apply();
 });
 try{
  const res=await fetch('/rebuild/data/moments.json');
  if(!res.ok)throw Error('Moments HTTP '+res.status);
  const json=await res.json();if(!Array.isArray(json.moments)||json.moments.length!==70)throw Error('Invalid moments count');
  state.data=json.moments;apply();
  const id=Number(location.hash.match(/^#moment-(\d+)$/)?.[1]);
  if(id>=1&&id<=70){const card=q('#moment-'+id);card?.scrollIntoView({block:'center',behavior:'auto'})}
 }catch(err){console.error('Archive moments:',err);q('#rm-count').textContent=tr('Αδυναμία φόρτωσης του χρονολογίου.','Could not load the timeline.')}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
