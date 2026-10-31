/* 21 original Greek story texts from archived homepage, displayed as common dialogs. */
(function(){'use strict';
const s={stories:[],search:''};
const $=x=>document.querySelector(x);
const norm=text=>String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('el');
function el(tag,cls,txt){const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n}
function read(story,index){
 const body=String(story.text||'').split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);
 // The shared modal preserves source narrative; reconstructed dialogue remains italic/gold.
 window.ArchelaosUI.openDialog({
  title:story.title,subtitle:[story.sport,story.year].filter(Boolean).join(' · '),
  paragraphs:body,favorite:{type:'story',id:index+1},closeLabel:'Κλείσιμο ιστορίας'
 });
 const dlg=document.querySelector('.arch-dialog');
 dlg?.querySelectorAll('.arch-dialog-body p').forEach(p=>{
  const t=p.textContent.trim();if(/^[«“"]/.test(t))p.classList.add('arch-dialog-quote');
 });
 history.replaceState(null,'','#story-'+(index+1));
}
function card(story,index,featured=false){
 const btn=el('button',featured?'rs-featured-card':'rs-card');btn.type='button';
 btn.setAttribute('aria-label','Διαβάστε: '+story.title);
 if(featured){
  const copy=el('div');
  copy.append(el('span','rs-meta',story.sport+' · '+story.year),el('h3','',story.title),el('p','',story.lead));
  const mark=el('span','rs-featured-watermark',String(story.year||'').replace(/[^\d]/g,''));
  mark.setAttribute('aria-hidden','true');btn.append(copy,mark);
 }else{
  btn.append(el('span','',story.sport+' · '+story.year),el('strong','',story.title),el('small','',story.lead),el('b','','↗'));
 }
 btn.addEventListener('click',()=>read(story,index));const wrap=el('div','rs-card-wrap');wrap.append(btn,window.ArchelaosFavorites.button('story',index+1));return wrap;
}
function render(){
 const query=norm(s.search);
 const matches=s.stories.map((v,i)=>({story:v,index:i})).filter(x=>!query||norm([x.story.sport,x.story.year,x.story.title,x.story.lead,x.story.text].join(' ')).includes(query));
 $('#rs-count').textContent=matches.length+' από '+s.stories.length+' ιστορίες';
 const featured=$('#rs-featured'),grid=$('#rs-grid');featured.replaceChildren();grid.replaceChildren();
 if(!matches.length){grid.append(el('p','rs-empty','Δεν βρέθηκαν ιστορίες με αυτό το κριτήριο.'));return}
 const [first,...rest]=matches;featured.append(card(first.story,first.index,true));
 const frag=document.createDocumentFragment();rest.forEach(x=>frag.append(card(x.story,x.index)));grid.append(frag);
 window.ArchelaosMotion?.observe(document);
}
async function init(){
 $('#rs-search').addEventListener('input',e=>{s.search=e.target.value;render()});
 try{
  const r=await fetch('/rebuild/data/stories.json');if(!r.ok)throw Error('Stories HTTP '+r.status);
  const data=await r.json();if(!Array.isArray(data.stories)||data.stories.length<21)throw Error('Invalid stories archive');
  s.stories=data.stories;render();
  const id=Number(location.hash.match(/^#story-(\d+)$/)?.[1]);
  if(id>=1&&id<=s.stories.length)read(s.stories[id-1],id-1);
 }catch(e){console.error('Story archive:',e);$('#rs-count').textContent='Αδυναμία φόρτωσης των ιστοριών.'}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
