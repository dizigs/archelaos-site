/* One card at a time; all historical answers are private research leads, never graded. */
(()=>{'use strict';
const root=document.getElementById('arch-factcheck-promo');if(!root)return;
const $=id=>document.getElementById(id);
const host=$('fc-grid'),counter=$('fc-count'),progress=$('fc-progress-fill');
const error=$('fc-load-error'),notice=$('fc-save-status'),security=$('fc-security'),retry=$('fc-retry'),sendButton=$('fc-send');
const defaultOptions=[{value:'true',label:'Σωστό'},{value:'false',label:'Λάθος'},{value:'unknown',label:'Δεν γνωρίζω'}];
let questions=[],position=0,ready=false,sitekey='',widget=null,token='',inFlight=false,paused=false,stored=0,loaded=false,submitting=false;
const pending=[];
const make=(tag,cls,value)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(value!==undefined)el.textContent=value;return el;};
function message(value){error.hidden=!value;if(value)error.textContent=value;}
function state(){
 root.dataset.collection=ready?'ready':'unavailable';
 const unsaved=pending.length;
 security.hidden=!ready||!submitting||unsaved===0;
 retry.hidden=!paused;
 sendButton.hidden=!ready||!unsaved||paused;
 sendButton.disabled=submitting||inFlight;
 sendButton.textContent='Αποστολή '+unsaved+' '+(unsaved===1?'απάντησης':'απαντήσεων');
 if(!ready)notice.textContent='Η αποστολή δεν είναι διαθέσιμη. Δεν καταχωρίζονται απαντήσεις.';
 else if(paused)notice.textContent=unsaved+' απαντήσεις δεν αποθηκεύτηκαν. Πάτησε «Επανάληψη αποστολής».';
 else if(inFlight)notice.textContent='Αποστολή '+unsaved+' απαντήσεων για ιδιωτική αξιολόγηση…';
 else if(submitting)notice.textContent='Ένας έλεγχος ασφαλείας πριν σταλούν οι συγκεντρωμένες απαντήσεις σου.';
 else if(unsaved)notice.textContent='Έχεις επιλέξει '+unsaved+' απαντήσεις. Δεν έχουν σταλεί ακόμη — πάτησε «Αποστολή» όταν είσαι έτοιμος.';
 else if(stored)notice.textContent=stored+' απαντήσεις αποθηκεύτηκαν ιδιωτικά για έλεγχο.';
 else notice.textContent='Επίλεξε όσα διλήμματα θέλεις. Η αποστολή γίνεται συγκεντρωτικά στο τέλος.';
}
function focusHeading(){const t=host.querySelector('.fc-question');if(t)t.focus({preventScroll:true});}
function render(focus=false){
 host.replaceChildren();
 if(!loaded){counter.textContent='Φόρτωση ιστορικών ερωτημάτων…';return;}
 const total=questions.length;
 counter.textContent=position>=total?total+' από '+total+' · Ολοκληρώθηκε':(position+1)+' από '+total+' ιστορικά ερωτήματα';
 progress.style.width=(total?Math.round(100*position/total):0)+'%';
 if(position>=total){
  const card=make('article','fc-card fc-finished');
  const title=make('h3','fc-question','Σε ευχαριστούμε που βοηθάς την ιστορία του Αρχέλαου!');title.tabIndex=-1;
  card.append(title,make('p','fc-finished-desc','Δεν υπάρχουν σωστές ή λανθασμένες βαθμολογίες. Οι εκτιμήσεις σου θα αξιολογηθούν ως ιστορικές μαρτυρίες.'));
  if(pending.length)card.append(make('p','fc-pending-alert','Έλεγξε την κατάσταση αποστολής παρακάτω πριν κλείσεις τη σελίδα.'));
  host.append(card);if(focus)focusHeading();state();return;
 }
 const item=questions[position],card=make('article','fc-card');
 const meta=make('div','fc-card-top');
 meta.append(make('span','fc-category',item.category),make('span','fc-id','Ερώτημα '+(position+1)));
 const title=make('h3','fc-question',item.claim);title.tabIndex=-1;
 const context=make('p','fc-context',item.reviewContext||'Χρειαζόμαστε τη δική σου μαρτυρία για να ελέγξουμε το ιστορικό αρχείο.');
 const prompt=make('p','fc-hint',Array.isArray(item.alternatives)?'Ποια εκδοχή γνωρίζεις;':'Τι θυμάσαι για αυτό;');
 const actions=make('div','fc-card-choices');actions.setAttribute('role','group');actions.setAttribute('aria-label','Επιλογή απάντησης');
 const options=Array.isArray(item.alternatives)?
  [{value:'true',label:item.alternatives[0]},{value:'false',label:item.alternatives[1]},{value:'unknown',label:'Δεν γνωρίζω'}]:
  defaultOptions;
 for(const choice of options){
  const button=make('button','fc-answer',choice.label);button.type='button';button.disabled=!ready;
  button.addEventListener('click',()=>choose(item,choice.value));
  actions.append(button);
 }
 const extras=make('details','fc-extra');
 const summary=make('summary','','Θέλω να προσθέσω κάτι που θυμάμαι (προαιρετικό)');
 const label1=make('label','fc-extra-label','Η μαρτυρία σου');
 const note=make('textarea','fc-evidence');note.id='fc-evidence';note.maxLength=600;note.rows=3;
 note.placeholder='Ένα γεγονός, ένα πρόσωπο ή κάτι που θυμάσαι…';
 const label2=make('label','fc-extra-label','Σύνδεσμος πηγής (προαιρετικός)');
 const link=make('input','fc-reference');link.id='fc-url';link.type='url';link.maxLength=350;
 link.placeholder='https://…';link.autocomplete='off';
 label1.append(note);label2.append(link);extras.append(summary,label1,label2);
 const footer=make('div','fc-card-footer');
 const skip=make('button','fc-skip','Παράλειψη');skip.type='button';
 skip.addEventListener('click',()=>{position+=1;render(true);});
 const inlineError=make('p','fc-inline-error');inlineError.id='fc-inline-error';inlineError.setAttribute('role','status');
 footer.append(skip,inlineError);
 card.append(meta,title,context,prompt,extras,actions,footer);host.append(card);
 if(focus)focusHeading();state();
}
function choose(item,choice){
 if(!ready||!crypto?.randomUUID)return;
 const evidence=$('fc-evidence').value.trim(),referenceUrl=$('fc-url').value.trim();
 if(referenceUrl){
  try{const u=new URL(referenceUrl);
   if(u.protocol!=='https:'||u.username||u.password)throw Error('url');
  }catch{$('fc-inline-error').textContent='Ο σύνδεσμος πρέπει να είναι έγκυρη διεύθυνση https://';return;}
 }
 const answer={claimId:item.id,choice,receipt:crypto.randomUUID(),evidence,referenceUrl};
 pending.push(answer);
 position+=1;render(true);
}
function ensureSecurity(){
 if(!ready)return;
 if(window.turnstile){if(widget===null)try{
  widget=window.turnstile.render('#fc-turnstile',{
   sitekey,action:'fact_check',theme:'light',
   callback:value=>{if(submitting){token=value;void send();}},
   'expired-callback':()=>{token='';},
   'error-callback':()=>{token='';}
  });else window.turnstile.reset(widget);
 }catch{message('Ο έλεγχος ασφαλείας δεν φορτώθηκε. Οι απαντήσεις δεν αποθηκεύονται.');}
  return;}
 if(document.querySelector('script[data-fc-turnstile]'))return;
 const script=document.createElement('script');script.dataset.fcTurnstile='true';
 script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
 script.async=true;script.addEventListener('load',ensureSecurity);
 script.addEventListener('error',()=>message('Ο έλεγχος ασφαλείας δεν φορτώθηκε.'));
 document.head.append(script);
}
async function send(){
 if(inFlight||paused||!submitting||!ready||!token||!pending.length)return;
 inFlight=true;const batch=pending.slice(),used=token;token='';state();
 try{
  const response=await fetch('/api/fact-check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    catalogVersion:1,turnstileToken:used,answers:batch
  })});
  const body=await response.json().catch(()=>({}));
  if(!response.ok||body.ok!==true||body.accepted!==batch.length)throw Error('unconfirmed');
  pending.splice(0,batch.length);stored+=batch.length;submitting=false;
  if(loaded&&position>=questions.length)render();
 }catch{paused=true;submitting=false;}
 finally{inFlight=false;state();}
}
async function readiness(){
 try{
  const r=await fetch('/api/fact-check',{cache:'no-store'});if(!r.ok)throw Error('api');
  const obj=await r.json();
  ready=obj?.ready===true&&typeof obj.sitekey==='string'&&obj.sitekey.length>10;
  sitekey=ready?obj.sitekey:'';
 }catch{ready=false;}
 state();if(loaded)render();
}
async function loadQuestions(){
 try{
  const r=await fetch('/assets/fact-check-claims.json',{cache:'no-store'});if(!r.ok)throw Error();
  const obj=await r.json();if(obj.schema_version!==1||!Array.isArray(obj.items)||obj.items.length!==61||
    new Set(obj.items.map(x=>x.id)).size!==61||obj.items.some(x=>!/^TF0(?:[0-5][0-9]|6[01])$/.test(x.id)||
      x.status!=='unverified'||typeof x.claim!=='string'||(x.alternatives&&
        (!Array.isArray(x.alternatives)||x.alternatives.length!==2||x.alternatives.some(v=>typeof v!=='string'||!v.trim())))))throw Error('invalid');
  // Keep every historical TF ID in the archive, but never publish unreviewed
  // intake leads as visitor dilemmas. Only editorially curated discrepancies show.
  const published=obj.items.filter(x=>x.publicReview===true);
  if(!published.length||published.length>25||
     obj.items.some(x=>typeof x.publicReview!=='boolean')||
     published.some(x=>typeof x.reviewContext!=='string'||!x.reviewContext.trim()||
       !Array.isArray(x.alternatives)||x.alternatives.length!==2))throw Error('unreviewed_catalog');
  if(new Set(published.map(x=>x.displayOrder)).size!==published.length||
     published.some(x=>!Number.isInteger(x.displayOrder)||x.displayOrder<1))throw Error('invalid_review_order');
  questions=published.sort((a,b)=>a.displayOrder-b.displayOrder);loaded=true;render();
 }catch{loaded=true;questions=[];render();message('Τα ιστορικά ερωτήματα δεν φορτώθηκαν. Δοκίμασε ξανά αργότερα.');}
}
function requestSubmission(){
 if(!ready||!pending.length||inFlight)return;
 paused=false;submitting=true;token='';state();ensureSecurity();
}
sendButton.addEventListener('click',requestSubmission);
retry.addEventListener('click',requestSubmission);
void loadQuestions();void readiness();
})();
