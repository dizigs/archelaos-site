/* Secure Pages Function first; mailto fallback only when sending is unavailable. */
(function(){'use strict';
let turnstileLoader;
function loadTurnstile(){
 if(window.turnstile)return Promise.resolve(window.turnstile);
 if(!turnstileLoader)turnstileLoader=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async=true;
  script.onload=()=>window.turnstile?resolve(window.turnstile):reject(new Error('Turnstile not available'));
  script.onerror=()=>reject(new Error('Turnstile could not load'));
  document.head.appendChild(script);
 });
 return turnstileLoader;
}
function init(){
 const template=document.querySelector('#ct-form-template');
 const params=new URLSearchParams(location.search);
 const query=params.get('topic')||'';
 const requestedSport=params.get('sport')||'';
 const alias={athlete:'sport',volunteer:'volunteer',sponsorship:'sponsorship',archive:'archive',general:'general',sport:'sport'};
 function open(){
  const form=template.content.firstElementChild.cloneNode(true);
  const topic=form.querySelector('#ct-topic'),sportWrap=form.querySelector('#ct-sport-wrap'),sport=form.querySelector('#ct-sport');
  topic.value=alias[query]||'';
  const archiveExtra=form.querySelector('#ct-archive-extra');
  const creditChoice=form.querySelector('#ct-credit-choice');
  const nameConsent=form.querySelector('#ct-credit-consent');
  const creditWrap=form.querySelector('#ct-credit-name-wrap');
  const creditName=form.querySelector('#ct-credit-name');
  const syncCredit=()=>{creditWrap.hidden=!nameConsent.checked;if(!nameConsent.checked)creditName.value=''};
  const sync=()=>{
   const sportTopic=topic.value==='sport',isContribution=topic.value==='archive';
   sportWrap.hidden=!sportTopic;sport.required=sportTopic;if(!sportTopic)sport.value='';
   archiveExtra.hidden=!isContribution;creditChoice.hidden=!isContribution;
   if(!isContribution){nameConsent.checked=false;creditName.value=''}
   syncCredit();
  };
  topic.addEventListener('change',sync);
  nameConsent.addEventListener('change',syncCredit);sync();
  if(topic.value==='sport' && [...sport.options].some(o=>o.value===requestedSport))sport.value=requestedSport;
  let widgetId=null,turnstileApi=null,challengeReady;

  form.addEventListener('submit',async event=>{
   event.preventDefault();
   if(!form.reportValidity())return;
   const data=new FormData(form);
   const subjectMap={general:'Γενική ερώτηση',sponsorship:'Χορηγίες / Συνεργασίες',sport:'Αθλητικό τμήμα / Εγγραφές',archive:'Συνεισφορά στο Ψηφιακό Αρχείο',volunteer:'Εθελοντισμός',other:'Άλλο θέμα'};
   const lines=[
    'Ονοματεπώνυμο: '+data.get('name'),'Email: '+data.get('email'),
    'Τηλέφωνο: '+(data.get('phone')||'—'),
    'Θέμα: '+(subjectMap[data.get('topic')]||data.get('topic')),
    ...(data.get('sport')?['Άθλημα: '+data.get('sport')]:[]),
    ...(data.get('archiveLink')?['Σύνδεσμος Google Drive: '+data.get('archiveLink')]:[]),
    ...(data.get('topic')==='archive' ? [
      'Δημόσια αναφορά ονόματος: '+(nameConsent.checked?'ΝΑΙ — επιτρέπεται η αναφορά εφόσον δημοσιευτεί η συνεισφορά':'ΟΧΙ — καμία δημόσια αναφορά'),
      ...(nameConsent.checked?['Όνομα δημόσιας αναφοράς: '+(creditName.value.trim()||String(data.get('name')||''))]:[])
    ]:[]),
    '',String(data.get('message')||'')
   ];
   const emailUrl='mailto:contact@archelaos.club?subject='+encodeURIComponent(
    'Γ.Α.Σ. Αρχέλαος — '+(subjectMap[data.get('topic')]||'Επικοινωνία'))+'&body='+encodeURIComponent(lines.join('\n'));
   const status=form.querySelector('.ct-form-note'),submit=form.querySelector('.ct-submit');
   const attachments=[...form.querySelector('#ct-attachments').files];
   if(attachments.length>5||attachments.some(f=>f.size>10*1024*1024)||
      attachments.reduce((sum,f)=>sum+f.size,0)>15*1024*1024){
     status.textContent='Επιλέξτε έως 5 αρχεία (μέχρι 10 MB το καθένα και 15 MB συνολικά).';
     return;
   }
   submit.disabled=true;
   try{
    try{
     status.textContent='Έλεγχος ασφαλούς αποστολής…';
     if(await challengeReady){
      const challengeToken=turnstileApi?.getResponse(widgetId);
      if(!challengeToken){
       status.textContent='Ολοκληρώστε πρώτα τον έλεγχο ασφαλείας και δοκιμάστε ξανά.';
       return;
      }
      const payload=new FormData(form);
      payload.set('consent','true');
      payload.set('cf-turnstile-response',challengeToken);
      payload.set('publicNameConsent',data.get('topic')==='archive'&&nameConsent.checked?'true':'false');
      payload.set('publicCreditName',data.get('topic')==='archive'&&nameConsent.checked?(creditName.value.trim()||String(data.get('name')||'')):'');
      payload.delete('publicName');
      payload.delete('attachments');
      attachments.forEach(file=>payload.append('attachments',file,file.name));
      status.textContent='Αποστολή μηνύματος…';
      const response=await fetch('/api/contact',{method:'POST',body:payload});
      if(response.ok){
       status.textContent='Το μήνυμά σας στάλθηκε με επιτυχία.';
       form.reset();sync();turnstileApi?.reset(widgetId);return;
      }
      if(response.status===403){
       status.textContent='Ο έλεγχος ασφαλείας έληξε ή απέτυχε. Δοκιμάστε ξανά.';
       turnstileApi?.reset(widgetId);
       return;
      }
      if(response.status>=400&&response.status<500){
       status.textContent='Δεν έγινε αποστολή. Ελέγξτε τα στοιχεία και τα συνημμένα.';
       return;
      }
     }
    }catch(_){/* Secure backend not configured or temporarily unavailable. */}
    if(attachments.length){
     status.textContent='Δεν υπάρχει διαθέσιμη ασφαλής αποστολή αρχείων. Στείλτε τα μέσω email ή χρησιμοποιήστε σύνδεσμο Google Drive.';
     return;
    }
    status.textContent='Ανοίγει το πρόγραμμα email σας για να ολοκληρώσετε την αποστολή.';
    window.location.href=emailUrl;
   }finally{submit.disabled=false}
  });
  window.ArchelaosUI.openDialog({title:'Στείλτε ένα μήνυμα.',subtitle:'ΜΙΛΗΣΤΕ ΜΑΣ',contentNode:form,closeLabel:'Κλείσιμο φόρμας'});
  // The form is inserted dynamically, so render Turnstile only after the dialog opens.
  challengeReady=fetch('/api/contact',{cache:'no-store'}).then(async response=>{
   const capability=response.ok?await response.json():null;
   if(!capability?.ready||!capability.turnstileSiteKey)return false;
   turnstileApi=await loadTurnstile();
   if(!form.isConnected)return false;
   widgetId=turnstileApi.render(form.querySelector('.ct-turnstile'),{
    sitekey:capability.turnstileSiteKey,
    action:'contact',
    theme:'auto',
    'expired-callback':()=>{form.querySelector('.ct-form-note').textContent='Ο έλεγχος ασφαλείας έληξε. Δοκιμάστε ξανά.';}
   });
   return widgetId!==undefined;
  }).catch(()=>{
   form.querySelector('.ct-form-note').textContent='Η ασφαλής απευθείας αποστολή δεν είναι διαθέσιμη. Μπορείτε να συνεχίσετε μέσω του προγράμματος email.';
   return false;
  });

 }
 document.querySelectorAll('[data-open-contact]').forEach(btn=>btn.addEventListener('click',open));
 if(query&&['athlete','volunteer','sponsorship','archive','sport','general'].includes(query)){
  const start=document.querySelector('[data-open-contact]');
  if(start)start.setAttribute('aria-label','Επικοινωνία σχετικά με '+query);
  // Links from the homepage and department cards should open the correctly prefilled form.
  open();
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
