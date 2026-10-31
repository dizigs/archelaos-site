/* Source-of-truth museum content: extracted from October 31 backup. */
(function(){'use strict';
const $=s=>document.querySelector(s);
const C=[
 {title:'Οι Άνθρωποι του Αρχέλαου',marker:'1956',href:'/hall-of-fame.html',tone:'green'},
 {title:'70 χρόνια · 70 στιγμές',marker:'70',href:'/70-stigmes.html',tone:'cream'},
 {title:'Οι Ιστορίες μας',marker:'2026',href:'/stories.html',tone:'green'}
];
const exhibits=[
 ['1956','Η αρχή μιας διαδρομής','29 Απριλίου 1956 — η ίδρυση του συλλόγου στην Κατερίνη.','intro'],
 ['1968','Τα χρώματα της ταυτότητας','27 Ιουνίου 1968 — καθιέρωση του πράσινου και του κίτρινου.','intro'],
 ['1957','Η γέννηση των «Δίιων»','Οι πρώτοι αγώνες «Δίια» στην Κατερίνη.','diia']
];
const sports=['handball','track','archery','shooting','gymnastics','volleyball','wrestling','swimming','basketball','inactive-depts'];
const $el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
let records=new Map();
function safeArticle(original){
 const doc=new DOMParser().parseFromString(original,'text/html');
 const root=doc.body.firstElementChild;if(!root)return document.createDocumentFragment();
 // Sanitize archived HTML: no scripts, event attributes or legacy CSS/behaviors.
 doc.querySelectorAll('script,style,iframe,object,embed,form,template').forEach(n=>n.remove());
 for(const node of [...root.querySelectorAll('[data-lang],.lang-el,.lang-en,.arch-collection-el,.arch-collection-en')]){
  const lang=node.getAttribute('data-lang');
  const bad=lang==='en'||node.classList.contains('lang-en')||node.classList.contains('arch-collection-en');
  if(bad)node.remove();
 }
 for(const button of [...root.querySelectorAll('button')])button.replaceWith(...button.childNodes);
 for(const node of [root,...root.querySelectorAll('*')]){
  for(const attr of [...node.attributes]){
   const key=attr.name;
   if(['href','src','alt','title','colspan','rowspan'].includes(key))continue;
   node.removeAttribute(key);
  }
  if(node.tagName==='A'){
   let href=node.getAttribute('href')||'';
   if(/^people\//.test(href)){href='/'+href;node.setAttribute('href',href)}
   try{
    const url=new URL(href,location.href);
    if(!['http:','https:'].includes(url.protocol))node.removeAttribute('href');
    else if(url.origin!==location.origin){node.setAttribute('target','_blank');node.setAttribute('rel','noopener noreferrer')}
   }catch(_){node.removeAttribute('href')}
  }
 }
 root.className='mu-article';
 const fragment=document.createDocumentFragment();fragment.append(root);
 return fragment;
}
function open(id){
 const record=records.get(id);if(!record)return;
 window.ArchelaosUI.openDialog({title:record.title,subtitle:record.period||'',contentNode:safeArticle(record.html),closeLabel:'Κλείσιμο ιστορικού'});
}
function makeButton(record,cls){
 const button=$el('button',cls);button.type='button';
 if(record.period)button.append($el('span','',record.period));
 button.append($el('strong','',record.title),$el('b','','↗'));
 button.addEventListener('click',()=>open(record.id));
 return button;
}
function populate(data){
 records=new Map(data.articles.map(x=>[x.id,x]));
 const collections=$('#mu-collection-cards');
 C.forEach(x=>collections.append(window.ArchelaosUI.card(x)));
 const exhibitsRoot=$('#mu-exhibit-cards');
 for(const [year,title,desc,id] of exhibits){
  const b=$el('button','mu-exhibit');b.type='button';b.setAttribute('data-year',year);
  b.append($el('span','',year),$el('strong','',title),$el('small','',desc));b.addEventListener('click',()=>open(id));exhibitsRoot.append(b);
 }
 for(const p of data.press){records.set(p.id,p);$('#mu-press-grid').append(makeButton({id:p.id,title:p.title,period:p.year},'mu-press-item'))}
 for(const id of ['intro','dioikisi','egkatastaseis','diia']){
  const record=records.get(id);if(record)$('#mu-history-grid').append(makeButton(record,'mu-archive-item'));
 }
 for(const id of sports){const record=records.get(id);if(!record)continue;
  const tile=makeButton(record,'mu-sport-item');tile.id='sport-'+id;
  $('#mu-sports-grid').append(tile);
 }
 for(const [id,record] of records){
  if(sports.includes(id)||['intro','dioikisi','egkatastaseis','diia'].includes(id))continue;
  if(!id.startsWith('arch-press-'))$('#mu-history-grid').append(makeButton(record,'mu-archive-item'));
 }
}
async function init(){
 try{
  const response=await fetch('/rebuild/data/museum.json');if(!response.ok)throw Error('HTTP '+response.status);
  const data=await response.json();if(!Array.isArray(data.articles)||data.articles.length<13)throw Error('Archive incomplete');
  populate(data);
  const sport=location.hash.match(/^#sport-(.+)$/)?.[1];
  if(sport){const card=$('#sport-'+sport);card?.scrollIntoView({block:'center'});card?.focus({preventScroll:true})}
 }catch(err){console.error('Museum data:',err);$('#mu-history-grid').textContent='Αδυναμία φόρτωσης ιστορικού αρχείου.'}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
