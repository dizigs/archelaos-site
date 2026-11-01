/* Contact form is intentionally mailto-based, matching the existing website behavior. */
(function(){'use strict';
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
  const sync=()=>{const sportTopic=topic.value==='sport';sportWrap.hidden=!sportTopic;sport.required=sportTopic;if(!sportTopic)sport.value='';archiveExtra.hidden=topic.value!=='archive'};
  topic.addEventListener('change',sync);sync();
  if(topic.value==='sport' && [...sport.options].some(o=>o.value===requestedSport))sport.value=requestedSport;

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
    '',String(data.get('message')||'')
   ];
   const emailUrl='mailto:info@archelaos.club?subject='+encodeURIComponent(
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
     const probe=await fetch('/api/contact',{cache:'no-store'});
     const capability=probe.ok?await probe.json():null;
     if(capability?.ready){
      const payload=new FormData(form);
      payload.set('consent','true');
      payload.delete('attachments');
      attachments.forEach(file=>payload.append('attachments',file,file.name));
      status.textContent='Αποστολή μηνύματος…';
      const response=await fetch('/api/contact',{method:'POST',body:payload});
      if(response.ok){
       status.textContent='Το μήνυμά σας στάλθηκε με επιτυχία.';
       form.reset();sync();return;
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
