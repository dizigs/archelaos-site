/* Reads sports chapters from the original backup's museum.json; no second dataset. */
(()=>{'use strict';
async function init(){
 // Illustrated cards live on this page, not on the homepage.
 const keys=['handball','track','archery','shooting','gymnastics','volleyball','wrestling','swimming'];
 document.querySelectorAll('.new-sport-photo').forEach((photo,index)=>{
  const img=photo.querySelector('img');
  if(img){const fallback=()=>{photo.classList.add('new-photo-missing');photo.dataset.fallbackLabel=img.alt||'Γ.Α.Σ. Αρχέλαος';img.hidden=true};
   img.addEventListener('error',fallback,{once:true});if(img.complete&&img.naturalWidth===0)fallback();}
  if(keys[index]&&window.ArchelaosFavorites){photo.id='sport-photo-'+keys[index];photo.append(window.ArchelaosFavorites.button('photo','sport-'+keys[index]));}
 });
 const cards=[...document.querySelectorAll('[data-dp-open]')];
 const photos={handball:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRaOFUCWatPwP-EycFiHffCCMk_Kz1ScNWPtg7znhR3mQ&s=10',track:'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=1200&q=80',archery:'/images/archery-outdoor-youth.webp',shooting:'https://0501.nccdn.net/4_2/000/000/048/0a6/ISSF.jpg',volleyball:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQIex8YMFGm7cLdQvLNvrQ4fdkg45xPl68ULVxGERNXOw&s=10',gymnastics:'/images/enorgani-slideshow-edafos.jpg',wrestling:'/images/wrestling-action.webp',swimming:'https://images.unsplash.com/photo-1530549387789-4c1017266635?auto=format&fit=crop&w=1200&q=80',basketball:'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1200&q=80'};
 const fieldNames=['Ακαδημίες','Προπονήσεις','Εγκαταστάσεις','Προπονητές'];
 // Verified details only for the archery department; all other profiles remain unchanged.
 const archeryFields=[
  {text:'Δευτέρα–Παρασκευή, 18:00–20:00'},
  {text:'Δευτέρα, Τετάρτη, Παρασκευή, 19:00–22:00'},
  {text:'Κλειστό γυμναστήριο τοξοβολίας · Τέρμα Πλάτωνος, Κατερίνη',href:'https://maps.app.goo.gl/jQ4cV5SKJV4hAJqH7',external:true,title:'Προβολή εγκατάστασης στον χάρτη'},
  {text:'Ιωάννης Χαρίσης',href:'/hall-of-fame.html?person=arch-44ef21dfb9b7',title:'Προβολή βιογραφικού στο Hall of Fame'}
 ];
 function buildProfile(card,record){
  const key=card.dataset.dpOpen,root=document.createElement('div');root.className='dp-profile';
  if(photos[key]){const hero=document.createElement('div');hero.className='dp-profile-photo';const img=document.createElement('img');img.src=photos[key];img.alt='Φωτογραφία τμήματος: '+(record?.title||card.querySelector('.dp-title')?.textContent||'');img.loading='lazy';img.addEventListener('error',()=>{hero.classList.add('dp-profile-photo-fallback');img.remove()},{once:true});hero.append(img);root.append(hero)}
  const intro=document.createElement('div');intro.className='dp-profile-intro';const eyebrow=document.createElement('p');eyebrow.className='dp-profile-eyebrow';eyebrow.textContent='ΤΟ ΤΜΗΜΑ ΣΗΜΕΡΑ';const description=document.createElement('p');description.textContent=key==='archery'?'Το τμήμα τοξοβολίας λειτουργεί με το παρακάτω πρόγραμμα προπονήσεων.':'Οι πληροφορίες για τη λειτουργία του τμήματος θα ενημερωθούν σύντομα, μόλις επιβεβαιωθούν.';intro.append(eyebrow,description);root.append(intro);
  if(key!=='inactive-depts'){const grid=document.createElement('div');grid.className='dp-profile-info';for(const [index,label] of fieldNames.entries()){const box=document.createElement('div');box.className='dp-profile-field';const name=document.createElement('strong');name.textContent=label;const detail=key==='archery'?archeryFields[index]:null;const value=document.createElement(detail?.href?'a':'span');value.textContent=detail?.text||'Θα ενημερωθεί σύντομα';if(detail?.href){value.className='dp-profile-value-link';value.href=detail.href;if(detail.title)value.title=detail.title;if(detail.external){value.target='_blank';value.rel='noopener noreferrer'}}box.append(name,value);grid.append(box)}root.append(grid)}
  const actions=document.createElement('div');actions.className='dp-profile-actions';
  if(record){const history=document.createElement('button');history.type='button';history.className='dp-profile-history';history.textContent='Η ιστορία του τμήματος';history.addEventListener('click',()=>window.ArchelaosUI.openDialog({title:record.title,subtitle:record.period||'',contentNode:window.ArchelaosArchive.fragment(record.html),closeLabel:'Κλείσιμο ιστορικού'}));actions.append(history)}
  if(key!=='inactive-depts'){const official=document.createElement(key==='archery'?'a':'span');official.className='dp-profile-official';if(key==='archery'){official.href='https://archery.archelaos.club';official.target='_blank';official.rel='noopener noreferrer';official.textContent='Επίσημη σελίδα · archery.archelaos.club'}else official.textContent='Επίσημη σελίδα τμήματος · Θα προστεθεί σύντομα';actions.append(official)}
  root.append(actions);return root;
 }
 try{
  const r=await fetch('/rebuild/data/museum.json');if(!r.ok)throw Error('HTTP '+r.status);
  const data=await r.json();const byId=new Map((data.articles||[]).map(a=>[a.id,a]));
  for(const card of cards){const record=byId.get(card.dataset.dpOpen);card.addEventListener('click',()=>window.ArchelaosUI.openDialog({title:record?.title||card.querySelector('.dp-title')?.textContent||'Αθλητικό τμήμα',subtitle:'Γ.Α.Σ. ΑΡΧΕΛΑΟΣ · ΑΘΛΗΤΙΚΑ ΤΜΗΜΑΤΑ',contentNode:buildProfile(card,record),closeLabel:'Κλείσιμο παρουσίασης'}))}
 }catch(err){console.error('Department profiles:',err);for(const card of cards){card.addEventListener('click',()=>window.ArchelaosUI.openDialog({title:card.querySelector('.dp-title')?.textContent||'Αθλητικό τμήμα',contentNode:buildProfile(card,null),closeLabel:'Κλείσιμο παρουσίασης'}))}}

  const deep=location.hash.match(/^#sport-(.+)$/)?.[1];
  if(deep){const card=document.getElementById('sport-'+deep);if(card){card.scrollIntoView({block:'center'});card.focus({preventScroll:true});card.click()}}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
