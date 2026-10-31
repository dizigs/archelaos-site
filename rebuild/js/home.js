/* Minimal local image carousel — no observers, timers or global event interception. */
(()=>{'use strict';
const init=()=>{
const root=document.querySelector('.new-slideshow');if(!root)return;
const slides=[...root.querySelectorAll('.new-slide')],name=document.querySelector('#new-slide-title'),count=document.querySelector('#new-slide-count');let index=0;
const show=n=>{index=(n+slides.length)%slides.length;slides.forEach((s,i)=>{const active=i===index;s.classList.toggle('active',active);s.setAttribute('aria-hidden',String(!active))});const label=slides[index].querySelector('img')?.alt||'';name.textContent=label;count.textContent=String(index+1).padStart(2,'0')+' / '+String(slides.length).padStart(2,'0')+' · '+label};
document.querySelector('#new-slide-prev')?.addEventListener('click',()=>show(index-1));
document.querySelector('#new-slide-next')?.addEventListener('click',()=>show(index+1));
show(0);
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
