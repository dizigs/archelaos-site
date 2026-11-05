/* Guided contribution: private draft stays local until explicit secure send or manual email. */
(function(){
'use strict';
let verificationRequest=null;
let turnstileLoader,turnstileApi=null,widgetId=null,challengeReady;
function loadTurnstile(){
 if(window.turnstile)return Promise.resolve(window.turnstile);
 if(!turnstileLoader)turnstileLoader=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async=true;
  script.onload=()=>window.turnstile?resolve(window.turnstile):reject(new Error('Turnstile unavailable'));
  script.onerror=()=>reject(new Error('Turnstile failed to load'));
  document.head.appendChild(script);
 });
 return turnstileLoader;
}
async function initChallenge(){
 const host=$('turnstile');
 try{
  const response=await fetch('/api/contact',{cache:'no-store'});
  const capability=response.ok?await response.json():null;
  if(!capability?.ready||!capability?.turnstileSiteKey){
   host.textContent='Η απευθείας αποστολή δεν είναι διαθέσιμη. Μπορείτε να επισυνάψετε το αρχείο σε email ή να δώσετε σύνδεσμο Drive.';
   return false;
  }
  turnstileApi=await loadTurnstile();
  if(!host.isConnected)return false;
  widgetId=turnstileApi.render(host,{
   sitekey:capability.turnstileSiteKey,
   action:'contact',
   theme:'auto',
   'expired-callback':()=>{$('guide-status').textContent='Ο έλεγχος ασφαλείας έληξε. Ολοκληρώστε τον ξανά.';}
  });
  return widgetId!==undefined;
 }catch{
  host.textContent='Η απευθείας αποστολή δεν είναι διαθέσιμη. Χρησιμοποιήστε email ή σύνδεσμο Drive.';
  return false;
 }
}
const fields=['type','sport','date','persons','details','source','rights'];
const params=new URLSearchParams(location.search);
const linkedKind=params.get('kind')||'',linkedId=params.get('id')||'';
const linkedTitle=(params.get('title')||'').trim().slice(0,150);
const validReference=/^[a-z0-9-]{1,100}$/.test(linkedId)&&['person','moment','story','exhibit','photo','event'].includes(linkedKind);
const linkedPaths={
 person:'/hall-of-fame.html?person='+encodeURIComponent(linkedId),
 event:'/hall-of-fame.html?event='+encodeURIComponent(linkedId),
 moment:'/70-stigmes.html#moment-'+encodeURIComponent(linkedId),
 story:'/stories.html#story-'+encodeURIComponent(linkedId),
 exhibit:'/history.html#archive-'+encodeURIComponent(linkedId),
 photo:'/index.html'
};
const reference=validReference&&linkedTitle?{title:linkedTitle,url:'https://archelaos.club'+linkedPaths[linkedKind]}:null;
const $=id=>document.getElementById('ac-'+id);
const clean=value=>String(value||'').trim().replace(/\r\n?/g,'\n');
const credit=()=>{
 const requested=$('credit-consent').checked;
 const sender=clean($('sender-name').value);
 const preferred=clean($('credit-name').value);
 return {sender,requested,displayName:requested?(preferred||sender):''};
};
function validSender(){
 const name=credit().sender;
 return name.length>=2&&name.length<=120&&!/[\r\n]/.test(name);
}
function validateAndFocus(){
 if(validSender())return true;
 $('guide-status').textContent='Συμπληρώστε πρώτα το ονοματεπώνυμό σας για την εσωτερική καταγραφή.';
 $('sender-name').focus();return false;
}
function updateCredit(){
 $('credit-name-wrap').hidden=!$('credit-consent').checked;
 if(!$('credit-consent').checked)$('credit-name').value='';
 refresh();
}

