/* Γ.Α.Σ. Αρχέλαος — canonical site-wide navigation. Edit this file once for all pages. */
(() => {
  'use strict';
  const base = 'shared/site-nav.js';
  const labels = {
    home:['Αρχική','Home'], museum:['Ψηφιακό Μουσείο','Digital Museum'], moments:['70 Στιγμές','70 Moments'],
    people:['Hall of Fame','Hall of Fame'], stories:['Ιστορίες','Stories'],
    club:['Ο Σύλλογος','The Club'], sports:['Αθλήματα','Sports'], board:['Διοίκηση','Board'],
    sponsors:['Χορηγίες','Sponsors'], contact:['Επικοινωνία','Contact'], historyHeading:['ΙΣΤΟΡΙΚΟ ΑΡΧΕΙΟ','HISTORICAL ARCHIVE'],
    clubHeading:['Ο ΣΥΛΛΟΓΟΣ','THE CLUB'], more:['Περισσότερες ενότητες','More sections']
  };
  const icons = {
    home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    museum:'<path d="M3 10 12 3l9 7M5 10v11m4-11v11m6-11v11m4-11v11M3 21h18"/>',
    moments:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
    people:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 11a3 3 0 0 0 0-6M18 14a6 6 0 0 1 3 6"/>',
    stories:'<path d="M4 4h15v16H4zM8 8h7m-7 4h7m-7 4h5"/>',
    club:'<path d="M12 3 3 8v4c0 5 4 8 9 10 5-2 9-5 9-10V8z"/>',
    sports:'<circle cx="12" cy="12" r="8"/><path d="m12 4 3 5-3 3-4-3-3 3m9 0 5 1-1 5m-10-3-2 5"/>',
    board:'<path d="M3 10h18M5 10v11m5-11v11m4-11v11m5-11v11M2 21h20M12 3 2 9h20z"/>',
    sponsors:'<path d="M3 8 12 3l9 5-9 5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
    contact:'<rect width="19" height="15" x="2.5" y="4.5" rx="2"/><path d="m3 6 9 7 9-7"/>'
  };
  const ico = key => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[key]}</svg>`;
  const items = {
    home:'index.html', museum:'history.html', moments:'70-stigmes.html', people:'hall-of-fame.html',
    stories:'stories.html', club:'index.html#about', sports:'index.html#departments',
    board:'board.html', sponsors:'sponsors.html', contact:'contact.html'
  };
  const path = decodeURIComponent(location.pathname.split('/').pop() || 'index.html');
  const active = ({'index.html':'home','history.html':'museum','70-stigmes.html':'moments',
    'hall-of-fame.html':'people','stories.html':'stories','board.html':'board','sponsors.html':'sponsors',
    'contact.html':'contact'})[path] || 'home';
  const currentTop = ['museum','moments','people','stories'].includes(active)?'museum':active==='board'?'club':active;
  const cur = key => (active===key?' aria-current="page"':'');
  const navlink = key => `<a class="as-toplink${currentTop===key?' as-current':''}" href="${items[key]}"${currentTop===key?' aria-current="page"':''} data-as-key="${key}">${labels[key][0]}</a>`;
  const sublink = key => `<a class="as-subitem" href="${items[key]}"${cur(key)} data-as-key="${key}">${ico(key)}<span>${labels[key][0]}</span></a>`;
  const group = (key, children) => `<div class="as-group" data-as-group="${key}">${navlink(key)}<button type="button" class="as-dropdown-toggle" data-as-drop="${key}" aria-expanded="false" aria-haspopup="true" aria-controls="as-popup-${key}" aria-label="${key==='museum'?'Ενότητες Μουσείου':'Ενότητες Συλλόγου'}"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg></button><div id="as-popup-${key}" class="as-popover">${children.map(sublink).join('')}</div></div>`;
  const mobileLink = key => `<a class="as-mobile-link${active===key?' as-current':''}" href="${items[key]}"${cur(key)} data-as-key="${key}">${ico(key)}<span>${labels[key][0]}</span></a>`;
  const mount = document.getElementById('as-global-nav-mount');
  if (!mount) return;
  mount.innerHTML = `<header id="as-global-header">
    <div class="as-mainbar">
      <a class="as-brand" href="index.html" aria-label="Γ.Α.Σ. Αρχέλαος — Αρχική"><img class="as-emblem" src="archelaos-logo-gold.png" alt="Έμβλημα Αρχέλαου"><span class="as-brandtext"><span class="as-brandname">Γ.Α.Σ. «Ο ΑΡΧΕΛΑΟΣ»</span><span class="as-brandmeta">ΚΑΤΕΡΙΝΗ · 1956—2026</span></span></a>
      <nav class="as-desktop" aria-label="Κύριο μενού">
        ${navlink('home')}${group('museum',['museum','moments','people','stories'])}${group('club',['club','sports','board'])}${navlink('sponsors')}${navlink('contact')}
        <span class="as-separator" aria-hidden="true"></span><button type="button" class="as-language" data-as-language aria-label="Switch language">EN</button>
      </nav>
      <div class="as-mobile-controls"><button type="button" class="as-language" data-as-language aria-label="Switch language">EN</button><button type="button" class="as-burger" id="as-mobile-trigger" aria-label="Άνοιγμα μενού" aria-controls="as-mobile-drawer" aria-expanded="false"><span></span><span></span><span></span></button></div>
    </div>
    <div class="as-backdrop" id="as-menu-backdrop" aria-hidden="true"></div>
    <div class="as-drawer" id="as-mobile-drawer" role="dialog" aria-modal="true" aria-label="Μενού πλοήγησης" aria-hidden="true" inert>
      <div class="as-drawer-head"><div><div class="as-drawer-title">Γ.Α.Σ. «Ο Αρχέλαος»</div><small class="as-drawer-eyebrow">1956 — 2026 · 70 ΧΡΟΝΙΑ</small></div><button type="button" class="as-close" id="as-close-menu" aria-label="Κλείσιμο μενού">×</button></div>
      <nav class="as-drawer-scroll" aria-label="Μενού κινητού">${mobileLink('home')}<div class="as-mobile-label" data-as-key="historyHeading">${labels.historyHeading[0]}</div>${['museum','moments','people','stories'].map(mobileLink).join('')}<div class="as-mobile-label" data-as-key="clubHeading">${labels.clubHeading[0]}</div>${['club','sports','board','sponsors','contact'].map(mobileLink).join('')}</nav>
      <div class="as-mobile-foot"><small>Γ.Α.Σ. Αρχέλαος · Κατερίνη</small><button type="button" class="as-language" data-as-language aria-label="Switch language">EN</button></div>
    </div>
  </header>`;

  const header = mount.querySelector('#as-global-header');
  const drawer = header.querySelector('#as-mobile-drawer');
  const trigger = header.querySelector('#as-mobile-trigger');
  const backdrop = header.querySelector('#as-menu-backdrop');
  const closeBtn = header.querySelector('#as-close-menu');
  let previousFocus = null;
  const open = () => {
    previousFocus = document.activeElement;
    header.querySelectorAll('.as-group.as-open').forEach(g=>g.classList.remove('as-open'));
    drawer.inert = false; drawer.setAttribute('aria-hidden','false');
    drawer.classList.add('as-visible'); backdrop.classList.add('as-visible');
    trigger.setAttribute('aria-expanded','true'); trigger.setAttribute('aria-label','Κλείσιμο μενού');
    document.body.classList.add('as-nav-open'); closeBtn.focus();
  };
  const close = () => {
    if (!drawer.classList.contains('as-visible')) return;
    drawer.classList.remove('as-visible'); backdrop.classList.remove('as-visible');
    drawer.inert = true; drawer.setAttribute('aria-hidden','true');
    trigger.setAttribute('aria-expanded','false'); trigger.setAttribute('aria-label','Άνοιγμα μενού');
    document.body.classList.remove('as-nav-open');
    if(previousFocus && typeof previousFocus.focus==='function') previousFocus.focus();
  };
  trigger.addEventListener('click',()=>drawer.classList.contains('as-visible')?close():open());
  backdrop.addEventListener('click', close);
  closeBtn.addEventListener('click', close);
  drawer.addEventListener('click',e=>{if(e.target.closest('a')) close();});
  const closePopovers = () => header.querySelectorAll('.as-group').forEach(g=>{
    g.classList.remove('as-open');g.querySelector('.as-dropdown-toggle').setAttribute('aria-expanded','false');
  });
  header.querySelectorAll('[data-as-drop]').forEach(btn=>btn.addEventListener('click', e=>{
    e.stopPropagation(); const group = btn.closest('.as-group'); const was = group.classList.contains('as-open');
    closePopovers(); group.classList.toggle('as-open',!was); btn.setAttribute('aria-expanded', String(!was));
  }));
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('#as-global-header .as-group'))closePopovers();});
  document.addEventListener('keydown',e=>{
    if (e.key === 'Escape') {if(drawer.classList.contains('as-visible')){e.preventDefault();close();}closePopovers();return;}
    if(e.key==='Tab' && drawer.classList.contains('as-visible')){
      const elements = [...drawer.querySelectorAll('a[href],button:not([disabled])')].filter(el=>el.getClientRects().length);
      if(!elements.length)return;
      if(e.shiftKey && document.activeElement===elements[0]){e.preventDefault();elements[elements.length-1].focus();}
      else if(!e.shiftKey && document.activeElement===elements[elements.length-1]){e.preventDefault();elements[0].focus();}
    }
  });
  window.addEventListener('resize',()=>{if(innerWidth>1120)close();});

  let syncBusy=false;
  const langNow = () => document.documentElement.lang==='en'?'en':'el';
  function paintNavLanguage(){
    const en = langNow()==='en';
    header.querySelectorAll('[data-as-key]').forEach(el=>{
      const k=el.dataset.asKey;
      if(!labels[k]) return;
      const label=labels[k][en?1:0];
      const span=el.querySelector('span');
      if(span && el.classList.contains('as-subitem') || span && el.classList.contains('as-mobile-link')) span.textContent=label;
      else if(el.classList.contains('as-toplink')) el.textContent=label;
      else el.textContent=label;
    });
    header.querySelectorAll('[data-as-language]').forEach(button=>{
      button.textContent=en?'GR':'EN';button.setAttribute('aria-label',en?'Μετάβαση στα ελληνικά':'Switch to English');
      button.title=en?'Ελληνικά':'English';
    });
    trigger.setAttribute('aria-label',drawer.classList.contains('as-visible')?(en?'Close menu':'Κλείσιμο μενού'):(en?'Open menu':'Άνοιγμα μενού'));
    closeBtn.setAttribute('aria-label',en?'Close menu':'Κλείσιμο μενού');
    drawer.setAttribute('aria-label',en?'Navigation menu':'Μενού πλοήγησης');
  }
  function changeLanguage(target){
    if(target===langNow()){paintNavLanguage();return;}
    const legacy=document.getElementById('archAnniversaryLanguage') || document.getElementById('language');
    if(legacy) legacy.click();
    if(langNow()!==target && typeof window.setLanguage==='function') window.setLanguage(target);
    if(langNow()!==target){document.documentElement.lang=target;document.body.classList.toggle('lang-en',target==='en');document.body.classList.toggle('lang-el',target==='el');}
    try {localStorage.setItem('archelaos_lang',target);}catch(_){ }
    paintNavLanguage();
  }
  header.querySelectorAll('[data-as-language]').forEach(btn=>btn.addEventListener('click',()=>changeLanguage(langNow()==='en'?'el':'en')));
  const initLanguage = () => {
    let saved='el';try{saved=localStorage.getItem('archelaos_lang')==='en'?'en':'el';}catch(_){saved=langNow();}
    if(saved!==langNow())changeLanguage(saved);
    paintNavLanguage();
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initLanguage,{once:true}); else initLanguage();
  new MutationObserver(()=>{if(!syncBusy){syncBusy=true;queueMicrotask(()=>{syncBusy=false;paintNavLanguage();});}}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
})();
