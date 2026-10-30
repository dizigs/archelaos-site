/* Archelaos unified navigation v88. Edit menu items here, never separately in pages. */
(function(){'use strict';
 const script=document.currentScript;
 if(!script||document.getElementById('arch-global-nav-root'))return;
 const pageName=(location.pathname.split('/').pop()||'index.html').toLowerCase();
 const isProfile=location.pathname.startsWith('/people/');
 const isMuseum=['history.html','hall-of-fame.html','70-stigmes.html','stories.html'].includes(pageName);
 if(isProfile){
  const relatedScript=document.createElement('script');relatedScript.src='/assets/story-relations.js';relatedScript.defer=true;document.head.appendChild(relatedScript);
 }
 if(isMuseum)document.body.classList.add('asn-museum-layout');
 const ITEMS=[
  {href:'index.html',el:'Αρχική',en:'Home'},
  {href:'history.html',el:'Ψηφιακό Μουσείο',en:'Digital Museum'},
  {href:'70-stigmes.html',el:'70 Στιγμές',en:'70 Moments'},
  {href:'hall-of-fame.html',el:'Hall of Fame',en:'Hall of Fame'},
  {href:'stories.html',el:'Ιστορίες',en:'Stories'},
  {href:'index.html#about',el:'Ο Σύλλογος',en:'The Club'},
  {href:'index.html#departments',el:'Αθλήματα',en:'Sports'},
  {href:'board.html',el:'Διοίκηση',en:'Board'},
  {href:'sponsors.html',el:'Χορηγίες',en:'Sponsorship'},
  {href:'contact.html',el:'Επικοινωνία',en:'Contact'}

 ];
 const absolute=href=>href.startsWith('/')?href:'/'+href;
 const active=(href)=>href.split('#')[0]===pageName && !href.includes('#');
 const bi=(el,en)=>`<span data-asn-el="${el}" data-asn-en="${en}">${el}</span>`;
 const arrow='<svg class="asn-down" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
 const link=(i,cls='')=>{const current=active(ITEMS[i].href);return `<a class="${cls}${current?' asn-active':''}" href="${absolute(ITEMS[i].href)}"${current?' aria-current="page"':''}>${bi(ITEMS[i].el,ITEMS[i].en)}</a>`;};
 const dropdown=(key,el,en,indices)=>`<div class="asn-dropdown" data-asn-dropdown="${key}"><button class="asn-drop-trigger${indices.some(i=>active(ITEMS[i].href))?' asn-active':''}" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="asn-drop-${key}">${bi(el,en)}${arrow}</button><div class="asn-drop-panel" id="asn-drop-${key}">${indices.map(i=>link(i)).join('')}</div></div>`;
 const mobileLink=(i)=>`<a style="--asn-order:${i+1}" class="asn-m-link" href="${absolute(ITEMS[i].href)}"${active(ITEMS[i].href)?' aria-current="page"':''}><span class="asn-m-num" aria-hidden="true">${String(i+1).padStart(2,'0')}</span>${bi(ITEMS[i].el,ITEMS[i].en)}<span class="asn-m-arrow" aria-hidden="true">›</span></a>`;
 const root=document.createElement('div');root.id='arch-global-nav-root';root.setAttribute('role','banner');
 root.innerHTML=`<div class="asn-topbar"><div class="asn-inner"><a class="asn-brand" href="/index.html" aria-label="Αρχική · Γ.Α.Σ. Ο Αρχέλαος"><img class="asn-crest" src="/archelaos-logo-gold.png" alt="Έμβλημα Αρχέλαου" width="52" height="52"><span class="asn-brand-lines"><span class="asn-brand-title">Γ.Α.Σ. «Ο ΑΡΧΕΛΑΟΣ»</span><span class="asn-brand-sub">ΚΑΤΕΡΙΝΗ · 1956—2026</span></span></a><div class="asn-desktop" role="navigation" aria-label="Κύρια πλοήγηση">${link(0)}${link(1)}${dropdown('archive','Συλλογές','Collections',[2,3,4,10])}${dropdown('club','Ο Σύλλογος','The Club',[5,6,7])}${link(8)}${link(9)}<button type="button" class="asn-lang-btn" data-asn-language aria-label="Εναλλαγή γλώσσας / Switch language">GR</button></div><div class="asn-mobile-actions"><button type="button" class="asn-mobile-lang" data-asn-language aria-label="Εναλλαγή γλώσσας / Switch language">GR</button><button type="button" class="asn-menu-btn" id="asn-menu-toggle" aria-label="Άνοιγμα μενού" aria-controls="asn-mobile-drawer" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button></div></div></div><div class="asn-backdrop" id="asn-backdrop" hidden></div><div class="asn-drawer" id="asn-mobile-drawer" aria-label="Μενού Αρχέλαου" aria-modal="true" role="dialog" hidden><div class="asn-drawer-head"><span class="asn-drawer-title">${bi('Περιήγηση','Explore')}</span><button class="asn-close-btn" id="asn-menu-close" type="button" aria-label="Κλείσιμο μενού"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5 19 19M19 5 5 19"/></svg></button></div><div class="asn-drawer-scroll"><div class="asn-eyebrow" style="--asn-order:0">${bi('Εξερεύνηση','Explore')}</div>${[0,1,2,3,4,10].map(mobileLink).join('')}<div class="asn-eyebrow" style="--asn-order:6">${bi('Ο Σύλλογος','The Club')}</div>${[5,6,7,8,9].map(mobileLink).join('')}<div class="asn-m-footer">70 ${bi('ΧΡΟΝΙΑ ΙΣΤΟΡΙΑΣ','YEARS OF HISTORY')} · 1956—2026</div></div></div>`;
 document.body.insertBefore(root,document.body.firstChild);
 const $=s=>root.querySelector(s), $$=s=>[...root.querySelectorAll(s)];
 const menuBtn=$('#asn-menu-toggle'),drawer=$('#asn-mobile-drawer'),shade=$('#asn-backdrop');
 let previousFocus=null,restoreOverflow=null,drawerOpen=false,closingTimer=null;
 const language=()=>document.documentElement.lang==='en'||document.body.classList.contains('lang-en')?'en':'el';
 if(isProfile){try{const saved=localStorage.getItem('archelaos_lang');if(saved==='en'||saved==='el'){document.documentElement.lang=saved;document.body.classList.toggle('lang-en',saved==='en');document.body.classList.toggle('lang-el',saved==='el');}}catch(e){}}
 const sync=()=>{const en=language()==='en';$$('[data-asn-el][data-asn-en]').forEach(n=>n.textContent=n.getAttribute(en?'data-asn-en':'data-asn-el'));$$('[data-asn-language]').forEach(b=>b.textContent=en?'EN':'GR');menuBtn.setAttribute('aria-label',en?(drawerOpen?'Close menu':'Open menu'):(drawerOpen?'Κλείσιμο μενού':'Άνοιγμα μενού'));$('#asn-menu-close').setAttribute('aria-label',en?'Close menu':'Κλείσιμο μενού');};
 const motionReduced=()=>window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const finishClose=()=>{
  if(drawerOpen)return;
  drawer.hidden=true;shade.hidden=true;
  drawer.classList.remove('is-visible');shade.classList.remove('is-visible');
  if(closingTimer!==null){window.clearTimeout(closingTimer);closingTimer=null;}
 };
 const setOpen=(on)=>{
  if(on===drawerOpen)return;
  drawerOpen=on;
  if(closingTimer!==null){window.clearTimeout(closingTimer);closingTimer=null;}
  if(on){
   previousFocus=document.activeElement;
   restoreOverflow=document.body.style.overflow;
   document.body.style.overflow='hidden';
   drawer.hidden=false;shade.hidden=false;drawer.inert=false;drawer.setAttribute('aria-hidden','false');
   // Reading layout before toggling the class ensures CSS transitions run reliably.
   void drawer.offsetWidth;
   drawer.classList.add('is-visible');shade.classList.add('is-visible');
   menuBtn.setAttribute('aria-expanded','true');
   $('#asn-menu-close').focus();
  } else {
   drawer.classList.remove('is-visible');shade.classList.remove('is-visible');
   menuBtn.setAttribute('aria-expanded','false');
   if(restoreOverflow!==null)document.body.style.overflow=restoreOverflow;
   restoreOverflow=null;
   if(previousFocus&&previousFocus.isConnected)previousFocus.focus();
   else menuBtn.focus();
   previousFocus=null;
   drawer.inert=true;drawer.setAttribute('aria-hidden','true');
   if(motionReduced())finishClose();
   else closingTimer=window.setTimeout(finishClose,430);
  }
  sync();
 };
 drawer.addEventListener('transitionend',e=>{
  if(e.target===drawer&&e.propertyName==='transform'&&!drawerOpen)finishClose();
 });
 menuBtn.addEventListener('click',()=>setOpen(!drawerOpen));
 $('#asn-menu-close').addEventListener('click',()=>setOpen(false));
 shade.addEventListener('click',()=>setOpen(false));
 $$('.asn-m-link').forEach(a=>a.addEventListener('click',()=>setOpen(false)));
 const closeDrops=()=>$$('.asn-dropdown').forEach(d=>{d.classList.remove('is-open');d.querySelector('button').setAttribute('aria-expanded','false');});
 $$('.asn-drop-trigger').forEach(b=>b.addEventListener('click',()=>{const d=b.closest('.asn-dropdown'),next=!d.classList.contains('is-open');closeDrops();d.classList.toggle('is-open',next);b.setAttribute('aria-expanded',String(next));}));
 root.addEventListener('click',e=>e.stopPropagation());
 // Navigate to each link's own resolved destination, unaffected by legacy page handlers.
 root.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!a||!root.contains(a)||e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;const url=new URL(a.getAttribute('href'),location.origin);if(url.origin!==location.origin)return;e.preventDefault();location.assign(url.pathname+url.search+url.hash);},true);
 document.addEventListener('click',e=>{if(!root.contains(e.target))closeDrops();});
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(drawerOpen){e.preventDefault();setOpen(false);}else closeDrops();}
  if(e.key==='Tab'&&drawerOpen){const nodes=[...drawer.querySelectorAll('a[href],button:not([disabled])')].filter(x=>x.getClientRects().length);if(!nodes.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
 });
 const applySharedLanguage=(next)=>{
  document.documentElement.lang=next;
  document.body.classList.toggle('lang-el',next==='el');
  document.body.classList.toggle('lang-en',next==='en');
  try{localStorage.setItem('archelaos_lang',next)}catch(e){}
  document.querySelectorAll('[data-el][data-en]').forEach(n=>{if(n.closest('#arch-global-nav-root'))return;const value=n.getAttribute('data-'+next);if(value!=null)n.textContent=value});
  document.dispatchEvent(new CustomEvent('archelaos:language-change',{detail:{language:next}}));
  sync();
 };
 const toggleLanguage=()=>{
  const next=language()==='en'?'el':'en';
  // Each historical page has its own translator. Invoke it only if present,
  // then normalize the state for the unified navigation and profile cards.
  const candidates=['language','archAnniversaryLanguage'];
  const legacy=candidates.map(id=>document.getElementById(id)).find(el=>el&&!root.contains(el));
  if(legacy)try{legacy.click()}catch(e){}
  applySharedLanguage(next);
 };
 // Restore the selected language on navigation between regular pages and /people/.
 try{const saved=localStorage.getItem('archelaos_lang');if(saved==='en'||saved==='el'){
  if(saved!==language()){
   const legacy=['language','archAnniversaryLanguage'].map(id=>document.getElementById(id)).find(el=>el&&!root.contains(el));
   if(legacy)try{legacy.click()}catch(e){}
  }
  applySharedLanguage(saved);
 }}catch(e){}
 $$('[data-asn-language]').forEach(b=>b.addEventListener('click',toggleLanguage));
 if(typeof MutationObserver!=='undefined'){
  new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
 }
 window.addEventListener('pageshow',sync);window.addEventListener('resize',()=>{if(innerWidth>1170&&drawerOpen)setOpen(false)});
 sync();
})();
