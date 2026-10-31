/* Shared, lightweight one-second landing cue. Navigation remains native.
   Only same-origin links count; popup and in-page links get a visual destination.
   Never animate on touch/mobile or when reduced motion is preferred. */
(function(){'use strict';
 if(window.ArchelaosLandingCue)return;
 const KEY='arch-landing-once';
 const eligible=()=>matchMedia('(min-width:900px) and (hover:hover) and (pointer:fine) and (prefers-reduced-motion:no-preference)').matches;
 const path=u=>u.pathname.startsWith('/rebuild/')?u.pathname.slice('/rebuild'.length):u.pathname;
 function targetFor(el){
  if(!el)return null;
  if(el.matches('dialog'))return el;
  if(el.matches('section'))return el.querySelector('.sp-section-intro,.voice-header,.arch-section-intro,h1,h2,h3')||el;
  return el.querySelector('h1,h2,h3')||el;
 }
 function flash(node){
  if(!eligible()||!node||!node.isConnected)return;
  const el=targetFor(node);
  if(!el)return;
  el.classList.remove('arch-target-glow');
  // Restart only for a new navigational action; no continuous effects.
  void el.offsetWidth;
  el.classList.add('arch-target-glow');
  el.addEventListener('animationend',function done(e){
   if(e.target!==el)return;
   el.removeEventListener('animationend',done);
   el.classList.remove('arch-target-glow');
  });
 }
 function sectionTo(hash){
  if(!hash||hash==='#')return null;
  try{return document.getElementById(decodeURIComponent(hash.slice(1)))}catch{return null}
 }
 function navigateTo(hash,animated){
  const el=sectionTo(hash);if(!el)return false;
  const offset=document.querySelector('.arch-header')?.getBoundingClientRect().height||82;
  const at=Math.max(0,el.getBoundingClientRect().top+scrollY-offset-18);
  scrollTo({top:at,behavior:animated?'smooth':'instant'});
  if(eligible()){
   // Wait for smooth scrolling to start so the cue appears at the destination.
   if(animated)window.setTimeout(()=>flash(el),320);else flash(el);
  }
  return true;
 }
 document.addEventListener('click',event=>{
  if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;
  if(!(event.target instanceof Element))return;
  const a=event.target.closest('a[href]');
  if(!a||a.hasAttribute('download')||a.target&&a.target!=='_self'||a.matches('[class*="skip"]'))return;
  let url;try{url=new URL(a.href,location.href)}catch{return}
  if(url.origin!==location.origin||!['http:','https:'].includes(url.protocol))return;
  if(path(url)===path(new URL(location.href))&&url.search===location.search&&url.hash){
   if(!sectionTo(url.hash))return; // A biography deep link may open a dialog instead.
   event.preventDefault();
   if(location.hash!==url.hash)history.pushState(null,'',url.pathname+url.search+url.hash);
   navigateTo(url.hash,true);
  }else if(path(url)!==path(new URL(location.href))&&eligible()){
   try{sessionStorage.setItem(KEY,JSON.stringify({path:path(url),hash:url.hash,at:Date.now()}))}catch{}
  }
 },false);
 document.addEventListener('archelaos:dialog-open',event=>{
  const el=event.detail?.dialog||document.querySelector('dialog.arch-dialog[open]');
  if(el?.open)flash(el);
 });
 function initial(){
  let pending;
  try{pending=JSON.parse(sessionStorage.getItem(KEY)||'null');sessionStorage.removeItem(KEY)}catch{}
  if(pending&&Date.now()-pending.at<6000&&pending.path===path(new URL(location.href))){
   if(pending.hash&&navigateTo(pending.hash,false))return;
   const modal=document.querySelector('dialog.arch-dialog[open]');
   if(modal){flash(modal);return}
   // Highlight the page's actual headline, not a fixed menu or arrow icon.
   flash(document.querySelector('main h1,main h2')||document.querySelector('main'));
  }else if(location.hash&&eligible()){
   // Direct deep links should still land below the fixed navbar.
   navigateTo(location.hash,false);
  }
 }
 window.ArchelaosLandingCue=Object.freeze({flash});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initial,{once:true});else initial();
})();
