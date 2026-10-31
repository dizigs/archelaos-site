/* Safe public requests for DOCUMENTS; never publish research claims or user submissions. */
(function(){'use strict';
const $=s=>document.querySelector(s);
let records=[];
function card(item){
 const article=document.createElement('article');article.className='av-verify-card';
 const tag=document.createElement('span');tag.className='av-verify-tag';
 tag.textContent='ΠΡΟΣ ΤΕΚΜΗΡΙΩΣΗ · '+item.sport_label;
 const title=document.createElement('h3');title.textContent=item.title;
 const desc=document.createElement('p');desc.textContent=item.prompt;
 const need=document.createElement('p');need.className='av-verify-evidence';need.textContent='Χρειαζόμαστε: '+item.evidence_needed;
 const link=document.createElement('a');
 link.href='/contribute.html?verification='+encodeURIComponent(item.id)+'#ac-guide';
 if(location.pathname.startsWith('/rebuild/'))link.href='/rebuild/contribute.html?verification='+encodeURIComponent(item.id)+'#ac-guide';
 link.textContent='Έχω τεκμήριο · Συνεισφέρω ↗';
 article.append(tag,title,desc,need,link);return article;
}
function render(){
 const filter=$('#av-verify-filter').value,root=$('#av-verify-grid');
 const shown=records.filter(x=>filter==='all'||x.sport===filter);
 root.replaceChildren(...shown.map(card));
 $('#av-verify-status').textContent=shown.length+' αιτήματα αναζήτησης τεκμηρίων · Δεν περιλαμβάνονται ατεκμηρίωτα ιστορικά αποτελέσματα.';
}
async function init(){
 try{
  const path=location.pathname.startsWith('/rebuild/')?'/rebuild/data/verification-requests.json':'/assets/site/data/verification-requests.json';
  const response=await fetch(path,{cache:'no-cache'});
  if(!response.ok)throw Error('Archive request list HTTP '+response.status);
  const data=await response.json();
  if(data?.schema_version!==1||!Array.isArray(data.requests))throw Error('Invalid evidence requests');
  records=data.requests.filter(x=>x.status==='awaiting_evidence'&&x.public_safe===true&&x.kind==='neutral_document_request');
  const seen=new Set();
  for(const x of records)if(seen.has(x.id))throw Error('Duplicate verification request');else seen.add(x.id);
  const labels=new Map(records.map(x=>[x.sport,x.sport_label]));
  for(const [id,label] of labels){
   const opt=document.createElement('option');opt.value=id;opt.textContent=label;
   $('#av-verify-filter').append(opt);
  }
  $('#av-verify-filter').addEventListener('change',render);render();
 }catch(err){
  console.warn('Evidence request list unavailable',err);
  $('#av-verify-grid').replaceChildren();
  $('#av-verify-status').textContent='Η λίστα αιτημάτων δεν φορτώθηκε. Μπορείτε να χρησιμοποιήσετε απευθείας την παρακάτω φόρμα συνεισφοράς.';
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
