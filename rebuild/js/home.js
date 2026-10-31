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
const slides=[...root.querySelectorAll('.new-slide')],name=document.querySelector('#new-slide-title'),count=document.querySelector('#new-slide-count');let index=0;
const show=n=>{index=(n+slides.length)%slides.length;slides.forEach((s,i)=>{const active=i===index;s.classList.toggle('active',active);s.setAttribute('aria-hidden',String(!active))});const label=slides[index].querySelector('img')?.alt||'';name.textContent=label;count.textContent=String(index+1).padStart(2,'0')+' / '+String(slides.length).padStart(2,'0')+' · '+label};
document.querySelector('#new-slide-prev')?.addEventListener('click',()=>show(index-1));
document.querySelector('#new-slide-next')?.addEventListener('click',()=>show(index+1));
show(0);
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
