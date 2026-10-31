/* Upcoming, OWNER-APPROVED matches only. Source data auto-filters past kickoffs. */
(function(){'use strict';
const $=s=>document.querySelector(s);
const stage=()=>location.pathname.startsWith('/rebuild/');
const sportLabels={handball:'Χάντμπολ',volleyball:'Βόλεϊ'};
let fixtures=[],sport='all';
function el(tag,cls,txt){const node=document.createElement(tag);if(cls)node.className=cls;if(txt!==undefined)node.textContent=String(txt);return node;}
function readDate(iso){
 const d=new Date(iso);return Number.isFinite(d.getTime())?d:null;
}
function upcoming(){
 const now=Date.now();
 return fixtures.filter(x=>x.status==='scheduled'&&readDate(x.start_at)&&readDate(x.start_at).getTime()>now)
   .filter(x=>sport==='all'||x.sport===sport)
   .sort((a,b)=>readDate(a.start_at)-readDate(b.start_at));
}
function card(item){
 const date=readDate(item.start_at);
 const article=el('article','fx-card');
 const header=el('div','fx-top');
 const label=el('span','fx-sport',sportLabels[item.sport]||item.sport);
 const competition=el('span','fx-competition',item.competition||'Αγωνιστική αναμέτρηση');
 header.append(label,competition);
 const when=el('div','fx-when');
 when.append(el('strong','fx-day',new Intl.DateTimeFormat('el-GR',{day:'2-digit',month:'short',timeZone:'Europe/Athens'}).format(date)),
             el('span','fx-clock',new Intl.DateTimeFormat('el-GR',{weekday:'long',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Europe/Athens'}).format(date)));
 const teams=el('div','fx-teams');
 teams.append(el('strong','',item.home_team),el('span','fx-versus','—'),el('strong','',item.away_team));
 article.append(header,when,teams);
 const footer=el('div','fx-bottom');
 footer.append(el('span','fx-venue',item.venue||'Γήπεδο: προς ανακοίνωση'));
 const a=el('a','fx-calendar-link','Στο ημερολόγιο ↗');
 a.href='/calendar.ics';a.title='Κατεβάστε τους εγκεκριμένους αγώνες σε μορφή ημερολογίου';
 footer.append(a);article.append(footer);return article;
}
function render(){
 const list=upcoming(),root=$('#fx-list');if(!root)return;
 root.replaceChildren(...list.slice(0,6).map(card));
 $('#fx-empty').hidden=list.length>0;
 $('#fx-list').hidden=list.length===0;
 $('#fx-status').textContent=list.length
   ?'Εμφανίζονται '+Math.min(6,list.length)+' από '+list.length+' επόμενους εγκεκριμένους αγώνες.'
   :'Δεν έχουν ανακοινωθεί ακόμη εγκεκριμένοι επόμενοι αγώνες για αυτή την επιλογή.';
 const link=$('#fx-download');link.hidden=!fixtures.some(x=>x.status==='scheduled');
}
async function init(){
 const root=$('#upcoming-matches');if(!root)return;
 root.querySelectorAll('[data-fixture-sport]').forEach(b=>b.addEventListener('click',()=>{
  sport=b.dataset.fixtureSport;
  root.querySelectorAll('[data-fixture-sport]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
  render();
 }));
 try{
  const response=await fetch(stage()?'/rebuild/data/match-schedule.json':'/assets/site/data/match-schedule.json',{cache:'no-cache'});
  if(!response.ok)throw Error('Match schedule unavailable');
  const data=await response.json();
  if(data?.schema_version!==1||data?.approval_policy!=='owner_approved_only'||!Array.isArray(data.matches))
   throw Error('Match data cannot be trusted');
  fixtures=data.matches.filter(x=>x.approval?.status==='owner_approved'&&['handball','volleyball'].includes(x.sport));
  render();
 }catch(error){
  console.warn('Match schedule fallback',error);
  $('#fx-list').replaceChildren();$('#fx-list').hidden=true;$('#fx-empty').hidden=false;
  $('#fx-status').textContent='Το πρόγραμμα αγώνων δεν είναι προσωρινά διαθέσιμο.';
  $('#fx-download').hidden=true;
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
