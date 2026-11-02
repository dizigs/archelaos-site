/* Minimal local image carousel — no observers, timers or global event interception. */
(()=>{'use strict';
const init=()=>{
 // Exact live archive count, not a decorative approximate number.
 const total=document.querySelector('#new-people-total');
 if(total){
  const url=location.pathname.startsWith('/rebuild/')?'/rebuild/data/people.json':'/assets/site/data/people.json';
  fetch(url).then(r=>{if(!r.ok)throw Error('people count unavailable');return r.json()})
   .then(data=>{const count=data.people?.length;if(Number.isInteger(count)&&count>0)total.textContent=count.toLocaleString('el-GR')})
   .catch(()=>{}); // The verified build-time 682 remains visible if offline.
 }
 // Keep image cards polished even if an external host blocks or removes a photo.
 for(const img of document.querySelectorAll('.new-slide img')){
  const missing=()=>{
   const parent=img.parentElement;
   if(!parent||parent.classList.contains('new-photo-missing'))return;
   parent.classList.add('new-photo-missing');
   parent.setAttribute('data-fallback-label',img.getAttribute('alt')||'Γ.Α.Σ. Αρχέλαος');
   img.hidden=true;
  };
  img.addEventListener('error',missing,{once:true});
  if(img.complete&&img.naturalWidth===0)missing();
 }

 const root=document.querySelector('.new-slideshow');if(!root)return;
 const slides=[...root.querySelectorAll('.new-slide')];
 const name=document.querySelector('#new-slide-title');
 const titleLink=document.querySelector('#new-slide-link');
 const sportKeys=['handball','track','archery','shooting','gymnastics','wrestling','volleyball','swimming'];
 const count=document.querySelector('#new-slide-count');
 const prev=document.querySelector('#new-slide-prev');
 const next=document.querySelector('#new-slide-next');
 const toggle=document.querySelector('#new-slide-toggle');
 if(!slides.length||!name||!titleLink||!count)return;

 const DURATION=6000;
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 let index=0,timer=null,paused=false;

 function show(n){
  index=(n+slides.length)%slides.length;
  slides.forEach((slide,i)=>{
   const active=i===index;
   slide.classList.toggle('active',active);
   slide.setAttribute('aria-hidden',String(!active));
  });
  const label=slides[index].querySelector('img')?.alt||'';
  titleLink.textContent=label;
  titleLink.href='/tmimata.html#sport-'+sportKeys[index];
  titleLink.setAttribute('aria-label','Πληροφορίες τμήματος: '+label);
  count.textContent=String(index+1).padStart(2,'0')+' / '+String(slides.length).padStart(2,'0')+' · '+label;
 }
 function syncToggle(){
  if(!toggle)return;
  toggle.textContent=paused?'▶':'Ⅱ';
  toggle.setAttribute('aria-label',paused?'Συνέχιση αυτόματης εναλλαγής':'Παύση αυτόματης εναλλαγής');
  toggle.setAttribute('title',paused?'Συνέχιση slideshow':'Παύση slideshow');
  toggle.setAttribute('aria-pressed',String(paused));
 }
 function clearTimer(){
  if(timer!==null){window.clearTimeout(timer);timer=null;}
 }
 function schedule(){
  clearTimer();
  if(paused||document.hidden||reduced.matches||slides.length<2)return;
  timer=window.setTimeout(()=>{
   timer=null;
   show(index+1);
   schedule();
  },DURATION);
 }
 function manuallyMove(delta){show(index+delta);schedule();}
 prev?.addEventListener('click',()=>manuallyMove(-1));
 next?.addEventListener('click',()=>manuallyMove(1));
 toggle?.addEventListener('click',()=>{
  paused=!paused;
  syncToggle();
  schedule();
 });
 document.addEventListener('visibilitychange',schedule);
 reduced.addEventListener?.('change',schedule);
 show(0);
 syncToggle();
 schedule();
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
