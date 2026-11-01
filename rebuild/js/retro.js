/* All four finals and original research notes are retained in retro.json. */
(()=>{'use strict';
const $=x=>document.querySelector(x);
const el=(tag,cls,t)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(t!==undefined)n.textContent=t;return n};
let matches=[],active;
function retroReport(record){
 // Preserve all original match evidence, but show only one language at a time.
 const parsed=new DOMParser().parseFromString(record.originalHtml,'text/html');
 const language=document.documentElement.lang?.startsWith('en')?'en':'el';
 parsed.querySelectorAll(language==='el'?'.rm-lang-en':'.rm-lang-el').forEach(node=>node.remove());
 // The original scoreboard is unstyled after safe HTML ingestion. Replace it
 // with a compact, real score display rather than showing an ugly duplicate.
 parsed.querySelectorAll('.rm-scoreboard').forEach(node=>node.remove());
 parsed.querySelectorAll('small').forEach(node=>{
  node.textContent=node.textContent.replace(/Τερματοφύλακας\s*\/\s*Goalkeeper/g,'Τερματοφύλακας');
 });
 const wrapper=el('div','rt-popup-report');
 const score=el('div','rt-popup-scoreboard');
 score.append(el('div','rt-popup-kicker','ΚΥΠΕΛΛΟ ΕΛΛΑΔΑΣ · ΤΕΛΙΚΟΣ '+record.year));
 const row=el('div','rt-popup-teams');
 const home=el('div','rt-popup-team');home.append(el('span','rt-popup-team-label','Γ.Α.Σ.'),el('strong','','Αρχέλαος'));
 const away=el('div','rt-popup-team');away.append(el('span','rt-popup-team-label','ΑΝΤΙΠΑΛΟΣ'),el('strong','',record.opponent));
 const result=el('strong','rt-popup-result',record.score);
 result.setAttribute('aria-label','Τελικό σκορ '+record.score);
 row.append(home,result,away);score.append(row);
 score.append(el('p','rt-popup-location',record.date+' · '+record.venue));
 score.append(el('span','rt-popup-outcome',record.outcome));
 wrapper.append(score,window.ArchelaosArchive.fragment(parsed.body.innerHTML));
 return wrapper;
}
function show(){
 const record=matches.find(m=>m.year===active);if(!record)return;
 $('#rt-years').querySelectorAll('button').forEach(b=>{
  const yes=Number(b.dataset.year)===active;b.setAttribute('aria-pressed',String(yes));b.tabIndex=yes?0:-1;
 });
 const stage=$('#rt-stage');stage.replaceChildren();
 const article=el('article','rt-match'),board=el('div','rt-scoreboard');
 board.append(el('span','rt-final-label','ΚΥΠΕΛΛΟ ΕΛΛΑΔΑΣ ΧΑΝΤΜΠΟΛ ΑΝΔΡΩΝ · '+record.year));
 const teams=el('div','rt-teams');teams.append(el('span','','Γ.Α.Σ. Αρχέλαος'),el('strong','',record.score),el('span','',record.opponent));
 board.append(teams,el('div','rt-match-meta',record.date+' · '+record.venue),el('span','rt-outcome',record.outcome));
 const body=el('div','rt-match-body');
 body.append(el('h3','','Η ιστορία του αγώνα'),el('p','',record.summary));
 const full=el('button','rt-detail-open','Αναλυτικό φύλλο αγώνα');full.type='button';
 full.addEventListener('click',()=>window.ArchelaosUI.openDialog({
  title:'Τελικός Κυπέλλου '+record.year,subtitle:'ΙΣΤΟΡΙΚΟ ΦΥΛΛΟ ΑΓΩΝΑ',
  contentNode:retroReport(record),
  closeLabel:'Κλείσιμο φύλλου αγώνα'
 }));
 body.append(full);article.append(board,body);stage.append(article);
 window.ArchelaosMotion?.observe(stage);
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
