/* One public relationship index; no heuristic name matching or external data. */
(function(){'use strict';
let pending=null;
const english=()=>document.documentElement.lang==='en';
const LABEL_EN={
 news:'News & Activity',person:'Hall of Fame',event:'Event',
 story:'Story',moment:'70 Moments',interview:'Voices',
 department:'Department',exhibit:'Digital Museum'
};
const LABEL={
 news:'Νέα & Δράση',person:'Hall of Fame',event:'Γεγονός',
 story:'Ιστορία',moment:'70 Στιγμές',interview:'Φωνές',
 department:'Τμήμα',exhibit:'Ψηφιακό Μουσείο'
};
function load(){
 if(!pending)pending=fetch('/assets/site/data/archive-relationships.json',{cache:'no-cache'})
  .then(r=>{if(!r.ok)throw Error('Archive relations HTTP '+r.status);return r.json()})
  .then(graph=>{
   if(graph.schema_version!==1||graph.policy!=='explicit_public_references_only'||
      !graph.by_node||!graph.nodes)throw Error('Unrecognized archive graph');
   return graph;
  }).catch(e=>{pending=null;throw e});
 return pending;
}
function nextToken(){return Math.random().toString(36).slice(2)}
async function append(container,kind,id,options={}){
 if(!container||!id)return;
 const request=nextToken();
 container.dataset.archiveRequest=request;
 try{
  const graph=await load();
  if(!container.isConnected||container.dataset.archiveRequest!==request)return;
  const refs=graph.by_node[String(kind)+':'+String(id)]||[];
  const banned=new Set(options.excludeKinds||[]);
  const seen=new Set(),results=[];
  for(const relation of refs){
   const node=graph.nodes[relation.key];
   if(!node||!node.url||banned.has(node.type))continue;
   if(node.url===location.pathname+location.search)continue;
   if(seen.has(node.url))continue;
   seen.add(node.url);results.push(node);
  }
  // One related link per canonical record. No duplicates from event/article aliases.
  results.sort((a,b)=>{
   const order=['story','moment','interview','event','exhibit','news','person','department'];
   return order.indexOf(a.type)-order.indexOf(b.type)||a.title.localeCompare(b.title,'el');
  });
  const existing=container.querySelector(':scope > .arch-archive-relations');
  existing?.remove();
  if(!results.length)return;
  const section=document.createElement('section');
  section.className='arch-archive-relations';
  section.setAttribute('aria-label',english()?'Related archive records':'Σχετικές καταχωρίσεις ιστορικού αρχείου');
  const heading=document.createElement('strong');
  heading.textContent=english()?'Related records':'Σχετικές καταχωρίσεις';
  const grid=document.createElement('div');
  grid.className='arch-archive-links-grid';
  const max=Math.max(1,Math.min(12,Number(options.limit)||8));
  for(const node of results.slice(0,max)){
   const a=document.createElement('a');
   a.className='arch-archive-link';
   a.href=node.url;
   const type=document.createElement('span');
   type.className='arch-archive-link-kind';
   type.textContent=(english()?LABEL_EN:LABEL)[node.type]||(english()?'Record':'Αρχείο');
   const title=document.createElement('span');
   title.className='arch-archive-link-title';
   title.textContent=node.title;
   a.append(type,title);grid.append(a);
  }
  section.append(heading,grid);
  // Prevent a late network response from reopening or modifying a different popup.
  if(container.isConnected&&container.dataset.archiveRequest===request)
   container.append(section);
 }catch(e){console.warn('Archive relationships unavailable',e)}
}
window.ArchelaosLinks=Object.freeze({load,append});
})();
