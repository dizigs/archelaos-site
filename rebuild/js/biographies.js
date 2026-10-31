/* All bios use the single historical JSON file from the Oct 31 backup. */
(function(){'use strict';
let cached;
function load(){
 return cached??=fetch('/rebuild/data/people.json').then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()})
  .then(data=>{if(!Array.isArray(data.people))throw Error('Biography data malformed');return {
    people:data.people,byId:new Map(data.people.map(person=>[person.id,person]))
   }}).catch(err=>{cached=undefined;throw err});
}
const english=()=>document.documentElement.lang.toLowerCase().startsWith('en');
function field(person,key){return english()?(person[key+'_en']||person[key]||''):(person[key]||'')}
function show(person){
 if(!person||!window.ArchelaosUI)return false;
 const txt=field(person,'bio');
 window.ArchelaosUI.openDialog({
  title:field(person,'name'),subtitle:field(person,'role'),
  paragraphs:txt.split(/\n\s*\n/).map(v=>v.trim()).filter(Boolean),
  sources:Array.isArray(person.refs)?person.refs:[],
  closeLabel:english()?'Close biography':'Κλείσιμο βιογραφικού',
  sourcesLabel:english()?'Sources':'Πηγές'
 });return true;
}
async function open(id){const data=await load();return show(data.byId.get(id))}
function idFromLink(href){
 try{const url=new URL(href,location.href);if(url.origin!==location.origin)return null;
  return url.pathname.match(/^\/people\/(arch-[a-z0-9-]+)\.html$/)?.[1]||null;}
 catch{return null}
}
document.addEventListener('click',async event=>{
 const link=event.target.closest?.('a[href*="/people/"]');
 if(!link||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey||link.target==='_blank'||link.hasAttribute('download'))return;
 const id=idFromLink(link.href);if(!id)return;
 event.preventDefault();
 try{if(!await open(id))location.assign(link.href)}catch(err){console.warn('Biography fallback:',err);location.assign(link.href)}
});
window.ArchelaosBio=Object.freeze({load,open,show,field});
})();
