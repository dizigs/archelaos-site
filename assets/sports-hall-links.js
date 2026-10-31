/* Connect verified exact-name mentions in department histories to the shared Hall of Fame biography popup. */
(()=>{'use strict';
 const history=document.getElementById('atlas-content'),timeline=document.getElementById('atlas-event-detail');
 if(!history||!timeline)return;
 const clean=s=>String(s||'').toLocaleLowerCase('el');
 const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 let re=null,ids=new Map(),scheduled=false;
 function linkNode(node){
   if(!re||!node.parentElement||!node.isConnected)return;
   if(node.parentElement.closest('a,button,script,style,textarea,[data-lang="en"],.arc-bio-dialog'))return;
   const src=node.textContent||'';
   re.lastIndex=0;
   if(!re.test(src))return;
   re.lastIndex=0;
   let match,last=0;
   const frag=document.createDocumentFragment();
   while((match=re.exec(src))){
     if(match.index>last)frag.append(document.createTextNode(src.slice(last,match.index)));
     const id=ids.get(clean(match[0]));
     if(!id){frag.append(document.createTextNode(match[0]));last=re.lastIndex;continue;}
     const a=document.createElement('a');a.href='/people/'+encodeURIComponent(id)+'.html';a.textContent=match[0];a.className='atlas-person-bio';a.setAttribute('aria-label','Βιογραφικό: '+match[0]);a.title='Δες το βιογραφικό στο Hall of Fame';
     frag.append(a);last=re.lastIndex;
   }
   if(last<src.length)frag.append(document.createTextNode(src.slice(last)));
   node.replaceWith(frag);
 }
 function linkAll(root){
   const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
   const nodes=[];let n;while((n=walker.nextNode()))nodes.push(n);
   nodes.forEach(linkNode);
 }
 function addTimelineChips(){
   timeline.querySelectorAll('.atlas-event-link').forEach(button=>{
     if(button.dataset.bioProcessed)return;
     button.dataset.bioProcessed='1';
     const text=button.textContent||'';
     const names=[...ids.keys()].filter(name=>clean(text).includes(name));
     if(!names.length)return;
     const holder=document.createElement('div');holder.className='atlas-timeline-bios';
     names.slice(0,3).forEach(name=>{
       const a=document.createElement('a');a.className='atlas-person-bio atlas-person-chip';
       a.href='/people/'+encodeURIComponent(ids.get(name))+'.html';
       a.textContent='Βιογραφικό: '+name;
       holder.append(a);
     });
     button.after(holder);
   });
 }
 function schedule(){if(scheduled||!re)return;scheduled=true;queueMicrotask(()=>{scheduled=false;linkAll(history);addTimelineChips()});}
 fetch('/hall-of-fame-people.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('Hall of Fame not available');return r.json()}).then(data=>{
   if(!Array.isArray(data.people))return;
   const seenNames=new Map(), allText=clean((document.getElementById('atlas-source')?.textContent||'')+' '+history.textContent+' '+JSON.stringify(window.ARCH_SPORTS_TIMELINES||{}));
   data.people.forEach(p=>{
     const name=String(p.name||'').trim(),key=clean(name);
     if(name.split(/\s+/).length<2||!p.id||!allText.includes(key))return;
     if(!seenNames.has(key))seenNames.set(key,[]);
     seenNames.get(key).push(p);
   });
   const unique=[...seenNames.entries()].filter(([,people])=>people.length===1);
   unique.forEach(([name,people])=>ids.set(name,people[0].id));
   const names=unique.map(([,people])=>people[0].name).sort((a,b)=>b.length-a.length);
   if(!names.length)return;
   re=new RegExp('(?<![\\p{L}])(?:'+names.map(escape).join('|')+')(?![\\p{L}])','giu');
   schedule();
   const mo=new MutationObserver(schedule);
   mo.observe(history,{childList:true,subtree:true,characterData:true});
   mo.observe(timeline,{childList:true,subtree:true});
 }).catch(e=>console.warn('Hall of Fame linking unavailable',e));
})();
