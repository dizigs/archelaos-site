/* Original eight-member board and four presidential-era templates, no duplicated HTML. */
(function(){'use strict';
const $=s=>document.querySelector(s);
const node=(tag,cls,txt)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(txt!==undefined)el.textContent=txt;return el};
function member(person){
 const card=node('article','bd-member'),top=node('div','bd-member-top');
 const badge=node('span','bd-member-monogram',person.initials||'Α');
 const ident=node('div');ident.append(node('span','bd-member-role',person.role),node('h3','',person.name));
 top.append(badge,ident);card.append(top);
 if(person.sport){const foot=node('div','bd-member-bottom');foot.append(node('b','','Έφορος: '),document.createTextNode(person.sport));card.append(foot)}
 return card;
}
function period(era){
 const btn=node('button','bd-era');btn.type='button';btn.append(node('span','',era.years),node('strong','',era.title),node('small','',era.subtitle),node('b','','↗'));
 btn.addEventListener('click',()=>window.ArchelaosUI.openDialog({
  title:era.title,subtitle:era.years,contentNode:window.ArchelaosArchive.fragment(era.html),closeLabel:'Κλείσιμο ιστορικού'
 }));return btn;
}
async function init(){
 try{
  const r=await fetch('/rebuild/data/board.json');if(!r.ok)throw Error('Board HTTP '+r.status);const data=await r.json();
  if(data.members?.length!==8||data.eras?.length!==4)throw Error('Unexpected archive');
  const members=document.createDocumentFragment(),eras=document.createDocumentFragment();
  data.members.forEach(p=>members.append(member(p)));data.eras.forEach(p=>eras.append(period(p)));
  $('#bd-members').append(members);$('#bd-eras').append(eras);
  window.ArchelaosMotion?.observe(document);
 }catch(err){console.error('Board:',err);$('#bd-members').textContent='Αδυναμία φόρτωσης της διοίκησης.'}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
