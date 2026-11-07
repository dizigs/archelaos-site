/* Anonymous historical leads — no scored answers, public tallies or auto-publishing. */
(()=>{'use strict';
const section=document.getElementById('arch-factcheck-promo');if(!section)return;
const $=id=>document.getElementById(id);
const grid=$('fc-grid'),filter=$('fc-filter'),search=$('fc-search'),more=$('fc-more'),dialog=$('fc-dialog');
const sitekey='0x4AAAAAAFoyKwIFuvMbrcAd', labels={true:'Σωστό',false:'Λάθος',unknown:'Δεν γνωρίζω'};
let claims=[],shown=[],limit=12,selected=null,ready=false,catalogError=false,widget=null,token='',previousFocus=null;
const replied=new Set();
const elt=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
function updateStatus(){
 section.dataset.collection=ready?'ready':'unavailable';
 const p=$('fc-load-error');
 if(catalogError){p.textContent='Το αρχείο ερωτημάτων δεν φορτώθηκε. Μπορείς να επικοινωνήσεις με το ιστορικό αρχείο.';p.hidden=false;return;}
 if(!ready){p.textContent='Η ηλεκτρονική υποβολή δεν είναι αυτή τη στιγμή διαθέσιμη. Μπορείς να διαβάσεις τα διλήμματα και να στείλεις μαρτυρία από την Επικοινωνία.';p.hidden=false;return;}
 p.hidden=true;
}
async function availability(){
 try{const r=await fetch('/api/fact-check',{cache:'no-store'});if(!r.ok)throw Error();const data=await r.json();ready=data?.ready===true;}
 catch{ready=false;}
 updateStatus();
}
function render(){
 grid.replaceChildren();const visible=shown.slice(0,limit);
 for(const item of visible){
  const card=elt('article','fc-card');card.id='fact-'+item.id;
  const top=elt('div','fc-card-top');top.append(elt('span','',item.id),elt('span','fc-category',item.category));card.append(top,elt('p','fc-card-claim',item.claim));
  const actions=elt('div','fc-card-choices');actions.setAttribute('role','group');actions.setAttribute('aria-label','Απάντηση για το '+item.id);
  for(const [choice,label] of Object.entries(labels)){
   const b=elt('button','',label);b.type='button';b.disabled=replied.has(item.id);b.addEventListener('click',()=>open(item,choice,b));actions.append(b);
  }
  card.append(actions);
  if(replied.has(item.id)){
   const confirmation=elt('p','fc-card-responded','Η μαρτυρία σου παραλήφθηκε για έλεγχο. Ευχαριστούμε!');
   confirmation.tabIndex=-1;card.append(confirmation);
  }
  grid.append(card);
 }
 $('fc-count').textContent=shown.length+' από τα 61 ιστορικά διλήμματα · εμφανίζονται '+visible.length;
 more.hidden=limit>=shown.length;
}
function refilter(){
 const q=search.value.trim().toLocaleLowerCase('el-GR'),category=filter.value;
 shown=claims.filter(x=>(!category||x.category===category)&&(!q||[x.claim,x.category,x.id].join(' ').toLocaleLowerCase('el-GR').includes(q)));
 limit=12;render();
}
async function catalog(){
 try{
  const r=await fetch('/assets/fact-check-claims.json',{cache:'no-store'});if(!r.ok)throw Error();
  const payload=await r.json();
  if(payload.schema_version!==1||!Array.isArray(payload.items)||payload.items.length!==61||new Set(payload.items.map(x=>x.id)).size!==61)throw Error();
  claims=payload.items;shown=claims;catalogError=false;
  for(const name of [...new Set(claims.map(x=>x.category))].sort((a,b)=>a.localeCompare(b,'el'))){const option=elt('option','',name);option.value=name;filter.append(option);}
  render();
 }catch{catalogError=true;}
 updateStatus();
}
function turnstileWidget(){
 if(!dialog.open||!window.turnstile)return;
 try{
  if(widget===null)widget=window.turnstile.render('#fc-turnstile',{
   sitekey,action:'fact_check',theme:'light',
   callback:value=>{token=value;$('fc-form-status').textContent=''},
   'expired-callback':()=>{token=''},'error-callback':()=>{token=''}
  });else window.turnstile.reset(widget);
 }catch{$('fc-form-status').textContent='Ο έλεγχος ασφαλείας δεν είναι διαθέσιμος.';}
}
function ensureTurnstile(){
 if(window.turnstile){turnstileWidget();return;}
 if(document.querySelector('script[data-fc-turnstile]'))return;
 const s=document.createElement('script');s.dataset.fcTurnstile='true';
 s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';s.async=true;
 s.addEventListener('load',turnstileWidget);
 s.addEventListener('error',()=>{$('fc-form-status').textContent='Δεν φορτώθηκε ο έλεγχος ασφαλείας.'});
 document.head.append(s);
}
function open(item,choice,button){
 previousFocus=button;
 selected={id:item.id,choice,receipt:crypto.randomUUID(),catalogVersion:1};
 token='';
 $('fc-dialog-claim').textContent=item.claim;
 $('fc-dialog-choice').textContent='Η εκτίμησή σου: '+labels[choice];
 $('fc-evidence').value='';$('fc-url').value='';
 $('fc-form-status').textContent=ready?'':'Η υποβολή δεν είναι διαθέσιμη. Στείλε μας τεκμήριο μέσω της Επικοινωνίας.';
 $('fc-submit').disabled=!ready;
 dialog.showModal();if(ready)ensureTurnstile();
}
function close(){dialog.close();previousFocus?.focus();}
async function submit(e){
 e.preventDefault();if(!selected||!ready)return;
 const evidence=$('fc-evidence').value.trim(),referenceUrl=$('fc-url').value.trim();
 if(referenceUrl){try{if(new URL(referenceUrl).protocol!=='https:')throw Error();}catch{$('fc-form-status').textContent='Ο σύνδεσμος πρέπει να αρχίζει με https://';return;}}
 if(!token){$('fc-form-status').textContent='Ολοκλήρωσε πρώτα τον έλεγχο ασφαλείας.';return;}
 const send=$('fc-submit');send.disabled=true;$('fc-form-status').textContent='Καταχώριση μαρτυρίας…';
 try{
  const r=await fetch('/api/fact-check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
   claimId:selected.id,choice:selected.choice,receipt:selected.receipt,catalogVersion:selected.catalogVersion,evidence,referenceUrl,turnstileToken:token
  })});
  const result=await r.json().catch(()=>({}));
  if(!r.ok||result?.ok!==true)throw Error();
  const id=selected.id;replied.add(id);dialog.close();render();
  $('fact-'+id)?.querySelector('.fc-card-responded')?.focus();
 }catch{
  $('fc-form-status').textContent='Δεν καταχωρίστηκε η μαρτυρία. Δοκίμασε ξανά ή χρησιμοποίησε την Επικοινωνία.';
  token='';try{window.turnstile?.reset(widget);}catch{}
 }finally{send.disabled=false;}
}
search.addEventListener('input',refilter);filter.addEventListener('change',refilter);
more.addEventListener('click',()=>{limit+=12;render()});
$('fc-close').addEventListener('click',close);$('fc-cancel').addEventListener('click',close);
$('fc-form').addEventListener('submit',submit);
void catalog();void availability();
})();
