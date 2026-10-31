/* Archélaos Matchday — elegant, accessible, OWNER-APPROVED fixtures ONLY.
 * Each match has its own .ics download; Google/Outlook links appear only when
 * both start AND end were explicitly verified. No duration is invented.
 */
(function(){'use strict';
const $=s=>document.querySelector(s);
const stage=()=>location.pathname.startsWith('/rebuild/');
const labels={handball:'ΧΑΝΤΜΠΟΛ',volleyball:'ΒΟΛΕΪ'};
const create=(tag,cls,content)=>{const node=document.createElement(tag);if(cls)node.className=cls;
 if(content!==undefined)node.textContent=String(content);return node};
let fixtures=[],sport='all';
function heritage(){
 const current=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Athens',year:'numeric'}).format(new Date()));
 if(current<2026||current>2200)return;
 const yrs=$('#fx-history-years'),range=$('#fx-history-range');
 if(yrs)yrs.textContent=String(current-1956);
 if(range)range.textContent='1956 — '+current;
}
const dateOf=s=>{if(!s)return null;const d=new Date(s);return Number.isFinite(d.getTime())?d:null};
const dateOnly=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d);
const displayDate=x=>dateOnly(x.date)?new Date(x.date+'T12:00:00Z'):dateOf(x.start_at);
const todayAthens=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const inFuture=x=>dateOnly(x.date)?x.date>=todayAthens():dateOf(x.start_at)?.getTime()>Date.now();
const format=(date,parts)=>new Intl.DateTimeFormat('el-GR',{timeZone:'Europe/Athens',...parts}).format(date);
const utcStamp=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
function calendarLink(item,provider){
 if(!item.end_at)return null;
 const begin=dateOf(item.start_at),end=dateOf(item.end_at);
 if(!item.end_at_verified)return null;
 if(!begin||!end||end<=begin)return null;
 const title=item.home_team+' — '+item.away_team;
 const description='Γ.Α.Σ. «Ο Αρχέλαος» Κατερίνης'+(item.competition?' · '+item.competition:'');
 if(provider==='google'){
  const url=new URL('https://calendar.google.com/calendar/r/eventedit');
  url.search=new URLSearchParams({action:'TEMPLATE',text:title,
   dates:utcStamp(begin)+'/'+utcStamp(end),stz:'Europe/Athens',etz:'Europe/Athens',
   details:description,location:item.venue||''}).toString();
  return url.toString();
 }
 if(provider==='outlook'){
  const url=new URL('https://outlook.live.com/calendar/0/deeplink/compose');
  url.search=new URLSearchParams({path:'/calendar/action/compose',rru:'addevent',
   subject:title,startdt:begin.toISOString(),enddt:end.toISOString(),
   body:description,location:item.venue||''}).toString();
  return url.toString();
 }
 return null;
}
function upcoming(){
 const now=Date.now();
 return fixtures.filter(x=>x.status==='scheduled'&&inFuture(x))
  .filter(x=>sport==='all'||x.sport===sport)
  .sort((a,b)=>displayDate(a)-displayDate(b));
}
function external(label,url){
 const a=create('a','fx-calendar-provider',label+' ↗');a.href=url;a.target='_blank';
 a.rel='noopener noreferrer';return a;
}
function card(item,index){
 const date=displayDate(item);
 const a=create('article','fx-card'+(index===0?' fx-card-feature':''));a.dataset.ordinal=String(index+1).padStart(2,'0');
 const top=create('div','fx-top');top.append(create('span','fx-sport',(labels[item.sport]||item.sport)+(item.category?' · '+item.category.toLocaleUpperCase('el-GR'):'')),
  create('span','fx-competition',item.competition||'Αγωνιστική αναμέτρηση'));a.append(top);
 const when=create('div','fx-when'),big=create('span','fx-date-large');
 big.append(create('strong','fx-date-number',format(date,{day:'2-digit'})),
  create('span','fx-date-month',format(date,{month:'long'})));
 const dayText=format(date,{weekday:'long'});
 const whenLabel=dateOnly(item.date)?dayText+' · Ώρα προς ανακοίνωση':
   format(date,{weekday:'long',hour:'2-digit',minute:'2-digit',hour12:false});
 when.append(big,create('span','fx-clock'+(dateOnly(item.date)?' fx-clock-tbd':''),whenLabel));
 a.append(when);
 const matchup=create('div','fx-teams');
 const left=create('div','fx-team'),right=create('div','fx-team');
 left.append(create('span','fx-team-label','ΓΗΠΕΔΟΥΧΟΣ'),create('strong','',item.home_team));
 right.append(create('span','fx-team-label','ΦΙΛΟΞΕΝΟΥΜΕΝΟΣ'),create('strong','',item.away_team));
 matchup.append(left,create('span','fx-versus','VS'),right);a.append(matchup);
 const bottom=create('div','fx-bottom');
 bottom.append(create('span','fx-venue',item.venue||'Γήπεδο: προς ανακοίνωση'));
 const menu=create('details','fx-calendar-actions');
 const summary=create('summary','','Στο δικό μου ημερολόγιο');menu.append(summary);
 const links=create('div','fx-calendar-menu');
 const ics=create('a','','Λήψη του αγώνα (.ics) ↗');
 ics.href='/calendar/events/'+encodeURIComponent(item.id)+'.ics';
 ics.download=item.id+'.ics';
 links.append(ics);
 const google=calendarLink(item,'google'),outlook=calendarLink(item,'outlook');
 if(google)links.append(external('Google Calendar',google));
 if(outlook)links.append(external('Outlook Calendar',outlook));
 if(!google)links.append(create('span','fx-calendar-note',
   dateOnly(item.date)?'Η ώρα δεν έχει οριστεί. Η προσθήκη γίνεται ως ολοήμερη υπενθύμιση, όχι ως ώρα αγώνα.':
   'Για Apple, Outlook ή εισαγωγή στο Google Calendar, χρησιμοποιήστε το αρχείο .ics. Δεν υποθέτουμε ώρα λήξης αγώνα.'));
 menu.append(links);bottom.append(menu);a.append(bottom);return a;
}
function render(){
 const visible=upcoming(),root=$('#fx-list');if(!root)return;
 root.replaceChildren(...visible.slice(0,6).map(card));
 $('#fx-empty').hidden=visible.length>0;
 root.hidden=!visible.length;
 $('#fx-status').textContent=visible.length
  ?'Οι επόμενοι '+Math.min(6,visible.length)+' επιβεβαιωμένοι αγώνες · ώρα Ελλάδας.'
  :'Δεν έχουν ανακοινωθεί ακόμη εγκεκριμένοι επόμενοι αγώνες για αυτή την επιλογή.';
 const anyUpcoming=fixtures.some(x=>x.status==='scheduled'&&inFuture(x));
 $('#fx-download').hidden=!anyUpcoming;
 $('#fx-subscribe').hidden=!anyUpcoming;
}
async function init(){
 const node=$('#upcoming-matches');if(!node)return;
 heritage();
 node.querySelectorAll('[data-fixture-sport]').forEach(button=>
  button.addEventListener('click',()=>{
   sport=button.dataset.fixtureSport;
   node.querySelectorAll('[data-fixture-sport]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
   render();
  }));
 try{
  const url=stage()?'/rebuild/data/match-schedule.json':'/assets/site/data/match-schedule.json';
  const response=await fetch(url,{cache:'no-cache'});
  if(!response.ok)throw Error('Match schedule unavailable');
  const data=await response.json();
  if(data?.schema_version!==1||data?.approval_policy!=='owner_approved_only'||data?.display_policy!=='home_only'||!Array.isArray(data.matches))
   throw Error('Invalid or unreviewed fixture list');
  fixtures=data.matches.filter(x=>x.approval?.status==='owner_approved'&&
   ['handball','volleyball'].includes(x.sport)&&displayDate(x)&&
   /αρχελα|archela/i.test(String(x.home_team||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')));
  render();
 }catch(error){
  console.warn('Match schedule fallback',error);
  $('#fx-list').replaceChildren();$('#fx-list').hidden=true;$('#fx-empty').hidden=false;
  $('#fx-status').textContent='Το επιβεβαιωμένο πρόγραμμα δεν είναι προσωρινά διαθέσιμο.';
  $('#fx-download').hidden=true;
  $('#fx-subscribe').hidden=true;
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
