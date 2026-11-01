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
 ['1968','Τα χρώματα της ταυτότητας','27 Ιουνίου 1968 — καθιέρωση του πράσινου και του κίτρινου.','colors-1968'],
 ['1957','Η γέννηση των «Δίιων»','Οι πρώτοι αγώνες «Δίια» στην Κατερίνη.','diia'],
 ['1956—2026','Διοικητική Ιστορία','Τα διοικητικά συμβούλια, οι πρόεδροι και οι σταθμοί της πορείας του συλλόγου.','dioikisi','ΔΣ'],
 ['ΙΣΤΟΡΙΚΟ ΑΡΧΕΙΟ','Αθλητικές Εγκαταστάσεις','Οι αθλητικοί χώροι που φιλοξένησαν τις προπονήσεις και τους αγώνες του Αρχέλαου.','egkatastaseis','Α']
];
const sports=['handball','track','archery','shooting','gymnastics','volleyball','wrestling','swimming','basketball','inactive-depts'];
const $el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
let records=new Map();

function open(id){
 const record=records.get(id);if(!record)return;
 window.ArchelaosUI.openDialog({title:record.title,subtitle:record.period||record.year||'',
  contentNode:window.ArchelaosArchive.fragment(record.html),
  favorite:{type:'exhibit',id:record.id},closeLabel:'Κλείσιμο ιστορικού'});
 history.replaceState(null,'','#archive-'+encodeURIComponent(record.id));
}
function makeButton(record,cls){
 const button=$el('button',cls);button.type='button';
 if(record.period)button.append($el('span','',record.period));
 button.append($el('strong','',record.title));
 button.addEventListener('click',()=>open(record.id));
 return button;
}
function populate(data){
 records=new Map(data.articles.map(x=>[x.id,x]));
 const collections=$('#mu-collection-cards');
 C.forEach(x=>collections.append(window.ArchelaosUI.card(x)));
 const exhibitsRoot=$('#mu-exhibit-cards');
 for(const [year,title,desc,id,ghost=year] of exhibits){
  if(!records.has(id))throw Error('Missing museum exhibit: '+id);
  const b=$el('button','mu-exhibit');b.type='button';
  b.dataset.year=year;b.dataset.ghost=ghost;
  b.append($el('span','',year),$el('strong','',title),$el('small','',desc));
  b.addEventListener('click',()=>open(id));exhibitsRoot.append(b);
 }
 // Retain every historical record for search, favorites and bookmarked deep links;
 // only the five curated exhibits belong on this Museum page.
 for(const p of data.press)records.set(p.id,p);
 window.ArchelaosMotion?.observe(document);
}
async function init(){
 try{
  const response=await fetch('/rebuild/data/museum.json');if(!response.ok)throw Error('HTTP '+response.status);
  const data=await response.json();if(!Array.isArray(data.articles)||data.articles.length<13)throw Error('Archive incomplete');
  populate(data);
  const sport=location.hash.match(/^#sport-(.+)$/)?.[1];
  if(sport){location.replace('/tmimata.html#sport-'+encodeURIComponent(sport));return}
  const archiveId=location.hash.startsWith('#archive-')?
    decodeURIComponent(location.hash.slice('#archive-'.length)):null;
  if(archiveId&&records.has(archiveId))open(archiveId);
 }catch(err){console.error('Museum data:',err);$('#mu-exhibit-cards').textContent='Αδυναμία φόρτωσης ιστορικού αρχείου.'}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
