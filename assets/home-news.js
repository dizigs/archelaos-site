/* Recent verified news on the homepage; reads the same dataset as News & Activity. */
(()=>{'use strict';if(document.getElementById('archelaos-home-news'))return;
const date=d=>new Intl.DateTimeFormat('el-GR',{day:'numeric',month:'short',year:'numeric'}).format(new Date(d+'T12:00:00'));
const section=document.createElement('section');section.className='ahn-section';section.id='archelaos-home-news';section.setAttribute('aria-labelledby','ahn-heading');
section.innerHTML='<div class="ahn-container"><div class="ahn-heading"><div><p class="ahn-kicker">Η ΖΩΗ ΤΟΥ ΣΥΛΛΟΓΟΥ</p><h2 id="ahn-heading">Τελευταία από τον Αρχέλαο</h2><p class="ahn-subtitle">Η ιστορία συνεχίζεται, κάθε μέρα.</p></div><a class="ahn-all" href="/news.html">Όλα τα νέα <span aria-hidden="true"></span></a></div><div class="ahn-grid" id="ahn-grid"></div></div>';
const anchor=document.getElementById('about')||document.getElementById('join-history');const footer=document.querySelector('footer:not(#arch-global-footer)')||document.getElementById('arch-global-footer');if(anchor)anchor.before(section);else if(footer)footer.before(section);else document.body.append(section);
const grid=section.querySelector('#ahn-grid');
fetch('/news.json?rev=20261101-photo-archive',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('No news');return r.json()}).then(data=>{
 const recent=(data.items||[]).filter(x=>x&&!x.unverified&&x.id&&x.title&&x.date).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,3);
 if(!recent.length){section.remove();return}
 const frag=document.createDocumentFragment();
 for(const x of recent){
  const card=document.createElement('article');card.className='ahn-card';
  const a=document.createElement('a');a.href='/news.html?article='+encodeURIComponent(x.id);a.className='ahn-card-link';
  const media=document.createElement('div');media.className='ahn-media'+(/crest/.test(x.image||'')?' ahn-emblem':'');
  const local=!!x.image&&/^(?:images|assets)\/[a-zA-Z0-9._/-]+\.(?:webp|jpg|jpeg|png)$/.test(x.image);
  let external=false;try{const u=new URL(x.image);external=u.protocol==='https:'&&['i0.wp.com','i1.wp.com','i2.wp.com','i3.wp.com','pieriasocial.gr','www.handball.org.gr'].includes(u.hostname)}catch(_){}
  if(local||external){
   const image=document.createElement('img');image.src=external?x.image:'/'+x.image;image.alt=x.imageNote||x.sport||'';image.loading='lazy';image.decoding='async';
   image.addEventListener('error',()=>{
    if(local&&!image.dataset.archiveFallback){image.dataset.archiveFallback='1';image.src='https://raw.githubusercontent.com/dizigs/archelaos-site/main/'+x.image}
    else{image.remove();media.classList.add('ahn-unillustrated');media.textContent='ΑΡΧΕΙΟ ΑΡΧΕΛΑΟΥ'}
   });media.append(image);
  }else{media.classList.add('ahn-unillustrated');media.textContent='ΑΡΧΕΙΟ ΑΡΧΕΛΑΟΥ'}
  const body=document.createElement('div');body.className='ahn-content';
  const meta=document.createElement('span');meta.className='ahn-meta';meta.textContent=[x.sport,date(x.date)].filter(Boolean).join(' · ');
  const title=document.createElement('h3');title.textContent=x.title;const desc=document.createElement('p');desc.textContent=x.summary||'';
  const arrow=document.createElement('span');arrow.className='ahn-arrow';arrow.textContent='Διαβάστε την είδηση';
  body.append(meta,title,desc,arrow);a.append(media,body);card.append(a);frag.append(card)
 }grid.replaceChildren(frag);
}).catch(()=>{section.remove()});
})();