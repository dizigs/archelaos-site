/* One review-only correction control per historical popup. No auto-publication. */
(()=>{'use strict';
if(window.ArchelaosCorrections)return;
window.ArchelaosCorrections={version:1};
const ids=['an-dialog','arch-bio-global','arc-bio-dialog','person-dialog','honors-detail-dialog','historyArchiveModal','historyPresidentModal','timelineDetailModal','deptHistoryModal','overlay','archiveStoryModalV56','pbh-dialog'];
const headings={'an-dialog':'#an-dialog-title','arch-bio-global':'#arch-bio-global-title','arc-bio-dialog':'#arc-bio-name','person-dialog':'#dialog-name','overlay':'#reader-title'};
const add=(tag,cls,txt)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=txt;return x};
let availability,tsLoad;
const enabled=()=>availability??=fetch('/api/text-corrections',{cache:'no-store'}).then(r=>r.ok?r.json():{enabled:false}).catch(()=>({enabled:false}));
const turnstile=()=>window.turnstile?Promise.resolve(window.turnstile):tsLoad??=new Promise((ok,no)=>{const s=add('script');s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';s.async=true;s.onload=()=>window.turnstile?ok(window.turnstile):no(Error('turnstile'));s.onerror=no;document.head.append(s)});
const open=root=>root.tagName==='DIALOG'?root.open:root.id==='archiveStoryModalV56'?!root.hidden:root.getAttribute('aria-hidden')==='false'||root.classList.contains('open')||root.classList.contains('is-open');
function inspect(root){
 const h=root.querySelector(headings[root.id]||'h2')||root.querySelector('h2,h3');
 const title=(h?.textContent||'').replace(/\s+/g,' ').trim().slice(0,180);
 const favorite=root.querySelector('[data-favorite-kind][data-favorite-id]');
 const kind=root.dataset.correctionKind||favorite?.dataset.favoriteKind;
 const id=root.dataset.correctionId||favorite?.dataset.favoriteId;
 if(!title||!kind||!id||!/^[\w.:-]{1,170}$/.test(id))return;
 const key=kind+':'+id,prior=root.querySelector('.arch-correction-action');
 if(prior?.dataset.key===key)return;
 const actions=root.id==='an-dialog'?root.querySelector('.an-dialog-actions'):root.id==='arch-bio-global'?root.querySelector('.arch-bio-actions'):root.id==='arc-bio-dialog'?root.querySelector('.arc-bio-heart'):favorite?.parentElement;
 if(!actions)return;
 root.querySelectorAll('.arch-correction-action,.arch-correction-panel').forEach(n=>n.remove());
 const host=root.querySelector('.an-dialog-inner,.arch-bio-scroll,.arc-bio-inner,.dialog-inner,.archive-story-panel,.reader,.modal-box,.pbh-dialog-body')||root;
 host.classList.add('arch-correction-host');
 const b=add('button','arch-correction-action');b.type='button';b.dataset.key=key;b.title='Πρότεινε διόρθωση';b.setAttribute('aria-label','Πρότεινε διόρθωση: '+title);b.setAttribute('aria-expanded','false');
 b.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7"/><path d="m14 18 5-5 2 2-5 5-3 1 1-3Z"/><path d="M7 9h10M7 13h5"/></svg>';
 const close=actions.querySelector('.an-close,.arch-bio-close');
 if(close)actions.insertBefore(b,close);else actions.append(b);
 const panel=add('section','arch-correction-panel');panel.hidden=true;panel.setAttribute('aria-label','Πρόταση διόρθωσης');
 const top=add('div','arch-correction-heading'),name=add('strong','', 'Πρότεινε μια διόρθωση'),x=add('button','arch-correction-dismiss','×');
 x.type='button';x.setAttribute('aria-label','Κλείσιμο πλαισίου');top.append(name,x);
 const form=add('form','arch-correction-form');
 const label=add('label','', 'Διόρθωση ή πρόσθετη πληροφορία');
 const message=add('textarea');message.rows=4;message.required=true;message.minLength=10;message.maxLength=1200;message.placeholder='Γράψε τη διόρθωσή σου…';label.append(message);
 const srcLabel=add('label','', 'Δημόσια πηγή (προαιρετική)'),source=add('input');source.type='url';source.maxLength=650;source.placeholder='https://…';srcLabel.append(source);
 const challenge=add('div','arch-correction-turnstile'),status=add('p','arch-correction-status');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const send=add('button','arch-correction-send','Αποστολή πρότασης');send.type='submit';send.disabled=true;
 form.append(label,srcLabel,challenge,status,send,add('small','arch-correction-note','Χωρίς υποχρεωτικό όνομα ή email. Καμία αυτόματη δημοσίευση.'));
 panel.append(top,add('p','arch-correction-intro','Η πρότασή σου θα εξεταστεί πριν αλλάξει το ιστορικό κείμενο.'),form);host.append(panel);
 let token='',active=false,busy=false,widget=null;
 const refresh=()=>{send.disabled=!active||!token||message.value.trim().length<10||busy};
 const hide=()=>{panel.hidden=true;b.setAttribute('aria-expanded','false');b.focus({preventScroll:true})};
 x.addEventListener('click',hide);panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();hide()}});
 panel.addEventListener('click',e=>e.stopPropagation());message.addEventListener('input',refresh);
 b.addEventListener('click',async e=>{
  e.stopPropagation();if(!panel.hidden){hide();return}
  panel.hidden=false;b.setAttribute('aria-expanded','true');message.focus({preventScroll:true});
  status.textContent='Έλεγχος διαθεσιμότητας…';
  const config=await enabled();if(panel.hidden||!b.isConnected)return;
  if(!config.enabled||!config.siteKey){status.textContent='Η online υποβολή δεν έχει ενεργοποιηθεί ακόμη.';return}
  active=true;status.textContent='Συμπλήρωσε το σχόλιο και τον έλεγχο ασφαλείας.';
  if(widget!==null){refresh();return}
  try{const t=await turnstile();widget=t.render(challenge,{sitekey:config.siteKey,action:'text_correction',callback:v=>{token=v;refresh()},'expired-callback':()=>{token='';refresh()},'error-callback':()=>{token='';refresh()}})}catch{active=false;status.textContent='Ο έλεγχος ασφαλείας δεν είναι διαθέσιμος.'}
  refresh();
 });
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(!active||!token||busy||message.value.trim().length<10)return;
  busy=true;refresh();status.textContent='Αποστολή…';
  const excerpt=(root.querySelector('.an-detail,.arch-bio-description,.arc-bio-text,.reader-content,.dialog-body')?.textContent||title).replace(/\s+/g,' ').trim().slice(0,500);
  const url=new URL(location.href);url.hash='';
  try{
   const res=await fetch('/api/text-corrections',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({record_kind:kind,record_id:id,record_title:title,source_page:url.href,text_excerpt:excerpt,description:message.value.trim(),public_source_url:source.value.trim(),turnstile_token:token})});
   const answer=await res.json();if(!res.ok)throw Error(answer.error||'Η αποστολή απέτυχε.');
   status.textContent=answer.status==='already_received'?'Η πρόταση υπάρχει ήδη.':'Η πρόταση καταγράφηκε για έλεγχο.';message.value='';source.value='';
  }catch(err){status.textContent=err.message||'Η αποστολή δεν ολοκληρώθηκε.'}
  finally{busy=false;token='';if(widget!==null&&window.turnstile)window.turnstile.reset(widget);refresh()}
 });
}
let scheduled=false;
function scan(){scheduled=false;for(const id of ids){const root=document.getElementById(id);if(root&&open(root))inspect(root)}}
const queue=()=>{if(!scheduled){scheduled=true;requestAnimationFrame(scan)}};
function init(){new MutationObserver(changes=>{if(changes.some(c=>c.type==='attributes'||[...c.addedNodes].some(n=>n.nodeType===1&&!n.classList?.contains('arch-correction-panel'))))queue()}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden','open','aria-hidden','data-correction-id']});document.addEventListener('click',queue,true);queue()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();