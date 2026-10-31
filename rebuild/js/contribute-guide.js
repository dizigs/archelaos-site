/* Local-only contribution guide. No fetch, persistence, API or form submission. */
(function(){
'use strict';
const fields=['type','sport','date','persons','details','source','rights'];
const $=id=>document.getElementById('ac-'+id);
const clean=value=>String(value||'').trim().replace(/\r\n?/g,'\n');
function draft(){
 const values=Object.fromEntries(fields.map(key=>[key,clean($(key)?.value)]));
 const entries=[
  ['Τύπος υλικού',values.type],
  ['Άθλημα / τμήμα',values.sport||'Δεν γνωρίζω'],
  ['Χρονιά / περίοδος',values.date],
  ['Πρόσωπα / ομάδα / διοργάνωση',values.persons],
  ['Προέλευση / πηγή',values.source],
  ['Δυνατότητα κοινοποίησης',values.rights],
  ['Περιγραφή',values.details]
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
function init(){
 for(const id of fields)$(id).addEventListener('input',()=>{refresh();$('guide-status').textContent='';});
 $('guide-copy').addEventListener('click',copy);
 refresh();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
