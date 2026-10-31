/* Museum cards: reuse only authentic, already-present dates or numbers as watermarks.
   Never invent a counter or a historical date. */
(()=>{'use strict';
 const rules=[
  ['.timeline-rail .story.archive-moment-card','.year','year'],
  ['#museum-v54-navigation .m55-nav-card','.m54-num','number'],
  ['#index .entry','.entry-index','number'],
  ['#arch-press-voices .arch-shelf-story','.arch-shelf-story-year','year']
 ];
 const extract=(value,type)=>{
   const text=String(value||'').trim();
   const match=type==='year'?text.match(/(?:^|\D)(1[89]\d\d|20\d\d)(?!\d)/):text.match(/(?:^|\D)(\d{1,2})(?!\d)/);
   return match?match[1]:'';
 };
 function enhance(){
   for(const [selector,source,type] of rules){
     document.querySelectorAll(selector).forEach(card=>{
       if(card.querySelector(':scope > .amd-watermark'))return;
       const el=card.querySelector(source);
       if(!el)return;
       const content=extract(el.textContent,type);
       if(!content)return;
       const span=document.createElement('span');
       span.className='amd-watermark';
       span.textContent=content;
       span.setAttribute('aria-hidden','true');
       card.classList.add('amd-watermarked');
       card.insertBefore(span,card.firstChild);
     });
   }
 }
 let queued=false;
 function schedule(){
   if(queued)return;queued=true;
   requestAnimationFrame(()=>{queued=false;enhance();});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});
 else schedule();
 new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
})();
