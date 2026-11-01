/* Local-only contribution guide. No fetch, persistence, API or form submission. */
(function(){
'use strict';
let verificationRequest=null;
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
 return name.length>=2&&name.length<=120&&!/[\\r\\n]/.test(name);
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
 for(const id of [...fields,'sender-name','credit-name'])$(id).addEventListener('input',()=>{refresh();$('guide-status').textContent='';});
 $('credit-consent').addEventListener('change',updateCredit);
 $('guide-email').addEventListener('click',event=>{if(!validateAndFocus())event.preventDefault();});
 updateCredit();
 $('guide-copy').addEventListener('click',copy);
 refresh();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
