/* Archelaos unified biography links — V1: current Hall of Fame V11 / 405 names. */
(()=>{'use strict';
const INDEX_URL='archelaos-person-index.json', DATA_URL='archelaos-people.json';
const norm=s=>(s||'').toLocaleLowerCase('el').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ς/g,'σ').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
const safeText=s=>String(s||'');
const state={entries:null, people:null, unresolved:[], index:null};
const articleSelector=document.body.dataset.archPeoplePage==='board'
 ? '.executive-board-name, .pbh-presidency-body, .pbh-history-content, #historyArchiveContent, #historyArchiveModal, .history-archive-content'
 : '.history-archive-content, #historyArchiveContent, #historyArchiveModal, #chapters, #sports-archive, #museum-exhibits, .wiki-article, .museum-history-person, .museum-story-content, #museum-gallery, #archStoryGrid, #archStoryDialogContent';
const excluded='script,style,noscript,textarea,input,button,a,select,option,nav,header,footer,code,pre,[contenteditable],.arch-person-dialog,[data-no-person-links],.modal-close-btn';
const firstName = s => /^[\p{L}]{2,}/u.test(s);
function buildIndex(items){
 const variants=new Map(), ambiguous=new Set();
 for(const p of items){
  for(const label of [...new Set([p.name,...(p.names||[])])]){
   const key=norm(label); if(!key||key.split(' ').length<2||!firstName(key))continue;
   if(variants.has(key)&&variants.get(key).id!==p.id)ambiguous.add(key); else variants.set(key,{...p,label});
  }
  if(p.name_en){const key=norm(p.name_en);if(key.split(' ').length>=2){if(variants.has(key)&&variants.get(key).id!==p.id)ambiguous.add(key);else variants.set(key,{...p,label:p.name_en})}}
 }
 ambiguous.forEach(k=>variants.delete(k));
 const labels=[...variants.keys()].sort((a,b)=>b.length-a.length);
 const byFirst=new Map(); for(const key of labels){const first=key.split(' ')[0];if(!byFirst.has(first))byFirst.set(first,[]);byFirst.get(first).push(key)}
 state.index={variants,byFirst};
}
function candidateMatches(text){
 const output=[];const tokenRx=/[\p{L}\p{N}]+/gu;const tokens=[];let m;
 while((m=tokenRx.exec(text))){tokens.push({value:norm(m[0]),start:m.index,end:tokenRx.lastIndex})}
 for(let i=0;i<tokens.length;i++){
  const matches=state.index.byFirst.get(tokens[i].value)||[];let found=null;
  for(const k of matches){const words=k.split(' ');if(words.length>tokens.length-i)continue;
   if(words.every((word,j)=>word===tokens[i+j].value)){found={start:tokens[i].start,end:tokens[i+words.length-1].end,id:state.index.variants.get(k).id};break}
  }
  if(found){output.push(found);while(i+1<tokens.length&&tokens[i+1].start<found.end)i++}
 }
 return output;
}
function linkTextNode(node){
 if(!node.parentElement||node.parentElement.closest(excluded))return 0;
 const t=node.nodeValue;if(!t||t.length>25000||t.trim().length<7)return 0;
 const found=candidateMatches(t); if(!found.length)return 0;
 const frag=document.createDocumentFragment();let last=0;
 for(const x of found){if(x.start>last)frag.append(document.createTextNode(t.slice(last,x.start)));
  const btn=document.createElement('button');btn.type='button';btn.className='arch-person-link';btn.dataset.archPersonId=x.id;btn.textContent=t.slice(x.start,x.end);btn.title='Προβολή βιογραφικού / View biography';
  btn.setAttribute('aria-label',btn.textContent+' — βιογραφικό / biography');frag.append(btn);last=x.end;
 }
 if(last<t.length)frag.append(document.createTextNode(t.slice(last)));
 node.replaceWith(frag);return found.length;
}
function scan(root){if(!state.index||!root||root.closest?.('.arch-person-dialog'))return 0;
 const scopes=[]; if(root.matches?.(articleSelector))scopes.push(root);root.querySelectorAll?.(articleSelector).forEach(n=>scopes.push(n));
 let n=0;const visited=new Set();
 for(const el of scopes){if(visited.has(el))continue;visited.add(el);
  const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,{acceptNode(node){return node.parentElement?.closest(excluded)?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT}});
  const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);for(const nd of nodes)n+=linkTextNode(nd);
 }
 return n;
}
let modal=null,prevFocus=null;
function ensureModal(){if(modal)return modal;
 modal=document.createElement('dialog');modal.className='arch-person-dialog';modal.setAttribute('aria-label','Βιογραφικό / Biography');
 modal.innerHTML='<div class="arch-person-inner"><div class="arch-person-top"><span class="arch-person-kicker">ΑΡΧΕΛΑΟΣ · HALL OF FAME</span><button class="arch-person-close" type="button" aria-label="Κλείσιμο / Close">×</button></div><div class="arch-person-monogram" aria-hidden="true"></div><div class="arch-person-role"></div><h2 class="arch-person-name"></h2><p class="arch-person-biography"></p></div>';
 document.body.append(modal);modal.querySelector('.arch-person-close').addEventListener('click',()=>modal.close());modal.addEventListener('click',e=>{if(e.target===modal)modal.close()});modal.addEventListener('close',()=>prevFocus?.focus?.({preventScroll:true}));return modal;
}
async function show(id){const d=ensureModal();prevFocus=document.activeElement;const lang=document.body.classList.contains('lang-en')||document.documentElement.lang==='en'?'en':'el';
 try{if(!state.people){const r=await fetch(DATA_URL,{cache:'no-cache'});if(!r.ok)throw new Error('HTTP '+r.status);state.people=(await r.json()).people}
  const p=state.people.find(x=>x.id===id);if(!p)throw new Error('No matching record');
  d.querySelector('.arch-person-monogram').textContent=(lang==='en'?(p.name_en||p.name):p.name).charAt(0);
  d.querySelector('.arch-person-role').textContent=lang==='en'?(p.role_en||p.role):(p.role||'');
  d.querySelector('.arch-person-name').textContent=lang==='en'?(p.name_en||p.name):p.name;
  d.querySelector('.arch-person-biography').textContent=lang==='en'?(p.bio_en||p.bio||''):(p.bio||'');
  d.showModal();d.querySelector('.arch-person-close').focus();
 }catch(err){console.warn('Archelaos person index unavailable',err);d.querySelector('.arch-person-name').textContent=lang==='en'?'Biography temporarily unavailable':'Το βιογραφικό δεν είναι προσωρινά διαθέσιμο';d.querySelector('.arch-person-biography').textContent=lang==='en'?'Please verify that both JSON files were uploaded together.':'Ελέγξτε ότι ανεβάσατε και τα δύο αρχεία JSON μαζί με τις ιστοσελίδες.';d.showModal()}
}
document.addEventListener('click',e=>{const b=e.target.closest('.arch-person-link');if(!b)return;e.stopPropagation();e.preventDefault();show(b.dataset.archPersonId)},true);
document.addEventListener('keydown',e=>{const b=e.target.closest('.arch-person-link');if(!b||!['Enter',' '].includes(e.key))return;e.stopPropagation();e.preventDefault();show(b.dataset.archPersonId)},true);
async function init(){try{const r=await fetch(INDEX_URL,{cache:'no-cache'});if(!r.ok)throw Error('HTTP '+r.status);buildIndex(await r.json());scan(document.body);
 let scheduled=false;const observer=new MutationObserver(muts=>{if(scheduled)return;if(!muts.some(m=>m.addedNodes.length))return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;for(const m of muts){m.addedNodes.forEach(n=>{if(n.nodeType===1)scan(n)})}})});
 observer.observe(document.body,{childList:true,subtree:true});
 }catch(e){console.warn('Archelaos linked biographies inactive: missing JSON index',e)}}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();