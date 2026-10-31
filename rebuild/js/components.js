/* Shared editorial cards and native-dialog popup, intentionally independent of the shell. */
(function(){
'use strict';
function card(data){
 const el=document.createElement('a');el.className='arch-card arch-card--'+(data.tone==='green'?'green':'cream');
 if(['small','large','wide'].includes(data.size))el.classList.add('arch-card--'+data.size);
 el.href=data.href||'#';const title=document.createElement('span');title.className='arch-card-title';title.textContent=data.title||'';
 if(data.marker){const date=document.createElement('span');date.className='arch-card-date';date.textContent=data.marker;el.append(date);
   const ghost=document.createElement('span');ghost.className='arch-card-watermark';ghost.textContent=data.marker;ghost.setAttribute('aria-hidden','true');el.append(ghost)}
 const arrow=document.createElement('span');arrow.className='arch-card-arrow';arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');el.append(title,arrow);return el;
}
let dialog=null,lastFocus=null;
function ensureDialog(){
 if(dialog)return dialog;
 dialog=document.createElement('dialog');dialog.className='arch-dialog';dialog.setAttribute('aria-labelledby','arch-dialog-title');
 const panel=document.createElement('div');panel.className='arch-dialog-panel';
 const head=document.createElement('div');head.className='arch-dialog-head';
 const title=document.createElement('h2');title.id='arch-dialog-title';
 const close=document.createElement('button');close.className='arch-close';close.type='button';close.textContent='×';close.setAttribute('aria-label','Κλείσιμο παραθύρου');
 head.append(title,close);const body=document.createElement('div');body.className='arch-dialog-body';panel.append(head,body);dialog.append(panel);
 document.body.append(dialog);
 close.addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
 dialog.addEventListener('close',()=>{document.body.classList.remove('arch-dialog-open');lastFocus?.focus();lastFocus=null});
 return dialog;
}
function openDialog(data){
 const d=ensureDialog();d.querySelector('h2').textContent=data.title||'';
 const body=d.querySelector('.arch-dialog-body');body.replaceChildren();
 const lines=Array.isArray(data.paragraphs)?data.paragraphs:[data.body||''];
 for(const line of lines){const p=document.createElement('p');p.textContent=line;body.append(p)}
 lastFocus=document.activeElement;d.showModal();document.body.classList.add('arch-dialog-open');
 d.querySelector('.arch-close').focus();
}
window.ArchelaosUI=Object.freeze({card,openDialog});
})();
