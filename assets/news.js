/* News reader: source-led items, shareable deep links, locally saved favorites. */
(()=>{'use strict';
const $=id=>document.getElementById(id),state={items:[],category:'all',query:''};
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
 const local=/^(?:images|assets)\/[a-zA-Z0-9._/-]+\.(?:webp|jpg|jpeg|png)$/.test(path);
 let original=false;
 try{const u=new URL(path);original=u.protocol==='https:'&&['i0.wp.com','i1.wp.com','i2.wp.com','i3.wp.com','pieriasocial.gr','www.handball.org.gr','www.palmare.gr'].includes(u.hostname)}catch(_){}
 const empty=()=>{
   b.classList.remove('is-emblem');b.classList.add('is-unillustrated');b.replaceChildren();
   const line=document.createElement('span');line.className='an-no-photo';
   line.textContent=t('ΑΡΧΕΙΟ ΑΡΧΕΛΑΟΥ','ARCHELAOS ARCHIVE');
   b.append(line);
 };
 if(!local&&!original){empty();return b}
 const img=document.createElement('img');img.src=original?path:'/'+path;img.alt=x.imageNote||x.title;
 img.loading=cls==='an-feature-media'||cls==='an-cover'?'eager':'lazy';img.decoding='async';
 img.addEventListener('error',()=>{
   if(local&&!img.dataset.archiveFallback){
     img.dataset.archiveFallback='1';img.src='https://raw.githubusercontent.com/dizigs/archelaos-site/main/'+path;
   }else empty();
 });
 b.append(img);return b;
}
function info(x){return {title:x.title,summary:x.summary,href:'news.html?article='+encodeURIComponent(x.id)}}
function heart(x,cls){return window.ArchelaosFavorites?.button('news',x.id,cls,info(x))||document.createElement('span')}
function meta(x){const m=document.createElement('div');m.className='an-meta';for(const value of [label(x),x.sport,fmt(x.date)]){const s=document.createElement('span');s.textContent=value;m.append(s)}return m}
function card(x){
 const el=document.createElement('article');el.className='an-card';
 const m=media(x,'an-card-media'),content=document.createElement('div');content.className='an-card-text';
 const h=document.createElement('h3');h.textContent=x.title;const p=document.createElement('p');p.textContent=x.summary;
 const foot=document.createElement('div');foot.className='an-card-foot';
 const open=document.createElement('button');open.type='button';open.className='an-open';open.textContent=t('Διάβασε περισσότερα','Read more');open.addEventListener('click',()=>show(x.id));
 foot.append(open,heart(x,'an-card-heart'));content.append(meta(x),h,p,foot);el.append(m,content);
 return el;
}
function draw(){
 const q=norm(state.query.trim());const items=state.items.filter(x=>(state.category==='all'||x.category===state.category)&&(!q||(window.ArchelaosSportSearch?window.ArchelaosSportSearch.sportMatch([x.title,x.summary,x.sport,x.source,...(x.body||[])].join(' '),q):norm([x.title,x.summary,x.sport,x.source,...(x.body||[])].join(' ')).includes(q)))).sort((a,b)=>b.date.localeCompare(a.date));
 const frag=document.createDocumentFragment();for(const x of items)frag.append(card(x));
 if(!items.length){const p=document.createElement('p');p.className='an-empty';p.textContent=t('Δεν βρέθηκαν δημοσιεύσεις.','No matching news found.');frag.append(p)}
 $('an-grid').replaceChildren(frag);$('an-count').textContent=t(items.length+' δημοσιεύσεις',items.length+' posts');
}
function featured(){
 const x=state.items.find(i=>i.featured)||state.items[0];if(!x)return;
 const article=document.createElement('article');article.className='an-feature-card';const m=media(x,'an-feature-media');
 const content=document.createElement('div');content.className='an-feature-text';
 const h=document.createElement('h2');h.textContent=x.title;const p=document.createElement('p');p.textContent=x.summary;
 const open=document.createElement('button');open.type='button';open.className='an-primary';open.textContent=t('Δες την είδηση','Read the story');open.addEventListener('click',()=>show(x.id));
 content.append(meta(x),h,p,open);article.append(m,content);$('an-feature').replaceChildren(article);
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
 for(const id of x.personIds||[]){const a=link('hall-of-fame.html?person='+encodeURIComponent(id),'');a.dataset.personId=id;a.dataset.personName='true';links.append(a)}
 if(links.querySelector('[data-person-name]')){
  fetch('/hall-of-fame-people.json',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(Error('Hall data unavailable'))).then(data=>{
   const names=new Map((data.people||[]).map(p=>[p.id,p.name]));
   links.querySelectorAll('[data-person-name]').forEach(a=>{a.textContent=names.get(a.dataset.personId)||t('Βιογραφικό','Biography')});
  }).catch(()=>{links.querySelectorAll('[data-person-name]').forEach(a=>{a.textContent=t('Βιογραφικό','Biography')})});
 }
 source.append(links);detail.append(source);
 const b=$('an-dialog-heart'),favorites=window.ArchelaosFavorites;const saved=favorites?.has('news',x.id);
 b.dataset.favoriteKind='news';b.dataset.favoriteId=x.id;b.querySelector('span').textContent=saved?'♥':'♡';b.setAttribute('aria-pressed',String(!!saved));b.setAttribute('aria-label',saved?'Αφαίρεση από τα αγαπημένα':'Αποθήκευση στα αγαπημένα');
 const dialog=$('an-dialog');if(!dialog.open)dialog.showModal();$('an-close').focus();
 const url=new URL(location.href);url.searchParams.set('article',x.id);history.replaceState(null,'',url)
}
const dialog=$('an-dialog');
$('an-dialog-heart').addEventListener('click',()=>{if(!active||!window.ArchelaosFavorites)return;window.ArchelaosFavorites.toggle('news',active.id,info(active));$('an-dialog-heart').querySelector('span').textContent=window.ArchelaosFavorites.has('news',active.id)?'♥':'♡'});
$('an-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
dialog.addEventListener('close',()=>{active=null;const url=new URL(location.href);url.searchParams.delete('article');history.replaceState(null,'',url);if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true})});
$('an-search').addEventListener('input',e=>{state.query=e.target.value;draw()});
document.querySelectorAll('.an-filter').forEach(b=>b.addEventListener('click',()=>{state.category=b.dataset.category;document.querySelectorAll('.an-filter').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));draw()}));
document.addEventListener('archelaos:favorites-change',()=>{if(active){let b=$('an-dialog-heart'),on=window.ArchelaosFavorites.has('news',active.id);b.setAttribute('aria-pressed',String(on));b.querySelector('span').textContent=on?'♥':'♡'}});
fetch('/news.json?rev=20261101-photo-archive',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(Error('HTTP '+r.status))).then(data=>{
 if(!Array.isArray(data.items))throw Error('Bad news index');state.items=data.items.filter(x=>x&&x.id&&x.title&&x.date&&!x.unverified).sort((a,b)=>b.date.localeCompare(a.date));
 $('an-total').textContent=state.items.length+' ΔΗΜΟΣΙΕΥΣΕΙΣ';featured();draw();const id=new URLSearchParams(location.search).get('article');if(id)show(id);
}).catch(e=>{console.error('News loading:',e);$('an-count').textContent='Οι ειδήσεις δεν είναι προσωρινά διαθέσιμες.'});
})();
