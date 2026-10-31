/* ARCHÉLAOS: small, safe progressive reveal. No MutationObserver or scroll handlers.
   Never applies opacity:0 to any unrevealed element, so content stays clickable if JS fails. */
(function(){
 'use strict';
 const selector=[
   'main h1','main h2',
   'main .new-sport','main .new-involve','main .new-milestone',
   'main .new-today-feature','main .arch-card','main .mu-nav-card',
   'main .mu-sport-item','main .rs-card','main .rm-card',
   'main .h-new-person','main .dp-card','main .ct-hero-card',
   'main .sp-last-card','main .sr-card','main .rm-featured-item','main .rs-featured-card',
   'main .mu-archive-item','main .bd-era','main .rt-scoreboard'
 ].join(',');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let observer;
 function enter(element){
   if(element.classList.contains('arch-motion-entered'))return;
   element.classList.add('arch-motion-entered');
 }
 function observe(scope){
   if(reduced.matches)return;
   const root=scope||document;
   const nodes=root.querySelectorAll(selector);
   if(!('IntersectionObserver' in window)){
     // Without support, preserve static content: no animation is necessary.
     return;
   }
   if(!observer){
     observer=new IntersectionObserver((entries)=>{
       for(const item of entries){
         if(!item.isIntersecting)continue;
         enter(item.target);
         observer.unobserve(item.target);
       }
     },{threshold:.07,rootMargin:'0px 0px -4% 0px'});
   }
   let count=0;
   for(const element of nodes){
     if(element.classList.contains('arch-motion-entered')||element.dataset.archMotionObserved==='1')continue;
     element.dataset.archMotionObserved='1';
     element.style.setProperty('--arch-motion-delay',((count++%4)*36)+'ms');
     observer.observe(element);
   }
 }
 if(document.readyState==='loading'){
   document.addEventListener('DOMContentLoaded',()=>observe(document),{once:true});
 }else observe(document);
 window.ArchelaosMotion=Object.freeze({observe});
})();
