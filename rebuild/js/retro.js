/* All four finals and original research notes are retained in retro.json. */
(()=>{'use strict';
const $=x=>document.querySelector(x);
const el=(tag,cls,t)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(t!==undefined)n.textContent=t;return n};
let matches=[],active;
function show(){
 const record=matches.find(m=>m.year===active);if(!record)return;
 $('#rt-years').querySelectorAll('button').forEach(b=>{
  const yes=Number(b.dataset.year)===active;b.setAttribute('aria-selected',String(yes));b.tabIndex=yes?0:-1;
 });
 const stage=$('#rt-stage');stage.replaceChildren();
 const article=el('article','rt-match'),board=el('div','rt-scoreboard');
 board.append(el('span','rt-final-label','ΚΥΠΕΛΛΟ ΕΛΛΑΔΑΣ ΧΑΝΤΜΠΟΛ ΑΝΔΡΩΝ · '+record.year));
 const teams=el('div','rt-teams');teams.append(el('span','','Γ.Α.Σ. Αρχέλαος'),el('strong','',record.score),el('span','',record.opponent));
 board.append(teams,el('div','rt-match-meta',record.date+' · '+record.venue),el('span','rt-outcome',record.outcome));
 const body=el('div','rt-match-body');
 body.append(el('h3','','Η ιστορία του αγώνα'),el('p','',record.summary));
 const full=el('button','rt-detail-open','Αναλυτικό φύλλο αγώνα ↗');full.type='button';
 full.addEventListener('click',()=>window.ArchelaosUI.openDialog({
  title:'Τελικός Κυπέλλου '+record.year,subtitle:'Γ.Α.Σ. Αρχέλαος · '+record.score+' · '+record.opponent,
  contentNode:window.ArchelaosArchive.fragment(record.originalHtml),
  closeLabel:'Κλείσιμο φύλλου αγώνα'
 }));
 body.append(full);article.append(board,body);stage.append(article);
}
async function init(){
 try{
  const res=await fetch('/rebuild/data/retro.json');if(!res.ok)throw Error('Retro HTTP '+res.status);
  const d=await res.json();if(!Array.isArray(d.matches)||d.matches.length!==4)throw Error('Four finals expected');
  matches=d.matches;const year=Number(new URLSearchParams(location.search).get('year'));active=matches.some(x=>x.year===year)?year:1990;
  const tabs=$('#rt-years');for(const m of matches){
   const btn=el('button','',m.year+(m.outcome==='Κυπελλούχος'?' ★':''));btn.type='button';btn.dataset.year=m.year;
   btn.addEventListener('click',()=>{active=m.year;show()});tabs.append(btn)
  }show();
 }catch(err){console.error('Retro archive:',err);$('#rt-stage').textContent='Αδυναμία φόρτωσης ιστορικών τελικών.'}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
