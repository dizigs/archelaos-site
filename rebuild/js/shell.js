/* Shared header + footer. Deliberately no MutationObserver, no legacy overlays. */
(function(){
'use strict';
const pages=[
  ['index.html','Αρχική'],['history.html','Ψηφιακό Μουσείο'],
  ['70-stigmes.html','70 Στιγμές'],['hall-of-fame.html','Hall of Fame'],
  ['stories.html','Ιστορίες'],['index.html#about','Ο Σύλλογος'],
  ['index.html#departments','Αθλήματα'],['board.html','Διοίκηση'],
  ['sponsors.html','Χορηγίες'],['contact.html','Επικοινωνία'],['search.html','Αναζήτηση'],['favorites.html','Αγαπημένα'],['contribute.html','Συνεισφορά Αρχείου']
];
const groups=[['Αρχείο',[2,3,4]],['Ο Σύλλογος',[5,6,7,8,9]]];
const path=(location.pathname.split('/').pop()||'index.html').toLowerCase();
const COMPLETED=new Set(['index.html','history.html','hall-of-fame.html','70-stigmes.html','stories.html','board.html','contact.html','sponsors.html','tmimata.html','retro-matches.html','search.html','favorites.html','contribute.html']);
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
  const brand=document.createElement('a');brand.className='arch-brand';brand.href=hrefFor(pages[0]);brand.setAttribute('aria-label','Αρχική - Γ.Α.Σ. Ο Αρχέλαος');
  const crest=document.createElement('img');crest.src='/assets/archelaos-crest.png';crest.alt='';crest.width=52;crest.height=52;
  const lines=document.createElement('span');lines.className='arch-brand-lines';
  const title=document.createElement('span');title.className='arch-brand-title';title.textContent='Γ.Α.Σ. «Ο ΑΡΧΕΛΑΟΣ»';
  const sub=document.createElement('span');sub.className='arch-brand-sub';sub.textContent='ΚΑΤΕΡΙΝΗ · 1956—2026';
  lines.append(title,sub);brand.append(crest,lines);inner.append(brand);
  const nav=document.createElement('nav');nav.className='arch-nav';nav.setAttribute('aria-label','Κύρια πλοήγηση');
  addLink(nav,pages[0]);addLink(nav,pages[1]);
  for(const group of groups){
    const details=document.createElement('details');const sum=document.createElement('summary');sum.textContent=group[0];
    const panel=document.createElement('div');panel.className='arch-dropdown';
    group[1].forEach(i=>addLink(panel,pages[i]));details.append(sum,panel);nav.append(details);
  }
  iconLink(nav,pages[10],'search','arch-nav-search','Αναζήτηση');inner.append(nav);
  const actions=document.createElement('div');actions.className='arch-header-actions';
  iconLink(actions,pages[11],'heart','arch-action arch-action-favorites','Αγαπημένα');
  iconLink(actions,pages[12],'plus','arch-action arch-action-contribute','Συνεισφέρω');
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
  iconLink(quick,pages[11],'heart','arch-mobile-action arch-mobile-favorites','Τα αγαπημένα μου');
  iconLink(quick,pages[12],'plus','arch-mobile-action arch-mobile-contribute','Συνεισφορά αρχείου');
  content.append(quick);
  const mobileLanguageSlot=document.createElement('div');mobileLanguageSlot.className='arch-language-slot arch-language-slot-mobile';mobileLanguageSlot.dataset.i18nSlot='mobile';mobileLanguageSlot.hidden=true;
  content.append(mobileLanguageSlot);
  for(const group of [['Εξερεύνηση',[0,1,2,3,4,10]],['Ο Σύλλογος',[5,6,7,8,9]]]){
    const caption=document.createElement('div');caption.className='arch-menu-group';caption.textContent=group[0];content.append(caption);
    group[1].forEach(i=>{const a=addLink(content,pages[i],'arch-mobile-link');const arrow=document.createElement('span');arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');a.append(arrow)});
  }
  drawer.append(content);document.body.prepend(drawer);document.body.prepend(header);
  let prior=null;
  btn.addEventListener('click',()=>{if(drawer.open)return;prior=document.activeElement;drawer.showModal();btn.setAttribute('aria-expanded','true');document.body.classList.add('arch-dialog-open');close.focus()});
  close.addEventListener('click',()=>{document.body.classList.remove('arch-dialog-open');drawer.close()});
  drawer.addEventListener('click',e=>{if(e.target===drawer)drawer.close()});
  drawer.addEventListener('cancel',()=>{btn.setAttribute('aria-expanded','false');document.body.classList.remove('arch-dialog-open')});
 drawer.addEventListener('close',()=>{btn.setAttribute('aria-expanded','false');document.body.classList.remove('arch-dialog-open');if(prior?.isConnected)prior.focus()});
  document.addEventListener('click',e=>{if(!nav.contains(e.target))nav.querySelectorAll('details[open]').forEach(d=>d.open=false)});
  nav.querySelectorAll('details').forEach(d=>d.addEventListener('toggle',()=>{if(d.open)nav.querySelectorAll('details').forEach(other=>{if(other!==d)other.open=false})}));
}
function renderFooter(){
  if(document.querySelector('.arch-footer'))return;
  const footer=document.createElement('footer');footer.className='arch-footer';
  footer.innerHTML='<div class="arch-footer-inner"><div class="arch-footer-top"><img src="/assets/archelaos-crest.png" alt="" loading="lazy" width="58" height="58"><div><strong>Γ.Α.Σ. «Ο ΑΡΧΕΛΑΟΣ»</strong><small>ΚΑΤΕΡΙΝΗ · 1956—2026</small></div></div><div class="arch-footer-rule"></div><div class="arch-footer-columns"><section><h2>ΨΗΦΙΑΚΟ ΜΟΥΣΕΙΟ</h2><a href="/history.html">Η ιστορία</a><a href="/70-stigmes.html">70 Στιγμές</a></section><section><h2>ΟΙ ΑΝΘΡΩΠΟΙ</h2><a href="/hall-of-fame.html">Hall of Fame</a><a href="/stories.html">Ιστορίες</a><a href="/board.html">Διοίκηση</a></section><section><h2>Ο ΣΥΛΛΟΓΟΣ</h2><a href="/index.html">Αρχική</a><a href="/index.html#departments">Αθλήματα</a><a href="/contact.html">Επικοινωνία</a></section></div><div class="arch-footer-community"><div><strong>Η ιστορία του Αρχέλαου συνεχίζεται.</strong><p>Κρατήστε τις αγαπημένες σας στιγμές ή βοηθήστε μας να διασώσουμε μια ακόμη.</p></div><div class="arch-footer-ctas"></div></div><div class="arch-footer-social" aria-label="Επίσημοι σύνδεσμοι"></div><div class="arch-footer-bottom"><span>Γ.Α.Σ. Αρχέλαος Κατερίνης · Από το 1956</span><span>Αθλητισμός · Παιδεία · Συμμετοχή</span></div></div>';
  const ctas=footer.querySelector('.arch-footer-ctas');
  iconLink(ctas,pages[11],'heart','arch-footer-cta','Αγαπημένα');
  iconLink(ctas,pages[12],'plus','arch-footer-cta arch-footer-cta-primary','Συνεισφέρω');
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
function routePreviewLinks(){
 if(!location.pathname.startsWith('/rebuild/'))return;
 // Migration-only routing: public pages remain untouched, unfinished pages remain at their original URL.
 for(const link of document.querySelectorAll('a[href]')){
  const raw=link.getAttribute('href');if(!raw||raw.startsWith('#'))continue;
  let url;try{url=new URL(raw,location.href)}catch(_){continue}
  if(url.origin!==location.origin||url.pathname.startsWith('/rebuild/'))continue;
  const file=url.pathname.replace(/^\//,'');
  if(!COMPLETED.has(file))continue;
  link.href='/rebuild/'+file+url.search+url.hash;
 }
}
function ready(){renderHeader();renderFooter();routePreviewLinks();updateFavoriteCounts()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();
