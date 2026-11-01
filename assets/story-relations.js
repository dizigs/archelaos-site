/* Shared cross-navigation: Stories ↔ People. */
(function(){
'use strict';
const onProfile=location.pathname.startsWith('/people/');
if(!onProfile)return;
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const label=(el,en)=>'<span data-el="'+esc(el)+'" data-en="'+esc(en)+'">'+esc(document.documentElement.lang==='en'?en:el)+'</span>';
fetch('/assets/story-relations.json').then(r=>{if(!r.ok)throw new Error('Story relations unavailable');return r.json();}).then(data=>{
 if(!Array.isArray(data.stories))return;
 const storyLinks=items=>items.map(s=>'<a class="asr-link" href="/stories.html?story='+s.number+'">'+esc(s.title)+'</a>').join('');
 if(onProfile){
  const id=location.pathname.split('/').pop().replace(/\.html$/,'');
  const matches=data.stories.filter(s=>s.people.includes(id));
  if(matches.length&&!document.querySelector('.asr-related')){
   const div=document.createElement('section');div.className='asr-related';
   div.innerHTML='<h2>'+label('Σχετικές ιστορίες','Related Stories')+'</h2><div class="asr-items">'+storyLinks(matches)+'</div>';
   const target=document.querySelector('.profile-actions');
   if(target)target.before(div);
  }
 }
 document.addEventListener('archelaos:language-change',()=>{
  document.querySelectorAll('.asr-related [data-el][data-en]').forEach(el=>el.textContent=el.getAttribute(document.documentElement.lang==='en'?'data-en':'data-el'));
 });
}).catch(err=>console.warn('Story cross-navigation:',err.message));
})();
