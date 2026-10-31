/* A single native-dialog system for biographies and future archival stories. */
(function(){'use strict';
function card(data){
 const el=document.createElement('a');el.className='arch-card arch-card--'+(data.tone==='green'?'green':'cream');
 if(['small','large','wide'].includes(data.size))el.classList.add('arch-card--'+data.size);
 el.href=window.ArchelaosRoutes?.toStage(data.href||'#')||data.href||'#';
 const title=document.createElement('span');title.className='arch-card-title';title.textContent=data.title||'';
 if(data.marker){
  const date=document.createElement('span');date.className='arch-card-date';date.textContent=data.marker;
  const ghost=document.createElement('span');ghost.className='arch-card-watermark';ghost.textContent=data.marker;ghost.setAttribute('aria-hidden','true');el.append(date,ghost);
 }
 const arrow=document.createElement('span');arrow.className='arch-card-arrow';arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');el.append(title,arrow);return el;
}
let dialog,lastFocus;
function create(){
 if(dialog)return dialog;
 dialog=document.createElement('dialog');dialog.className='arch-dialog';dialog.setAttribute('aria-labelledby','arch-dialog-title');
 const panel=document.createElement('div');panel.className='arch-dialog-panel';
 const header=document.createElement('div');header.className='arch-dialog-head';
 const titles=document.createElement('div');titles.className='arch-dialog-titles';
 const role=document.createElement('div');role.className='arch-dialog-role';
 const h=document.createElement('h2');h.id='arch-dialog-title';titles.append(role,h);
 const close=document.createElement('button');close.className='arch-close';close.type='button';close.textContent='×';close.setAttribute('aria-label','Κλείσιμο παραθύρου');
 const favoriteSlot=document.createElement('span');favoriteSlot.className='arch-dialog-favorite-slot';
 header.append(titles,favoriteSlot,close);
 const body=document.createElement('div');body.className='arch-dialog-body';
 panel.append(header,body);dialog.append(panel);document.body.append(dialog);
 // Escape fires 'cancel' before 'close'; unlock immediately so page never remains frozen.
 dialog.addEventListener('cancel',()=>document.body.classList.remove('arch-dialog-open'));
 close.addEventListener('click',()=>{
  document.body.classList.remove('arch-dialog-open');
  dialog.close();
 });
 dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
 dialog.addEventListener('close',()=>{
  document.body.classList.remove('arch-dialog-open');
  if(lastFocus?.isConnected)lastFocus.focus();lastFocus=null;
 });return dialog;
}
function openDialog(data){
 const dlg=create();
 if(dlg.open)dlg.close();
 const role=dlg.querySelector('.arch-dialog-role');role.textContent=data.subtitle||'';role.hidden=!data.subtitle;
 dlg.querySelector('h2').textContent=data.title||'';
 const body=dlg.querySelector('.arch-dialog-body');body.replaceChildren();
 const lines=Array.isArray(data.paragraphs)?data.paragraphs:[data.body||''];
 if(data.contentNode)body.append(data.contentNode);
 else for(const line of lines){
  if(!String(line||'').trim())continue;
  const p=document.createElement('p');p.textContent=line;body.append(p);
 }
 const links=(data.sources||[]).filter(ref=>{
  try{return ['http:','https:'].includes(new URL(ref.url).protocol)}catch{return false}
 });
 if(links.length){
  const list=document.createElement('div');list.className='arch-dialog-sources';
  const label=document.createElement('strong');label.textContent=data.sourcesLabel||'Πηγές';list.append(label);
  for(const src of links){const a=document.createElement('a');a.href=src.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=src.label||src.url;list.append(a)}
  body.append(list);
 }
 const slot=dlg.querySelector('.arch-dialog-favorite-slot');slot.replaceChildren();
 if(data.favorite&&window.ArchelaosFavorites)
  slot.append(window.ArchelaosFavorites.button(data.favorite.type,data.favorite.id,'arch-dialog-favorite'));
 dlg.querySelector('.arch-close').setAttribute('aria-label',data.closeLabel||'Κλείσιμο παραθύρου');
 lastFocus=document.activeElement;dlg.showModal();document.body.classList.add('arch-dialog-open');dlg.querySelector('.arch-close').focus();
}
window.ArchelaosUI=Object.freeze({card,openDialog});
})();
