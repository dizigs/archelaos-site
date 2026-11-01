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
 try{
  const r=await fetch('/rebuild/data/museum.json');if(!r.ok)throw Error('HTTP '+r.status);
  const data=await r.json();const byId=new Map(data.articles.map(a=>[a.id,a]));
  for(const card of cards){
   const record=byId.get(card.dataset.dpOpen);
   if(!record){card.disabled=true;card.title='Δεν βρέθηκε ιστορικό κείμενο';continue}
   card.addEventListener('click',()=>window.ArchelaosUI.openDialog({
    title:record.title,subtitle:record.period||'',
    contentNode:window.ArchelaosArchive.fragment(record.html),
    closeLabel:'Κλείσιμο ιστορικού'
   }));
  }
  const deep=location.hash.match(/^#sport-(.+)$/)?.[1];
  if(deep){const card=document.getElementById('sport-'+deep);if(card){card.scrollIntoView({block:'center'});card.focus({preventScroll:true})}}
 }catch(err){console.error('Department archive:',err);cards.forEach(c=>{c.disabled=true})}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
