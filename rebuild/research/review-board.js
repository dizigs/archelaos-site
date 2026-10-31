/* Read-only editorial board. Clipboard creates a chat instruction, NOT approval. */
(function(){'use strict';
const $=s=>document.querySelector(s),selected=new Set();
let catalog=null,items=[],sources=new Map();
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('el');
const make=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=String(text);return x};
function recommendation(event){
 const conflicts=catalog.review_flags.filter(x=>x.status==='requires_human_review'&&event.associations.moment_ids.includes(x.moment_id));
 const uncertain=catalog.research_queue.filter(x=>x.event_id===event.id);
 const blockers=[...conflicts.map(x=>x.issue),...uncertain.map(x=>x.issue)];
 const kinds=event.source_ids.map(x=>sources.get(x)?.kind);
 if(blockers.length||event.editorial_status==='rejected')return {kind:'blocked',label:'Αναμονή τεκμηρίωσης / αντίφαση',detail:blockers.join(' · ')||'Προηγούμενη απόρριψη'};
 if(event.editorial_status==='approved')return {kind:'approved',label:'Εγκεκριμένο στο μητρώο',detail:'Η τελική καταχώριση έχει γίνει με ξεχωριστή ιδιοκτησιακή απόφαση.'};
 if(kinds.includes('official_federation')||
   (['governance','club_honours'].includes(event.event_type)&&kinds.includes('official_municipality')))
  return {kind:'candidate',label:'Προτείνεται για δικό σου έλεγχο',detail:'Υπάρχει επίσημη αναφορά· απαιτείται έλεγχος του ακριβούς γεγονότος.'};
 return {kind:'crosscheck',label:'Χρειάζεται πρόσθετη διασταύρωση',detail:'Η πηγή ή το περιεχόμενο χρειάζεται πρόσθετη επαλήθευση.'};
}
function selection(){
 $('#chosen').textContent=String(selected.size);
 $('#selected').textContent=selected.size+' επιλεγμένα γεγονότα';
 $('#copy').disabled=selected.size===0;
}
function card(event,number){
 const state=recommendation(event);
 const root=make('article','entry');
 const head=make('div','entry-header');
 head.append(make('span','entry-category',event.sports.map(x=>catalog.department_registry.find(d=>d.id===x)?.label||x).join(' · ')),
             make('span','entry-number','#'+String(number).padStart(2,'0')));
 root.append(head,make('h3','',event.title),make('p','entry-summary',event.summary));
 const meta=make('div','entry-meta');
 const period=event.temporal.date||event.temporal.season||String(event.temporal.year||'');
 meta.append(make('span','',period),make('span','','Πηγές: '+event.source_ids.length),
             make('span','','Πρόσωπα: '+event.associations.people.length));
 root.append(meta);
 const st=make('div','entry-state '+state.kind);
 st.append(make('strong','',state.label),make('p','',state.detail));root.append(st);
 const sour=make('div','entry-sources');
 for(const id of event.source_ids){
  const source=sources.get(id);if(!source)continue;
  const a=make('a','',source.provider+' ↗');a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';
  sour.append(a);
 }
 root.append(sour);
 const foot=make('div','entry-foot');
 foot.append(make('span','entry-id',event.id));
 const label=make('label','entry-check');
 const input=make('input');input.type='checkbox';input.checked=selected.has(event.id);
 const can=state.kind==='candidate';input.disabled=!can;
 if(!can)label.setAttribute('aria-disabled','true');
 input.addEventListener('change',()=>{if(input.checked)selected.add(event.id);else selected.delete(event.id);selection()});
 label.append(input,make('span','',can?'Σημείωσε':'Πρώτα τεκμηρίωση'));foot.append(label);root.append(foot);
 return root;
}
function render(){
 const keyword=norm($('#search').value),sport=$('#sport').value,st=$('#status').value;
 const visible=items.filter(e=>{
  const r=recommendation(e);
  const hay=norm([e.id,e.title,e.summary,e.temporal.date,e.temporal.season,e.temporal.year].join(' '));
  return (sport==='all'||e.sports.includes(sport))&&(st==='all'||r.kind===st)&&(!keyword||hay.includes(keyword));
 });
 $('#entries').replaceChildren(...visible.map(e=>card(e,items.indexOf(e)+1)));
 $('#state').textContent=visible.length+' από '+items.length+' εγγραφές · Κάθε πηγή ανοίγει σε νέα καρτέλα.';
 selection();
}
async function copy(){
 const ids=[...selected].sort();
 if(!ids.length)return;
 const text='Ενέκρινε, μετά από τελευταίο έλεγχο πηγών και αντιφάσεων, τα γεγονότα του εσωτερικού μητρώου με IDs: '+ids.join(', ')+'. Αν υπάρχουν νέες εκκρεμότητες, κράτησέ τα σε αναμονή και ενημέρωσέ με.';
 try{
  await navigator.clipboard.writeText(text);
  $('#state').textContent='Αντιγράφηκε η εντολή. Η επιλογή δεν έγινε ακόμη πραγματική έγκριση.';
 }catch{
  $('#state').textContent='Δεν επιτράπηκε η αντιγραφή. Μπορείτε να γράψετε τους IDs χειροκίνητα.';
 }
}
async function init(){
 try{
  const response=await fetch('./historical-events.json',{cache:'no-cache'});
  if(!response.ok)throw Error('Research register missing');
  catalog=await response.json();
  if(catalog.schema_version!==1||!Array.isArray(catalog.events))throw Error('Invalid history data');
  items=catalog.events;sources=new Map(catalog.source_registry.map(x=>[x.id,x]));
  for(const d of catalog.department_registry){
   const o=make('option','',d.label);o.value=d.id;$('#sport').append(o);
  }
  $('#total').textContent=items.length;
  $('#candidate').textContent=items.filter(x=>recommendation(x).kind==='candidate').length;
  $('#blocked').textContent=items.filter(x=>recommendation(x).kind==='blocked').length;
  for(const id of ['search','sport','status'])$( '#'+id).addEventListener(id==='search'?'input':'change',render);
  $('#copy').addEventListener('click',copy);render();
 }catch(err){console.warn('Research review UI unavailable',err);$('#state').textContent='Δεν ήταν δυνατή η φόρτωση του ερευνητικού αρχείου.'}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
