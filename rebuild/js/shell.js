/* Shared header + footer. Deliberately no MutationObserver, no legacy overlays. */
(function(){
'use strict';
const pages=[
  ['index.html','Αρχική'],['news.html','Νέα & Δράση'],['history.html','Ψηφιακό Μουσείο'],
  ['70-stigmes.html','70 Στιγμές'],['hall-of-fame.html','Hall of Fame'],
  ['stories.html','Ιστορίες'],['index.html#about','Ο Σύλλογος'],
  ['tmimata.html','Τμήματα'],['board.html','Διοίκηση'],
  ['sponsors.html','Χορηγίες'],['contact.html','Επικοινωνία'],['search.html','Αναζήτηση'],['favorites.html','Αγαπημένα'],['contribute.html','Συνεισφορά Αρχείου'],['interviews.html','Φωνές του Αρχέλαου'],['full-chronology.html','Πλήρες Χρονολόγιο']
];
const groups=[['Αρχείο',[15,3,4,5,14]],['Ο Σύλλογος',[6,7,8,9,10]]];
const path=(location.pathname.split('/').pop()||'index.html').toLowerCase();
const COMPLETED=new Set(['index.html','news.html','history.html','hall-of-fame.html','70-stigmes.html','stories.html','board.html','contact.html','sponsors.html','tmimata.html','retro-matches.html','search.html','favorites.html','contribute.html','interviews.html','full-chronology.html']);
const stageUrl=(href)=>{
 if(!location.pathname.startsWith('/rebuild/'))return href;
 try{
  const url=new URL(href,location.href);
  if(url.origin!==location.origin)return href;
  const file=url.pathname.replace(/^\/(?:rebuild\/)?/,'');
  if(!COMPLETED.has(file))return href;
  return '/rebuild/'+file+url.search+url.hash;
 }catch(_){return href}
};
window.ArchelaosRoutes=Object.freeze({toStage:stageUrl});
const hrefFor=(item)=>stageUrl('/'+item[0]);
const SVG=Object.freeze({
 heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
 plus:'<path d="M12 4v16M4 12h16"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 facebook:'<path d="M14 21v-8h3l.5-3H14V8.5c0-1 .4-1.5 1.7-1.5H18V4.2c-.5-.1-1.7-.2-3-.2-3 0-4.5 1.6-4.5 4.4V10H8v3h2.5v8"/>',
 youtube:'<rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3Z"/>',
 wikipedia:'<circle cx="12" cy="12" r="10"/><path d="m5 8 3.4 9L12 9l3.5 8L19 8M4 8h4m2 0h4m2 0h4"/>'
});
function svgIcon(name){
 const icon=document.createElement('span');icon.className='arch-action-icon';
 icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+SVG[name]+'</svg>';
 return icon;
}
function iconLink(parent,item,icon,className,label){
 const a=addLink(parent,item,className);a.setAttribute('aria-label',label||item[1]);a.replaceChildren(svgIcon(icon));
 const title=document.createElement('span');title.className='arch-action-name';title.textContent=label||item[1];a.append(title);
 if(icon==='heart'){const count=document.createElement('span');count.className='arch-fav-count';count.hidden=true;a.append(count)}
 return a;
}
function updateFavoriteCounts(){
 if(!window.ArchelaosFavorites)return;
 const n=window.ArchelaosFavorites.get().length;
 document.querySelectorAll('.arch-fav-count').forEach(x=>{x.textContent=String(n);x.hidden=n===0});
}
document.addEventListener('archelaos:favorites-change',updateFavoriteCounts);

function addLink(parent,item,className){
  const a=document.createElement('a');a.href=hrefFor(item);a.textContent=item[1];
  if(className)a.className=className;
  if(item[0].split('#')[0]===path && !item[0].includes('#'))a.setAttribute('aria-current','page');
  parent.append(a);return a;
}
function renderHeader(){
  if(document.querySelector('.arch-header'))return;
  const header=document.createElement('header');header.className='arch-header';
  const inner=document.createElement('div');inner.className='arch-header-inner';
  const brand=document.createElement('a');brand.className='arch-brand';brand.href=hrefFor(pages[0]); // Use the visible brand text as its accessible name.
  const crest=document.createElement('img');crest.src='/assets/archelaos-crest.png';crest.alt='';crest.width=52;crest.height=52;
  const lines=document.createElement('span');lines.className='arch-brand-lines';
  const title=document.createElement('span');title.className='arch-brand-title';title.textContent='Γ.Α.Σ. «Ο ΑΡΧΕΛΑΟΣ»';
  const sub=document.createElement('span');sub.className='arch-brand-sub';sub.textContent='ΚΑΤΕΡΙΝΗ · 1956—2026';
  lines.append(title,sub);brand.append(crest,lines);inner.append(brand);
  const nav=document.createElement('nav');nav.className='arch-nav';nav.setAttribute('aria-label','Κύρια πλοήγηση');
  addLink(nav,pages[0]);addLink(nav,pages[1]);addLink(nav,pages[2]);
  for(const group of groups){
    const details=document.createElement('details');const sum=document.createElement('summary');sum.textContent=group[0];
    const panel=document.createElement('div');panel.className='arch-dropdown';
    group[1].forEach(i=>addLink(panel,pages[i]));details.append(sum,panel);nav.append(details);
  }
  iconLink(nav,pages[11],'search','arch-nav-search','Αναζήτηση');inner.append(nav);
  const actions=document.createElement('div');actions.className='arch-header-actions';
  iconLink(actions,pages[12],'heart','arch-action arch-action-favorites','Αγαπημένα');
  iconLink(actions,pages[13],'plus','arch-action arch-action-contribute','Συνεισφέρω');
  // Reserved for any number of approved languages; hidden until publication is enabled.
  const desktopLanguageSlot=document.createElement('div');desktopLanguageSlot.className='arch-language-slot';desktopLanguageSlot.dataset.i18nSlot='desktop';desktopLanguageSlot.hidden=true;
  actions.append(desktopLanguageSlot);inner.append(actions);
  const btn=document.createElement('button');btn.className='arch-menu-open';btn.type='button';btn.textContent='☰';btn.setAttribute('aria-label','Άνοιγμα μενού');btn.setAttribute('aria-expanded','false');
  btn.setAttribute('aria-haspopup','dialog');inner.append(btn);header.append(inner);
  const drawer=document.createElement('dialog');drawer.className='arch-menu-dialog';drawer.setAttribute('aria-label','Μενού Αρχέλαου');
  const head=document.createElement('div');head.className='arch-menu-head';
  const name=document.createElement('strong');name.textContent='Περιήγηση';
  const close=document.createElement('button');close.className='arch-close';close.type='button';close.textContent='×';close.setAttribute('aria-label','Κλείσιμο μενού');
  head.append(name,close);drawer.append(head);
  const content=document.createElement('div');content.className='arch-menu-content';
  const quick=document.createElement('div');quick.className='arch-menu-quick';quick.setAttribute('aria-label','Γρήγορη πρόσβαση');
  iconLink(quick,pages[12],'heart','arch-mobile-action arch-mobile-favorites','Τα αγαπημένα μου');
  iconLink(quick,pages[13],'plus','arch-mobile-action arch-mobile-contribute','Συνεισφορά αρχείου');
  content.append(quick);
  const mobileLanguageSlot=document.createElement('div');mobileLanguageSlot.className='arch-language-slot arch-language-slot-mobile';mobileLanguageSlot.dataset.i18nSlot='mobile';mobileLanguageSlot.hidden=true;
  content.append(mobileLanguageSlot);
  for(const group of [['Εξερεύνηση',[0,1,2,3,4,5,11,14]],['Ο Σύλλογος',[6,7,8,9,10]]]){
    const caption=document.createElement('div');caption.className='arch-menu-group';caption.textContent=group[0];content.append(caption);
    group[1].forEach(i=>{addLink(content,pages[i],'arch-mobile-link')});
  }
  drawer.append(content);document.body.prepend(drawer);document.body.prepend(header);
  let prior=null;
  btn.addEventListener('click',()=>{if(drawer.open)return;prior=document.activeElement;drawer.showModal();btn.setAttribute('aria-expanded','true');document.body.classList.add('arch-dialog-open');close.focus()});
  close.addEventListener('click',()=>{document.body.classList.remove('arch-dialog-open');drawer.close()});
  drawer.addEventListener('click',e=>{
    const link=e.target.closest?.('a[href]');
    if(e.target===drawer||(link&&!e.defaultPrevented&&e.button===0&&
      !e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&link.target!=='_blank')){
      // A same-page fragment does not reload the shell: close before native navigation.
      document.body.classList.remove('arch-dialog-open');drawer.close();
    }
  });
  drawer.addEventListener('cancel',()=>{btn.setAttribute('aria-expanded','false');document.body.classList.remove('arch-dialog-open')});
 drawer.addEventListener('close',()=>{btn.setAttribute('aria-expanded','false');document.body.classList.remove('arch-dialog-open');if(prior?.isConnected)prior.focus({preventScroll:true})});
  document.addEventListener('click',e=>{if(!nav.contains(e.target))nav.querySelectorAll('details[open]').forEach(d=>d.open=false)});
  nav.querySelectorAll('details').forEach(d=>d.addEventListener('toggle',()=>{if(d.open)nav.querySelectorAll('details').forEach(other=>{if(other!==d)other.open=false})}));
  nav.addEventListener('keydown',e=>{
    if(e.key!=='Escape')return;
    const expanded=nav.querySelector('details[open]');if(!expanded)return;
    expanded.open=false;expanded.querySelector('summary').focus({preventScroll:true});e.preventDefault();
  });
}
function renderFooter(){
  if(document.querySelector('.arch-footer'))return;
  const footer=document.createElement('footer');footer.className='arch-footer';
  footer.innerHTML='<div class="arch-footer-inner"><div class="arch-footer-top"><img src="/assets/archelaos-crest.png" alt="" loading="lazy" width="58" height="58"><div><strong>Γ.Α.Σ. «Ο ΑΡΧΕΛΑΟΣ»</strong><small>ΚΑΤΕΡΙΝΗ · ΑΠΟ ΤΟ 1956</small></div></div><div class="arch-footer-rule"></div><div class="arch-footer-columns"><section><h2>ΨΗΦΙΑΚΟ ΜΟΥΣΕΙΟ</h2><a href="/history.html">Η ιστορία</a><a href="/museum-memory.html">Γιατί δημιουργήσαμε το Μουσείο</a><a href="/70-stigmes.html">70 Στιγμές</a></section><section><h2>ΟΙ ΑΝΘΡΩΠΟΙ</h2><a href="/hall-of-fame.html">Hall of Fame</a><a href="/stories.html">Ιστορίες</a><a href="/interviews.html">Οι Φωνές</a><a href="/board.html">Διοίκηση</a></section><section><h2>Ο ΣΥΛΛΟΓΟΣ</h2><a href="/index.html">Αρχική</a><a href="/tmimata.html">Αθλήματα</a><a href="/contact.html">Επικοινωνία</a></section></div><div class="arch-footer-community"><div><strong>Η ιστορία του Αρχέλαου συνεχίζεται.</strong><p>Κρατήστε τις αγαπημένες σας στιγμές ή βοηθήστε μας να διασώσουμε μια ακόμη.</p></div><div class="arch-footer-ctas"></div></div><div class="arch-footer-social" aria-label="Επίσημοι σύνδεσμοι"></div><div class="arch-footer-bottom arch-footer-legal" aria-label="Στοιχεία σωματείου">ΓΥΜΝΑΣΤΙΚΟΣ ΑΓΩΝΙΣΤΙΚΟΣ ΣΥΛΛΟΓΟΣ «Ο ΑΡΧΕΛΑΟΣ» ΚΑΤΕΡΙΝΗΣ <span aria-hidden="true">·</span> ΑΦΜ 090396096 <span aria-hidden="true">·</span> ΔΟΥ Κατερίνης <span aria-hidden="true">·</span> Κωδικός ΓΓΑ ΙΙ88 <span aria-hidden="true">·</span> <a href="/privacy.html" class="arch-privacy-link">Πολιτική απορρήτου</a></div></div>';
  const ctas=footer.querySelector('.arch-footer-ctas');
  iconLink(ctas,pages[12],'heart','arch-footer-cta','Αγαπημένα');
  iconLink(ctas,pages[13],'plus','arch-footer-cta arch-footer-cta-primary','Συνεισφέρω');
  const social=footer.querySelector('.arch-footer-social');
  for(const [label,icon,url] of [
    ['Facebook','facebook','https://www.facebook.com/oarxelaos'],
    ['YouTube','youtube','https://www.youtube.com/@GASArchelaosKaterinis'],
    ['Wikipedia','wikipedia','https://en.wikipedia.org/wiki/GAS_Archelaos_Katerinis']
  ]){
    const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';
    link.setAttribute('aria-label',label+' · ανοίγει σε νέα καρτέλα');link.append(svgIcon(icon));
    const name=document.createElement('span');name.textContent=label;link.append(name);social.append(link);
  }
  document.body.append(footer);
}
function rewritePreviewLink(link){
 if(!link||!link.matches('a[href]'))return;
 const raw=link.getAttribute('href');if(!raw||raw.startsWith('#'))return;
 let url;try{url=new URL(raw,location.href)}catch(_){return}
 if(url.origin!==location.origin||url.pathname.startsWith('/rebuild/'))return;
 const file=url.pathname.replace(/^\//,'');
 if(!COMPLETED.has(file))return;
 link.href='/rebuild/'+file+url.search+url.hash;
}
function routePreviewLinks(){
 if(!location.pathname.startsWith('/rebuild/'))return;
 // Existing anchors, including the shared footer, are rewritten immediately.
 // Late-rendered museum/search/favorites cards are handled on interaction:
 // no MutationObserver, no click hijacking, and no changes to public release links.
 document.querySelectorAll('a[href]').forEach(rewritePreviewLink);
 for(const type of ['pointerdown','focusin','click']){
  document.addEventListener(type,event=>{
   const target=event.target;
   if(target instanceof Element)rewritePreviewLink(target.closest('a[href]'));
  },true);
 }
}

/* Shared accessibility controls and back-to-top: every route, including biographies and 404. */
function renderSiteTools(){
 if(document.querySelector('.arch-a11y-launch'))return;
 const main=document.querySelector('main');
 if(main&&!document.querySelector('a[href="#main-content"]')){
  if(!main.id)main.id='main-content';
  const skip=document.createElement('a');
  skip.className='arch-skip-link';skip.href='#'+main.id;
  skip.textContent='Παράκαμψη πλοήγησης — κύριο περιεχόμενο';
  document.body.prepend(skip);
 }
 const launch=document.createElement('button');
 launch.type='button';launch.className='arch-a11y-launch';
 launch.setAttribute('aria-label','Ρυθμίσεις προσβασιμότητας');
 launch.setAttribute('title','Προσβασιμότητα');
 launch.setAttribute('aria-haspopup','dialog');
 launch.setAttribute('aria-controls','arch-a11y-panel');
 launch.setAttribute('aria-expanded','false');
 launch.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4" r="2"/><path d="M4 9h16M12 7v14M8 21l4-7 4 7"/></svg>';
 const panel=document.createElement('dialog');
 panel.id='arch-a11y-panel';panel.className='arch-a11y-panel';
 panel.setAttribute('aria-labelledby','arch-a11y-title');
 panel.setAttribute('aria-describedby','arch-a11y-description');
 panel.innerHTML=[
  '<div class="arch-a11y-head"><div><span class="arch-a11y-overline">Γ.Α.Σ. «Ο ΑΡΧΕΛΑΟΣ»</span><h2 id="arch-a11y-title">Προσβασιμότητα</h2></div>',
  '<button class="arch-a11y-close" type="button" aria-label="Κλείσιμο ρυθμίσεων">×</button></div>',
  '<div class="arch-a11y-content"><p id="arch-a11y-description">Προσαρμόστε την εμφάνιση στις ανάγκες σας. Οι επιλογές αποθηκεύονται μόνο στη συσκευή σας.</p>',
  '<label class="arch-a11y-label" for="arch-a11y-size">Μέγεθος κειμένου</label>',
  '<select id="arch-a11y-size"><option value="100">Κανονικό · 100%</option><option value="125">Μεγαλύτερο · 125%</option><option value="150">Πολύ μεγάλο · 150%</option></select>',
  '<div class="arch-a11y-toggles">',
  '<button type="button" data-arch-a11y-toggle="contrast" aria-pressed="false">Εντονότερη αντίθεση</button>',
  '<button type="button" data-arch-a11y-toggle="links" aria-pressed="false">Υπογράμμιση συνδέσμων</button>',
  '<button type="button" data-arch-a11y-toggle="calm" aria-pressed="false">Χωρίς κινήσεις</button>',
  '</div><button class="arch-a11y-reset" type="button">Επαναφορά ρυθμίσεων</button></div>'
 ].join('');
 const backTop=document.createElement('button');
 backTop.type='button';backTop.className='arch-back-to-top';backTop.hidden=true;
 backTop.setAttribute('aria-label','Επιστροφή στην κορυφή');
 backTop.setAttribute('title','Επιστροφή στην κορυφή');
 backTop.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m12 19V5M5 12l7-7 7 7"/></svg>';
 document.body.append(launch,panel,backTop);
 const defaults={size:100,contrast:false,links:false,calm:false};
 let settings={...defaults};
 try{
  const saved=JSON.parse(localStorage.getItem('archelaos-accessibility-v1')||'null');
  if(saved&&typeof saved==='object'){
   if([100,125,150].includes(saved.size))settings.size=saved.size;
   for(const key of ['contrast','links','calm'])if(typeof saved[key]==='boolean')settings[key]=saved[key];
  }
 }catch(_){/* Storage can be disabled; controls still work. */}
 const size=panel.querySelector('#arch-a11y-size');
 function apply(){
  document.body.dataset.archA11ySize=String(settings.size);
  for(const key of ['contrast','links','calm']){
   document.body.classList.toggle('arch-a11y-'+key,settings[key]);
   panel.querySelector('[data-arch-a11y-toggle="'+key+'"]').setAttribute('aria-pressed',String(settings[key]));
  }
  size.value=String(settings.size);

 }
 apply();
 launch.addEventListener('click',()=>{
  if(panel.open)return;
  launch.setAttribute('aria-expanded','true');panel.showModal();
  panel.querySelector('.arch-a11y-close').focus();
 });
 panel.querySelector('.arch-a11y-close').addEventListener('click',()=>panel.close());
 panel.addEventListener('close',()=>{
  launch.setAttribute('aria-expanded','false');launch.focus({preventScroll:true});
 });
 panel.addEventListener('cancel',()=>launch.setAttribute('aria-expanded','false'));
 function saveSettings(){try{localStorage.setItem('archelaos-accessibility-v1',JSON.stringify(settings))}catch(_){}}
 size.addEventListener('change',()=>{settings.size=Number(size.value);apply();saveSettings()});
 panel.querySelectorAll('[data-arch-a11y-toggle]').forEach(button=>
  button.addEventListener('click',()=>{const key=button.dataset.archA11yToggle;settings[key]=!settings[key];apply();saveSettings()}));
 panel.querySelector('.arch-a11y-reset').addEventListener('click',()=>{settings={...defaults};apply();try{localStorage.removeItem('archelaos-accessibility-v1')}catch(_){}});
 const updateBackTop=()=>{
  const mobile=window.matchMedia('(max-width: 767px)').matches;
  const doc=document.documentElement;
  const remaining=doc.scrollHeight-(window.scrollY+window.innerHeight);
  const scrollable=doc.scrollHeight>window.innerHeight+400;
  backTop.hidden=mobile||!scrollable||remaining>Math.max(450,window.innerHeight*0.6);
 };
 backTop.addEventListener('click',()=>{
  const brand=document.querySelector('.arch-brand');
  if(brand)brand.focus({preventScroll:true});
  const reduced=settings.calm||window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({top:0,behavior:reduced?'auto':'smooth'});
 });
 window.addEventListener('scroll',updateBackTop,{passive:true});
 window.addEventListener('resize',updateBackTop,{passive:true});
 updateBackTop();
}


/* Optional Microsoft Clarity: never load before explicit analytics consent. */
function initOptionalAnalytics(){
 if(!['archelaos.club','www.archelaos.club'].includes(location.hostname))return;
 const key='archelaos-analytics-consent-v1';
 const read=()=>{try{return localStorage.getItem(key)}catch(_){return null}};
 const write=value=>{try{localStorage.setItem(key,value)}catch(_){}};
 function loadGoogleAnalytics(){
  if(window.__archelaosGaLoaded)return;
  window.__archelaosGaLoaded=true;
  window.dataLayer=window.dataLayer||[];
  window.gtag=function(){window.dataLayer.push(arguments)};
  window.gtag('js',new Date());
  window.gtag('config','G-WV7C3N770T',{send_page_view:true});
  const script=document.createElement('script');script.async=true;
  script.src='https://www.googletagmanager.com/gtag/js?id=G-WV7C3N770T';
  document.head.append(script);
 }
 function loadClarity(){
  if(window.__archelaosClarityLoaded)return;
  window.__archelaosClarityLoaded=true;
  window.clarity=window.clarity||function(){(window.clarity.q=window.clarity.q||[]).push(arguments)};
  window.clarity('consentv2',{ad_Storage:'denied',analytics_Storage:'granted'});
  const script=document.createElement('script');script.async=true;
  script.src='https://www.clarity.ms/tag/z79wwgm3p8';
  document.head.append(script);
 }
 const style=document.createElement('style');
 style.textContent=`
 #arch-analytics-consent{overflow:hidden;isolation:isolate;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);background:linear-gradient(140deg,#faf4e8f5,#eee0c7f5)!important;border:1px solid #bf9f5e!important;box-shadow:0 20px 64px #062b214d,0 2px 10px #b89b6533!important;transition:opacity .28s ease,transform .42s cubic-bezier(.2,.75,.2,1),visibility .28s}
 #arch-analytics-consent:before{content:'';position:absolute;inset:0 0 auto;height:3px;background:linear-gradient(90deg,#0d5039,#c5a45b,#0d5039);pointer-events:none}
 #arch-analytics-consent[data-closed="true"]{opacity:0;transform:translateY(26px) scale(.975);visibility:hidden;pointer-events:none}
 #arch-analytics-consent[data-closed="false"]{opacity:1;transform:translateY(0) scale(1);visibility:visible}
 #arch-analytics-consent button{transition:transform .2s ease,box-shadow .2s ease,background-color .2s ease}
 #arch-analytics-consent button:hover{transform:translateY(-2px);box-shadow:0 6px 16px #0b392b26}
 #arch-analytics-consent button:focus-visible,#arch-analytics-consent a:focus-visible,#arch-analytics-settings:focus-visible{outline:3px solid #bc9650;outline-offset:3px}
 #arch-analytics-settings{transition:transform .2s ease,box-shadow .2s ease;box-shadow:0 5px 18px #113f2b1c}
 #arch-analytics-settings:hover{transform:translateY(-2px);text-decoration:none!important}
 @media(max-width:600px){#arch-analytics-consent{bottom:12px!important;left:10px!important;right:10px!important;padding:18px!important;border-radius:16px!important}#arch-analytics-consent .arch-consent-buttons{display:grid!important;grid-template-columns:1fr 1fr;gap:8px!important}#arch-analytics-consent .arch-consent-buttons a{grid-column:1/-1;text-align:center}}
 @media(prefers-reduced-motion:reduce){#arch-analytics-consent,#arch-analytics-consent button,#arch-analytics-settings{transition:none!important;animation:none!important}}
 `;
 document.head.append(style);
 const panel=document.createElement('aside');
 panel.id='arch-analytics-consent';
 panel.setAttribute('aria-label','Επιλογές στατιστικών περιήγησης');
 panel.setAttribute('role','region');
 panel.style.cssText='position:fixed;z-index:2147483000;bottom:clamp(12px,3vw,24px);left:12px;right:12px;max-width:680px;margin:auto;background:#f3ead6;color:#123e2b;border:1px solid #b69a58;border-radius:18px;padding:clamp(16px,3vw,24px);box-shadow:0 12px 36px #102a2240;font:15px/1.6 system-ui,sans-serif';
 const title=document.createElement('strong');title.textContent='Η εμπειρία σας στον Αρχέλαο';title.style.cssText='display:block;font:700 21px/1.3 Georgia,serif;color:#9a7937';
 const description=document.createElement('p');description.textContent='Με την επιλογή σας ενεργοποιούνται τα Google Analytics 4 και Microsoft Clarity για τη βελτίωση της εμπειρίας χρήσης. Η αποδοχή είναι προαιρετική και δεν επηρεάζει την περιήγηση.';
 description.style.margin='8px 0 12px';
 const controls=document.createElement('div');controls.className='arch-consent-buttons';controls.style.cssText='display:flex;gap:10px;flex-wrap:wrap';
 const accept=document.createElement('button');accept.type='button';accept.textContent='Αποδοχή';accept.style.cssText='padding:9px 15px;border-radius:9px;border:1px solid #15452f;background:#15452f;color:white;cursor:pointer;font-weight:700;min-height:44px';
 const reject=document.createElement('button');reject.type='button';reject.textContent='Απόρριψη';reject.style.cssText='padding:9px 15px;border-radius:9px;border:1px solid #15452f;background:transparent;color:#15452f;cursor:pointer;font-weight:700;min-height:44px';
 const more=document.createElement('a');more.href='/privacy.html';more.textContent='Πολιτική απορρήτου';more.style.cssText='padding:9px 2px;color:#15452f;text-underline-offset:3px';
 controls.append(reject,accept,more);panel.append(title,description,controls);
 const settings=document.createElement('button');settings.id='arch-analytics-settings';settings.type='button';settings.textContent='Ρυθμίσεις στατιστικών';settings.setAttribute('aria-label','Αλλαγή επιλογής στατιστικών');
 settings.style.cssText='display:inline;background:none;border:0;color:inherit;font:inherit;text-decoration:none;cursor:pointer;padding:2px 4px;';
 const select=value=>{
  write(value);
  panel.dataset.closed='true';
  if(value==='accepted'){loadGoogleAnalytics();loadClarity();}
  else if(window.__archelaosClarityLoaded||window.__archelaosGaLoaded){
   if(typeof window.clarity==='function')window.clarity('consentv2',{ad_Storage:'denied',analytics_Storage:'denied'});
   window.location.reload(); // Remove the tracker from the current page after withdrawal.
  }
 };
 accept.addEventListener('click',()=>select('accepted'));
 reject.addEventListener('click',()=>select('rejected'));
 settings.addEventListener('click',()=>{panel.hidden=false;panel.dataset.closed='false';reject.focus()});
 const footerLegal=document.querySelector('.arch-footer-legal');
 if(footerLegal){const sep=document.createElement('span');sep.textContent=' · ';sep.setAttribute('aria-hidden','true');footerLegal.append(sep,settings);}
 document.body.append(panel);
 const current=read();panel.hidden=current==='accepted'||current==='rejected';
 panel.dataset.closed=panel.hidden?'true':'false';
 if(current==='accepted'){loadGoogleAnalytics();loadClarity();}
}

function ready(){renderHeader();renderFooter();renderSiteTools();routePreviewLinks();updateFavoriteCounts();initOptionalAnalytics()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();