function draft(){
 const values=Object.fromEntries(fields.map(key=>[key,clean($(key)?.value)]));
 const c=credit();
 const entries=[
  ['Ονοματεπώνυμο αποστολέα (εσωτερική καταγραφή)',c.sender],
  ['Email επικοινωνίας',clean($('sender-email').value)],
  ['Τηλέφωνο επικοινωνίας',clean($('sender-phone').value)],
  ...(clean($('archive-link').value)?[['Σύνδεσμος Google Drive',clean($('archive-link').value)]]:[]),
  ['Δημόσια αναφορά ονόματος',c.requested?'ΝΑΙ — επιτρέπω την αναφορά εφόσον εγκριθεί το υλικό':'ΟΧΙ — χωρίς δημόσια ονομαστική αναφορά'],
  ...(c.requested?[['Όνομα δημόσιας αναφοράς',c.displayName]]:[]),
  ['Τύπος υλικού',values.type],
  ['Άθλημα / τμήμα',values.sport||'Δεν γνωρίζω'],
  ['Χρονιά / περίοδος',values.date],
  ['Πρόσωπα / ομάδα / διοργάνωση',values.persons],
  ['Προέλευση / πηγή',values.source],
  ['Δυνατότητα κοινοποίησης',values.rights],
  ['Περιγραφή',values.details],
  ...(verificationRequest?[['Κωδικός αιτήματος τεκμηρίωσης',verificationRequest.id],['Θέμα αιτήματος',verificationRequest.title]]:[]),
  ...(reference?[['Σχετικό στοιχείο αρχείου',reference.title],['Σύνδεσμος εγγραφής',reference.url]]:[])
 ];
 const body='Καλησπέρα,\n\nΘα ήθελα να συνεισφέρω στο ιστορικό αρχείο του Γ.Α.Σ. Αρχέλαος.\n\n'
   +entries.map(([label,value])=>label+': '+(value||'—')).join('\n\n')
   +'\n\nΘα ελέγξω τα στοιχεία και τυχόν άδειες πριν από οποιαδήποτε δημοσίευση.\n';
 const subject='Συνεισφορά αρχείου Αρχέλαου · '+values.type;
 return {body,subject};
}
function refresh(){
 const {body,subject}=draft();
 const mail='mailto:info@archelaos.club?subject='+encodeURIComponent(subject)
       +'&body='+encodeURIComponent(body);
 const link=$('guide-email');
 link.href=mail;
 // Deep links may exceed limits for some email clients; copying remains available.
 link.title=mail.length>5000?'Αν το email δεν ανοίξει σωστά, χρησιμοποιήστε την Αντιγραφή περιγραφής.':'Ανοίγει στο δικό σας πρόγραμμα email';
}
async function copy(){
 if(!validateAndFocus())return;
 const content=draft().body,status=$('guide-status');
 if(!navigator.clipboard?.writeText){
  status.textContent='Η αντιγραφή δεν υποστηρίζεται εδώ. Επιλέξτε το άνοιγμα email.';
  return;
 }
 try{
  await navigator.clipboard.writeText(content);
  status.textContent='Η περιγραφή αντιγράφηκε. Μπορείτε να την επικολλήσετε στο email σας.';
 }catch{
  status.textContent='Η αντιγραφή δεν επιτράπηκε από τον browser. Χρησιμοποιήστε το άνοιγμα email.';
 }
}

function validateArchiveLink(){
 const raw=clean($('archive-link').value);
 if(!raw)return true;
 try{
  const url=new URL(raw);
  return url.protocol==='https:'&&['drive.google.com','docs.google.com'].includes(url.hostname)&&
    !url.username&&!url.password&&raw.length<=2048;
 }catch{return false}
}
function validateTransfer(){
 const status=$('guide-status');
 if(!validateAndFocus())return false;
 const email=$('sender-email');
 if(!email.value.trim()||!email.checkValidity()){
  status.textContent='Συμπληρώστε έγκυρο email επικοινωνίας.';
  email.focus();return false;
 }
 if(!$('private-consent').checked){
  status.textContent='Για την αποστολή χρειάζεται η συγκατάθεσή σας για επικοινωνία σχετικά με το υλικό.';
  $('private-consent').focus();return false;
 }
 if(!validateArchiveLink()){
  status.textContent='Ο σύνδεσμος πρέπει να είναι έγκυρο HTTPS URL από το Google Drive ή Google Docs.';
  $('archive-link').focus();return false;
 }
 const files=Array.from($('attachments').files||[]);
 if(files.length>5||files.some(file=>file.size>10*1024*1024)||
    files.reduce((sum,file)=>sum+file.size,0)>15*1024*1024){
  status.textContent='Επιλέξτε έως 5 αρχεία, μέχρι 10 MB το καθένα και 15 MB συνολικά.';
  $('attachments').focus();return false;
 }
 const message=draft().body;
 if(message.length>5000){
  status.textContent='Η περιγραφή είναι μεγάλη. Συντομεύστε την ώστε να είναι έως 5.000 χαρακτήρες.';
  $('details').focus();return false;
 }
 return true;
}
async function sendSecure(){
 if(!validateTransfer())return;
 const status=$('guide-status'),submit=$('guide-send');
 const files=Array.from($('attachments').files||[]);
 submit.disabled=true;
 try{
  status.textContent='Έλεγχος διαθέσιμης ασφαλούς αποστολής…';
  if(!await challengeReady){
   status.textContent=files.length
    ?'Η ασφαλής αποστολή αρχείων δεν είναι διαθέσιμη. Δεν στάλθηκε τίποτα. Χρησιμοποιήστε το email και επισυνάψτε τα αρχεία από την εφαρμογή σας ή προσθέστε σύνδεσμο Drive.'
    :'Η ασφαλής αποστολή δεν είναι διαθέσιμη. Δεν στάλθηκε τίποτα. Μπορείτε να χρησιμοποιήσετε το προσυμπληρωμένο email.';
   return;
  }
  const challengeToken=turnstileApi?.getResponse(widgetId);
  if(!challengeToken){
   status.textContent='Ολοκληρώστε πρώτα τον έλεγχο ασφαλείας και δοκιμάστε ξανά.';
   return;
  }
  const payload=new FormData();
  payload.set('name',credit().sender);
  payload.set('email',clean($('sender-email').value));
  payload.set('phone',clean($('sender-phone').value));
  payload.set('topic','archive');
  payload.set('message',draft().body);
  payload.set('archiveLink',clean($('archive-link').value));
  payload.set('consent','true');
  payload.set('cf-turnstile-response',challengeToken);
  payload.set('publicNameConsent',credit().requested?'true':'false');
  payload.set('publicCreditName',credit().displayName);
  for(const file of files)payload.append('attachments',file,file.name);
  status.textContent='Αποστολή προς το ιστορικό αρχείο…';
  try{
   const response=await fetch('/api/contact',{method:'POST',body:payload});
   if(response.ok){
    status.textContent='Η συνεισφορά σας στάλθηκε επιτυχώς στο ιστορικό αρχείο. Ευχαριστούμε!';
    $('attachments').value='';
    turnstileApi?.reset(widgetId);
    return;
   }
   if(response.status===403){
    status.textContent='Ο έλεγχος ασφαλείας έληξε ή απέτυχε. Ολοκληρώστε τον και δοκιμάστε ξανά.';
    turnstileApi?.reset(widgetId);
    return;
   }
   turnstileApi?.reset(widgetId);
   status.textContent=response.status===413
    ?'Η αποστολή δεν έγινε: τα αρχεία υπερβαίνουν το επιτρεπόμενο μέγεθος. Δοκιμάστε μικρότερα αρχεία ή σύνδεσμο Drive.'
    :response.status>=400&&response.status<500
     ?'Η αποστολή δεν έγινε. Ελέγξτε τα στοιχεία, τα συνημμένα και τον σύνδεσμο Drive.'
     :'Ο διακομιστής δεν ολοκλήρωσε την αποστολή. Δεν υπάρχει επιβεβαίωση παραλαβής· χρησιμοποιήστε email.';
  }catch(_){
   turnstileApi?.reset(widgetId);
   status.textContent='Δεν επιβεβαιώθηκε η αποστολή λόγω προβλήματος σύνδεσης. Ελέγξτε πριν επαναλάβετε, για να αποφύγετε διπλή αποστολή.';
  }
 }finally{submit.disabled=false}
}

