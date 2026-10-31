/* Target-aware sponsor navigation: land below the fixed header, then
 * briefly illuminate the actual content reached by the anchor. */
(function(){'use strict';
 const anchor=document.querySelector('.sp-actions a[href="#sponsor-impact"]');
 const section=document.querySelector('#sponsor-impact');
 const cards=section?.querySelector('.sp-impact-grid');
 if(!anchor||!section||!cards)return;
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 function spotlight(){
  cards.classList.remove('arch-target-glow');
  void cards.offsetWidth;
  cards.classList.add('arch-target-glow');
 }
 cards.addEventListener('animationend',event=>{
  if(event.animationName==='arch-target-glow')cards.classList.remove('arch-target-glow');
 });
 function land(animate){
  const bar=document.querySelector('.arch-header');
  const header=bar?bar.getBoundingClientRect().height:82;
  const top=Math.max(0,section.getBoundingClientRect().top+window.scrollY-header-14);
  window.scrollTo({top,behavior:animate&&!reduced.matches?'smooth':'instant'});
  spotlight();
 }
 anchor.addEventListener('click',event=>{
  event.preventDefault();
  if(location.hash!=='#sponsor-impact')history.pushState(null,'','#sponsor-impact');
  land(true);
 });
 if(location.hash==='#sponsor-impact'){
  window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>land(false)));
 }
})();
