/* One-time home entrance, never a required loading screen. */
(()=>{'use strict';
 const init=()=>{
  if(document.querySelector('.arch-welcome'))return;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  try{if(sessionStorage.getItem('arch-welcome-2026')==='seen')return;sessionStorage.setItem('arch-welcome-2026','seen')}catch{return}
  const root=document.createElement('div');root.className='arch-welcome';root.setAttribute('role','status');root.setAttribute('aria-label','Καλώς ήρθατε στον Γ.Α.Σ. Αρχέλαο');
  const inner=document.createElement('div');inner.className='arch-welcome-inner';
  const ring=document.createElement('div');ring.className='arch-welcome-ring';
  const logo=document.createElement('img');logo.src='/archelaos-logo-gold.png';logo.alt='Έμβλημα Γ.Α.Σ. Αρχέλαος';logo.width=180;logo.height=180;ring.append(logo);
  const year=document.createElement('span');year.className='arch-welcome-years';year.textContent='1956 — 2026';
  const name=document.createElement('h2');name.className='arch-welcome-title';name.textContent='Μία ιστορία. Μία φλόγα.';
  const sub=document.createElement('div');sub.className='arch-welcome-sub';sub.textContent='Γ.Α.Σ. «Ο ΑΡΧΕΛΑΟΣ» ΚΑΤΕΡΙΝΗΣ';
  inner.append(ring,year,name,sub);
  root.append(inner);document.body.append(root);
  let done=false,timer;
  const close=()=>{if(done)return;done=true;clearTimeout(timer);root.classList.add('is-leaving');root.addEventListener('transitionend',()=>root.remove(),{once:true});setTimeout(()=>root.remove(),500)};
  timer=setTimeout(close,matchMedia('(max-width:700px)').matches?850:1400);
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
