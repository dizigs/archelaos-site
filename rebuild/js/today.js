/* Archive-inspired daily feature: only exact curated date matches claim "Σαν σήμερα". */
(function(){'use strict';
async function init(){
 const title=document.querySelector('#new-today-title'),link=document.querySelector('#new-today-link');
 if(!title||!link)return;
 try{
  const [calendarResponse,momentResponse]=await Promise.all([
   fetch('/rebuild/data/on-this-day.json'),
   fetch('/rebuild/data/moments.json')
  ]);
  if(!calendarResponse.ok||!momentResponse.ok)throw Error('Archive unavailable');
  const calendar=await calendarResponse.json(),archive=await momentResponse.json();
  if(!Array.isArray(calendar.events)||archive.moments?.length!==70)throw Error('Incomplete calendar');
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const values=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  const today=values.month+'-'+values.day;
  const events=calendar.events.filter(event=>event.day===today);
  const yearDays=Math.floor((Date.UTC(Number(values.year),Number(values.month)-1,Number(values.day))-Date.UTC(Number(values.year),0,1))/86400000);
  const chosen=events.length?events[yearDays%events.length].momentId:archive.moments[yearDays%archive.moments.length].id;
  const record=archive.moments.find(x=>x.id===chosen);
  if(!record)throw Error('Moment not found');
  document.querySelector('#new-today-heading').innerHTML=events.length?'Σαν <em>σήμερα.</em>':'Μια στιγμή από την <em>ιστορία.</em>';
  document.querySelector('#new-today-date').textContent=events.length?Number(values.day)+' '+new Intl.DateTimeFormat('el-GR',{timeZone:'Europe/Athens',month:'long'}).format(new Date(Date.UTC(2020,Number(values.month)-1,1))):'ΑΠΟ ΤΟ ΑΡΧΕΙΟ';
  title.textContent=record.title;
  document.querySelector('#new-today-year').textContent=record.year;
  link.href=window.ArchelaosRoutes?.toStage('/70-stigmes.html#moment-'+record.id)||'/70-stigmes.html#moment-'+record.id;
 }catch(err){console.warn('Daily archive unavailable:',err)}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