async function fillVerificationContext(){
 const id=new URLSearchParams(location.search).get('verification');
 if(!id||!/^request-[a-z-]{8,100}$/.test(id))return;
 try{
  const root=location.pathname.startsWith('/rebuild/')?'/rebuild/data/verification-requests.json':'/assets/site/data/verification-requests.json';
  const response=await fetch(root,{cache:'no-cache'});
  if(!response.ok)return;
  const data=await response.json();
  const entry=data.requests?.find(x=>x.id===id&&x.public_safe===true&&x.status==='awaiting_evidence');
  if(!entry)return;
  verificationRequest={id:entry.id,title:entry.title};
  $('guide-context').hidden=false;
  $('guide-context').textContent='Αίτημα προς τεκμηρίωση: '+entry.title;
  const option=[...$('sport').options].find(x=>x.textContent===entry.sport_label);
  if(option)$('sport').value=option.value;
  $('type').value='Ιστορική μαρτυρία';
  $('source').placeholder='Αναφέρετε τη σχετική πηγή ή το τεκμήριο';
  $('guide-status').textContent='';
  refresh();
 }catch(error){console.warn('Cannot prefill evidence request',error)}
}
function init(){
 void fillVerificationContext();
 if(reference){
  const context=$('guide-context');context.hidden=false;
  context.textContent='Σχετικά με: '+reference.title+'. Μπορείτε να προτείνετε διόρθωση ή πρόσθετο τεκμήριο.';
  if(linkedKind==='person')$('type').value='Βιογραφικό στοιχείο';
  if(linkedKind==='photo')$('type').value='Φωτογραφία';
  if(linkedKind==='moment'||linkedKind==='story'||linkedKind==='exhibit'||linkedKind==='event')$('type').value='Ιστορική μαρτυρία';
 }
 for(const id of [...fields,'sender-name','sender-email','sender-phone','archive-link','attachments','credit-name'])$(id).addEventListener('input',()=>{refresh();$('guide-status').textContent='';});
 $('credit-consent').addEventListener('change',updateCredit);
 $('guide-email').addEventListener('click',event=>{if(!validateAndFocus())event.preventDefault();});
 updateCredit();
 $('guide-copy').addEventListener('click',copy);
 $('guide-send').addEventListener('click',sendSecure);
 challengeReady=initChallenge();
 refresh();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
