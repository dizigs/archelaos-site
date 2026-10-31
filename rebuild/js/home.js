/* Minimal local image carousel — no observers, timers or global event interception. */
(()=>{'use strict';
const init=()=>{
 // Keep image cards polished even if an external host blocks or removes a photo.
 for(const img of document.querySelectorAll('.new-slide img,.new-sport-photo img')){
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

// Save the eight existing illustrated sport photos, not arbitrary private archive material.
 const keys=['handball','track','archery','shooting','gymnastics','volleyball','wrestling','swimming'];
 document.querySelectorAll('.new-sport-photo').forEach((photo,index)=>{
  if(!keys[index]||!window.ArchelaosFavorites)return;
  photo.id='sport-photo-'+keys[index];
  photo.append(window.ArchelaosFavorites.button('photo','sport-'+keys[index]));
 });
 const root=document.querySelector('.new-slideshow');if(!root)return;
const slides=[...root.querySelectorAll('.new-slide')],name=document.querySelector('#new-slide-title'),count=document.querySelector('#new-slide-count');let index=0;
const show=n=>{index=(n+slides.length)%slides.length;slides.forEach((s,i)=>{const active=i===index;s.classList.toggle('active',active);s.setAttribute('aria-hidden',String(!active))});const label=slides[index].querySelector('img')?.alt||'';name.textContent=label;count.textContent=String(index+1).padStart(2,'0')+' / '+String(slides.length).padStart(2,'0')+' · '+label};
document.querySelector('#new-slide-prev')?.addEventListener('click',()=>show(index-1));
document.querySelector('#new-slide-next')?.addEventListener('click',()=>show(index+1));
show(0);
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
