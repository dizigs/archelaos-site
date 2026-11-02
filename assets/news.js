/* News reader: source-led items, shareable deep links, locally saved favorites. */
(()=>{'use strict';
const $=id=>document.getElementById(id),PAGE_SIZE=18,state={items:[],category:'all',query:'',page:Math.max(1,Number.parseInt(new URLSearchParams(location.search).get('page')||'1',10)||1)};
const en=()=>document.documentElement.lang==='en';
const t=(a,b)=>en()?b:a;
const norm=s=>String(s||'').toLocaleLowerCase('el').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ς/g,'σ');
const fmt=date=>new Intl.DateTimeFormat(en()?'en-GB':'el-GR',{day:'numeric',month:'long',year:'numeric'}).format(new Date(date+'T12:00:00'));
let lastFocus=null,active=null;
const categories={achievements:['ΔΙΑΚΡΙΣΕΙΣ','ACHIEVEMENTS'],activities:['ΔΡΑΣΕΙΣ','ACTIVITIES'],club:['ΣΥΛΛΟΓΟΣ','CLUB']};
const link=(href,label)=>{const a=document.createElement('a');a.href=href;a.textContent=label;return a};
const label=x=>(categories[x.category]||['ΑΡΧΕΛΑΟΣ','ARCHELAOS'])[en()?1:0];
function media(x,cls){
 const b=document.createElement(cls==='an-cover'?'figure':'div');b.className=cls;
 const path=String(x.image||'');
 const local=/^(?:(?:images|assets)\/[a-zA-Z0-9._/-]+|archelaos-logo-gold|archelaos-welcome)\.(?:webp|jpg|jpeg|png|svg)$/.test(path);
 let original=false;
 try{const u=new URL(path);original=u.protocol==='https:'&&!!u.hostname&&!u.username&&!u.password}catch(_){}
 const empty=()=>{
   // Club-owned welcome artwork is the editorial fallback when no valid article image exists.
   b.classList.remove('is-emblem','is-unillustrated');b.classList.add('is-welcome-fallback');b.replaceChildren();
   const art=document.createElement('img');
   const sport=String(x.sport||'').toLocaleLowerCase('el').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
   const handball=/χαντμπολ|χειροσφ|handball/.test(sport);
   art.src=handball?'/images/archelaos-news-handball.svg?v=20261102-gold':'/archelaos-welcome.png';
   art.alt=t('Εικαστικό του Αρχέλαου — όχι φωτογραφία της είδησης','Archelaos artwork — not an article photograph');
   art.loading='lazy';art.decoding='async';
   art.addEventListener('error',()=>{
     b.classList.add('is-unillustrated');b.replaceChildren();
     const line=document.createElement('span');line.className='an-no-photo';
     line.textContent=t('ΑΡΧΕΙΟ ΑΡΧΕΛΑΟΥ','ARCHELAOS ARCHIVE');b.append(line);
   },{once:true});
   b.append(art);
 };
 if(!local&&!original){empty();return b}
 const img=document.createElement('img');img.src=original?path:'/'+path+(path==='images/archelaos-news-handball.svg'?'?v=20261102-gold':'');img.alt=x.imageNote||x.title;
 img.loading=cls==='an-feature-media'||cls==='an-cover'?'eager':'lazy';img.decoding='async';
 img.addEventListener('error',()=>{
   if(local&&!img.dataset.archiveFallback){
     img.dataset.archiveFallback='1';img.src='https://raw.githubusercontent.com/dizigs/archelaos-site/main/'+path;
   }else empty();
 });
 if(path==='archelaos-logo-gold.png') b.classList.add('is-heritage-crest');
 b.append(img);return b;
}
function info(x){return {title:x.title,summary:x.summary,href:'news.html?article='+encodeURIComponent(x.id)}}
function heart(x,cls){return window.ArchelaosFavorites?.button('news',x.id,cls,info(x))||document.createElement('span')}
function meta(x){const m=document.createElement('div');m.className='an-meta';for(const value of [label(x),x.sport,fmt(x.date)]){const s=document.createElement('span');s.textContent=value;m.append(s)}return m}
function articleLink(x,cls){
 const a=document.createElement('a');
 a.className=cls;
 a.href='/news.html?article='+encodeURIComponent(x.id);
 a.setAttribute('aria-label',t('Άνοιγμα είδησης: ','Open article: ')+x.title);
 // Keep ordinary click inside the modal; preserve browser new-tab gestures.
 a.addEventListener('click',e=>{
  if(e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
  e.preventDefault();show(x.id);
 });
 return a;
}
function card(x){
 const el=document.createElement('article');el.className='an-card';
 const m=media(x,'an-card-media'),content=document.createElement('div');content.className='an-card-text';
 const h=document.createElement('h3');h.textContent=x.title;const p=document.createElement('p');p.textContent=x.summary;
 const foot=document.createElement('div');foot.className='an-card-foot';
 foot.append(heart(x,'an-card-heart'));content.append(meta(x),h,p,foot);
 el.append(m,content,articleLink(x,'an-card-hit'));
 return el;
}
function pageUrl(page){
 const url=new URL(location.href);
 url.searchParams.delete('article');
 if(page===1)url.searchParams.delete('page');
 else url.searchParams.set('page',String(page));
 return url.pathname+url.search+url.hash;
}
function setPage(page,updateHistory=true){
 if(page===state.page)return;
 state.page=page;
 if(updateHistory)history.pushState(null,'',pageUrl(page));
 draw();
 const heading=document.querySelector('.an-section-heading');
 if(heading)heading.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
 $('an-count').focus({preventScroll:true});
}
function renderPagination(pageCount){
 const nav=$('an-pagination');
 nav.replaceChildren();
 nav.hidden=pageCount<=1;
 if(pageCount<=1)return;
 const row=document.createElement('div');row.className='an-page-controls';
 const action=(label,page,active=false,disabled=false,kind='number')=>{
  const a=document.createElement('a');a.href=pageUrl(page);
  a.className='an-page-link'+(active?' is-current':'')+(kind==='navigation'?' is-navigation':'');
  a.textContent=label;
  if(active)a.setAttribute('aria-current','page');
  if(disabled){a.setAttribute('aria-disabled','true');a.tabIndex=-1}
  else a.addEventListener('click',e=>{
   if(e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
   e.preventDefault();setPage(page);
  });
  row.append(a);
 };
 action(t('Προηγούμενη','Previous'),Math.max(1,state.page-1),false,state.page===1,'navigation');
 for(let n=1;n<=pageCount;n++)action(String(n),n,n===state.page);
 action(t('Επόμενη','Next'),Math.min(pageCount,state.page+1),false,state.page===pageCount,'navigation');
 nav.append(row);
 const caption=document.createElement('p');caption.className='an-page-caption';
 caption.textContent=t('Σελίδα ','Page ')+state.page+' / '+pageCount;
 nav.append(caption);
}
function draw(){
 const q=norm(state.query.trim());
 const lead=state.items.find(i=>i.featured)||state.items[0];
 const showLead=state.category==='all'&&!q;
 $('an-feature').hidden=!showLead||state.page!==1;
 const items=state.items.filter(x=>(!showLead||x.id!==lead?.id)&&(state.category==='all'||x.category===state.category)&&(!q||(window.ArchelaosSportSearch?window.ArchelaosSportSearch.sportMatch([x.title,x.summary,x.sport,x.source,...(x.body||[])].join(' '),q):norm([x.title,x.summary,x.sport,x.source,...(x.body||[])].join(' ')).includes(q)))).sort((a,b)=>b.date.localeCompare(a.date));
 const pageCount=Math.max(1,Math.ceil(items.length/PAGE_SIZE));
 state.page=Math.min(Math.max(1,state.page),pageCount);
 const offset=(state.page-1)*PAGE_SIZE;
 const visible=items.slice(offset,offset+PAGE_SIZE);
 $('an-feature').hidden=!showLead||state.page!==1;
 const frag=document.createDocumentFragment();for(const x of visible)frag.append(card(x));
 if(!items.length&&!showLead){const p=document.createElement('p');p.className='an-empty';p.textContent=t('Δεν βρέθηκαν δημοσιεύσεις.','No matching news found.');frag.append(p)}
 $('an-grid').replaceChildren(frag);
 const first=items.length?offset+1:0;
 const last=Math.min(offset+visible.length,items.length);
 $('an-count').textContent=t('Εμφάνιση ','Showing ')+first+'–'+last+' / '+items.length+t(' ειδήσεις',' stories')+(showLead&&state.page===1?t(' · +1 προτεινόμενη',' · +1 featured'):'');
 renderPagination(pageCount);
}
function featured(){
 const x=state.items.find(i=>i.featured)||state.items[0];if(!x)return;
 const article=document.createElement('article');article.className='an-feature-card';const m=media(x,'an-feature-media');
 const content=document.createElement('div');content.className='an-feature-text';
 const h=document.createElement('h2');h.textContent=x.title;const p=document.createElement('p');p.textContent=x.summary;
 content.append(meta(x),h,p);article.append(m,content,articleLink(x,'an-feature-hit'));$('an-feature').replaceChildren(article);
}
let closing=false;
function show(id){
 const x=state.items.find(i=>i.id===id);if(!x)return;active=x;lastFocus=document.activeElement;
 const detail=$('an-detail');detail.replaceChildren();
 const fig=media(x,'an-cover');
 if(x.imageNote){const c=document.createElement('figcaption');c.textContent=x.imageNote;fig.append(c)}
 const h=document.createElement('h2');h.id='an-dialog-title';h.textContent=x.title;
 const lead=document.createElement('p');lead.className='an-summary';lead.textContent=x.summary;
 detail.append(meta(x),h,fig,lead);
 for(const text of x.body||[]){const p=document.createElement('p');p.textContent=text;detail.append(p)}
 const source=document.createElement('div');source.className='an-source';source.textContent=t('Πηγή: ','Source: ')+x.source;const links=document.createElement('div');links.className='an-links';
 if(x.sourceUrl&&/^https:\/\//.test(x.sourceUrl)){const a=link(x.sourceUrl,t('Αρχικό δημοσίευμα','Original article'));a.target='_blank';a.rel='noopener noreferrer';links.append(a)}
 for(const s of x.additionalSources||[]){if(s&&typeof s.url==='string'&&/^https:\/\//.test(s.url)){const a=link(s.url,s.label||t('Επιπλέον πηγή','Additional source'));a.target='_blank';a.rel='noopener noreferrer';links.append(a)}}
 for(const id of x.personIds||[]){const a=link('/hall-of-fame.html?person='+encodeURIComponent(id),'');a.dataset.personId=id;a.dataset.personName='true';a.setAttribute('aria-haspopup','dialog');a.setAttribute('title',t('Άνοιγμα βιογραφικού εδώ, πάνω από την είδηση','Open biography here over the article'));links.append(a)}
 const kinds=Array.isArray(x.archiveKinds)?x.archiveKinds:[];
 if(!x.unverified&&x.sourceUrl?.startsWith('https://')){
  if((kinds.includes('interview')||kinds.includes('statement'))&&x.intervieweeName){
   links.append(link('/interviews.html?record='+encodeURIComponent('news-'+x.id),
     t('Συνέντευξη ή δήλωση · Αρχείο Φωνών','Interview / statement · Voices archive')));
  }
  if(kinds.includes('press_clipping')){
   links.append(link('/interviews.html?kind=press&record='+encodeURIComponent('press-news-'+x.id),
     t('Απόκομμα Τύπου · Αρχείο','Press clipping · Archive')));
  }
 }
 if(links.querySelector('[data-person-name]')){
  window.ArchelaosBio.load().then(data=>{
   const names=new Map(data.people.map(p=>[p.id,p.name]));
   links.querySelectorAll('[data-person-name]').forEach(a=>{a.textContent=names.get(a.dataset.personId)||t('Βιογραφικό','Biography')});
  }).catch(()=>{links.querySelectorAll('[data-person-name]').forEach(a=>{a.textContent=t('Βιογραφικό','Biography')})});
 }
 source.append(links);detail.append(source);
 void window.ArchelaosLinks?.append(detail,'news',x.id,{limit:8,excludeKinds:['person']});
 const b=$('an-dialog-heart'),favorites=window.ArchelaosFavorites;const saved=favorites?.has('news',x.id);
 b.dataset.favoriteKind='news';b.dataset.favoriteId=x.id;b.querySelector('span').textContent=saved?'♥':'♡';b.setAttribute('aria-pressed',String(!!saved));b.setAttribute('aria-label',saved?'Αφαίρεση από τα αγαπημένα':'Αποθήκευση στα αγαπημένα');
 const dialog=$('an-dialog');if(!dialog.open)dialog.showModal();$('an-close').focus({preventScroll:true});
 // This reader is reused: a new article must start at its own heading.
 dialog.querySelector('.an-dialog-inner').scrollTop=0;
 const url=new URL(location.href);url.searchParams.set('article',x.id);history.replaceState(null,'',url)
}
// A second *native* showModal() joins the browser top layer above the news
// dialog. The shared biography lifecycle keeps scroll locked until both close.
$('an-detail').addEventListener('click',async event=>{
 const a=event.target.closest?.('a[data-person-id]');
 if(!a||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||a.target==='_blank')return;
 event.preventDefault();
 try{
  const opened=await window.ArchelaosBio.open(a.dataset.personId);
  if(!opened)throw Error('Biography not found');
 }catch(err){
  console.warn('In-place biography:',err);
  let status=$('an-bio-error');
  if(!status){status=document.createElement('p');status.id='an-bio-error';status.className='an-bio-error';status.setAttribute('role','status');$('an-detail').append(status)}
  status.textContent=t('Το βιογραφικό δεν είναι προσωρινά διαθέσιμο. Η είδηση παραμένει ανοιχτή.','Biography temporarily unavailable. The article remains open.');
 }
});
const dialog=$('an-dialog');
$('an-dialog-heart').addEventListener('click',()=>{if(!active||!window.ArchelaosFavorites)return;window.ArchelaosFavorites.toggle('news',active.id,info(active));$('an-dialog-heart').querySelector('span').textContent=window.ArchelaosFavorites.has('news',active.id)?'♥':'♡'});
$('an-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
dialog.addEventListener('close',()=>{active=null;const url=new URL(location.href);url.searchParams.delete('article');history.replaceState(null,'',url);if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true})});
$('an-search').addEventListener('input',e=>{state.query=e.target.value;state.page=1;history.replaceState(null,'',pageUrl(1));draw()});
document.querySelectorAll('.an-filter').forEach(b=>b.addEventListener('click',()=>{state.category=b.dataset.category;state.page=1;history.replaceState(null,'',pageUrl(1));document.querySelectorAll('.an-filter').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));draw()}));
window.addEventListener('popstate',()=>{state.page=Math.max(1,Number.parseInt(new URLSearchParams(location.search).get('page')||'1',10)||1);draw();const id=new URLSearchParams(location.search).get('article');if(id&&id!==active?.id)show(id)});
document.addEventListener('archelaos:favorites-change',()=>{if(active){let b=$('an-dialog-heart'),on=window.ArchelaosFavorites.has('news',active.id);b.setAttribute('aria-pressed',String(on));b.querySelector('span').textContent=on?'♥':'♡'}});
fetch('/news.json?rev=20261101-archive2019',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(Error('HTTP '+r.status))).then(data=>{
 if(!Array.isArray(data.items))throw Error('Bad news index');state.items=data.items.filter(x=>x&&x.id&&x.title&&x.date&&!x.unverified).sort((a,b)=>b.date.localeCompare(a.date));
 $('an-total').textContent=state.items.length+' ΔΗΜΟΣΙΕΥΣΕΙΣ';featured();draw();const id=new URLSearchParams(location.search).get('article');if(id)show(id);
}).catch(e=>{console.error('News loading:',e);$('an-count').textContent='Οι ειδήσεις δεν είναι προσωρινά διαθέσιμες.'});
})();
