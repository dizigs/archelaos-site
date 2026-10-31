/* Contact form is intentionally mailto-based, matching the existing website behavior. */
(function(){'use strict';
function init(){
 const template=document.querySelector('#ct-form-template');
 const query=new URLSearchParams(location.search).get('topic')||'';
 const alias={athlete:'sport',volunteer:'volunteer',sponsorship:'sponsorship',archive:'archive',general:'general',sport:'sport'};
 function open(){
  const form=template.content.firstElementChild.cloneNode(true);
  const topic=form.querySelector('#ct-topic'),sportWrap=form.querySelector('#ct-sport-wrap'),sport=form.querySelector('#ct-sport');
  topic.value=alias[query]||'';
  const sync=()=>{const sportTopic=topic.value==='sport';sportWrap.hidden=!sportTopic;sport.required=sportTopic;if(!sportTopic)sport.value=''};
  topic.addEventListener('change',sync);sync();
  form.addEventListener('submit',event=>{
   event.preventDefault();
   if(!form.reportValidity())return;
   const data=new FormData(form);
   const subjectMap={general:'Γενική ερώτηση',sponsorship:'Χορηγίες / Συνεργασίες',sport:'Αθλητικό τμήμα / Εγγραφές',archive:'Συνεισφορά στο Ψηφιακό Αρχείο',volunteer:'Εθελοντισμός',other:'Άλλο θέμα'};
   const lines=[
    'Ονοματεπώνυμο: '+data.get('name'),
    'Email: '+data.get('email'),
    'Τηλέφωνο: '+(data.get('phone')||'—'),
    'Θέμα: '+(subjectMap[data.get('topic')]||data.get('topic')),
    ...(data.get('sport')?['Άθλημα: '+data.get('sport')]:[]),
    '',String(data.get('message')||'')
   ];
   const url='mailto:info@archelaos.club?subject='+encodeURIComponent('Γ.Α.Σ. Αρχέλαος — '+(subjectMap[data.get('topic')]||'Επικοινωνία'))+'&body='+encodeURIComponent(lines.join('\n'));
   window.location.href=url;
   const status=form.querySelector('.ct-form-note');
   if(status)status.textContent='Ανοίγει το πρόγραμμα email σας. Ελέγξτε και στείλτε το μήνυμα από εκεί.';
  });
  window.ArchelaosUI.openDialog({title:'Στείλτε ένα μήνυμα.',subtitle:'ΜΙΛΗΣΤΕ ΜΑΣ',contentNode:form,closeLabel:'Κλείσιμο φόρμας'});
 }
 document.querySelectorAll('[data-open-contact]').forEach(btn=>btn.addEventListener('click',open));
 if(query&&['athlete','volunteer','sponsorship','archive','sport','general'].includes(query)){
  const start=document.querySelector('[data-open-contact]');
  if(start)start.setAttribute('aria-label','Επικοινωνία σχετικά με '+query);
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
