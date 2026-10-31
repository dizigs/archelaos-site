/* Shared header + footer. Deliberately no MutationObserver, no legacy overlays. */
(function(){
'use strict';
const pages=[
  ['index.html','Αρχική'],['history.html','Ψηφιακό Μουσείο'],
  ['70-stigmes.html','70 Στιγμές'],['hall-of-fame.html','Hall of Fame'],
  ['stories.html','Ιστορίες'],['index.html#about','Ο Σύλλογος'],
  ['index.html#departments','Αθλήματα'],['board.html','Διοίκηση'],
  ['sponsors.html','Χορηγίες'],['contact.html','Επικοινωνία'],['search.html','Αναζήτηση']
];
const groups=[['Συλλογές',[2,3,4]],['Ο Σύλλογος',[5,6,7]]];
const path=(location.pathname.split('/').pop()||'index.html').toLowerCase();
const COMPLETED=new Set(['index.html','history.html','hall-of-fame.html','70-stigmes.html','stories.html','board.html','contact.html','sponsors.html','tmimata.html','retro-matches.html','search.html']);
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
  addLink(nav,pages[8]);addLink(nav,pages[9]);addLink(nav,pages[10],'arch-nav-search');inner.append(nav);
  const btn=document.createElement('button');btn.className='arch-menu-open';btn.type='button';btn.textContent='☰';btn.setAttribute('aria-label','Άνοιγμα μενού');
  btn.setAttribute('aria-haspopup','dialog');inner.append(btn);header.append(inner);
  const drawer=document.createElement('dialog');drawer.className='arch-menu-dialog';drawer.setAttribute('aria-label','Μενού Αρχέλαου');
  const head=document.createElement('div');head.className='arch-menu-head';
  const name=document.createElement('strong');name.textContent='Περιήγηση';
  const close=document.createElement('button');close.className='arch-close';close.type='button';close.textContent='×';close.setAttribute('aria-label','Κλείσιμο μενού');
  head.append(name,close);drawer.append(head);
  const content=document.createElement('div');content.className='arch-menu-content';
  for(const group of [['Εξερεύνηση',[0,1,2,3,4]],['Ο Σύλλογος',[5,6,7,8,9,10]]]){
    const caption=document.createElement('div');caption.className='arch-menu-group';caption.textContent=group[0];content.append(caption);
    group[1].forEach(i=>{const a=addLink(content,pages[i],'arch-mobile-link');const arrow=document.createElement('span');arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');a.append(arrow)});
  }
  drawer.append(content);document.body.prepend(drawer);document.body.prepend(header);
  let prior=null;
  btn.addEventListener('click',()=>{prior=document.activeElement;drawer.showModal();document.body.classList.add('arch-dialog-open');close.focus()});
  close.addEventListener('click',()=>{document.body.classList.remove('arch-dialog-open');drawer.close()});
  drawer.addEventListener('click',e=>{if(e.target===drawer)drawer.close()});
  drawer.addEventListener('cancel',()=>document.body.classList.remove('arch-dialog-open'));
 drawer.addEventListener('close',()=>{document.body.classList.remove('arch-dialog-open');if(prior?.isConnected)prior.focus()});
  document.addEventListener('click',e=>{if(!nav.contains(e.target))nav.querySelectorAll('details[open]').forEach(d=>d.open=false)});
  nav.querySelectorAll('details').forEach(d=>d.addEventListener('toggle',()=>{if(d.open)nav.querySelectorAll('details').forEach(other=>{if(other!==d)other.open=false})}));
}
function renderFooter(){
  if(document.querySelector('.arch-footer'))return;
  const footer=document.createElement('footer');footer.className='arch-footer';
  footer.innerHTML='<div class="arch-footer-inner"><div class="arch-footer-top"><img src="/assets/archelaos-crest.png" alt="" loading="lazy" width="58" height="58"><div><strong>Γ.Α.Σ. «Ο ΑΡΧΕΛΑΟΣ»</strong><small>ΚΑΤΕΡΙΝΗ · 1956—2026</small></div></div><div class="arch-footer-rule"></div><div class="arch-footer-columns"><section><h2>ΨΗΦΙΑΚΟ ΜΟΥΣΕΙΟ</h2><a href="/history.html">Η ιστορία</a><a href="/70-stigmes.html">70 Στιγμές</a></section><section><h2>ΟΙ ΑΝΘΡΩΠΟΙ</h2><a href="/hall-of-fame.html">Hall of Fame</a><a href="/stories.html">Ιστορίες</a><a href="/board.html">Διοίκηση</a></section><section><h2>Ο ΣΥΛΛΟΓΟΣ</h2><a href="/index.html">Αρχική</a><a href="/index.html#departments">Αθλήματα</a><a href="/contact.html">Επικοινωνία</a></section></div><div class="arch-footer-social"><a href="https://www.facebook.com/oarxelaos" target="_blank" rel="noopener noreferrer">Facebook</a><a href="https://www.youtube.com/@GASArchelaosKaterinis" target="_blank" rel="noopener noreferrer">YouTube</a></div><div class="arch-footer-bottom"><span>Γ.Α.Σ. Αρχέλαος Κατερίνης · Από το 1956</span><span>Αθλητισμός · Παιδεία · Συμμετοχή</span></div></div>';
  const searchAnchor=document.createElement('a');searchAnchor.href=hrefFor(pages[10]);searchAnchor.textContent='Αναζήτηση αρχείου';footer.querySelector('.arch-footer-social')?.append(searchAnchor);
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
function ready(){renderHeader();renderFooter();routePreviewLinks()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();
