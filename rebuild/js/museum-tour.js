/* An optional, accessible guided walk through the actual museum sections.
 * Opens on explicit click, never on first visit or via timer. */
(()=>{'use strict';
 const steps=[
  {id:'museum-collections',title:'Οι συλλογές μας',description:'Εδώ ξεκινά το ταξίδι: πρόσωπα του Hall of Fame, 70 Στιγμές και ιστορίες του συλλόγου.'},
  {id:'museum-exhibits',title:'Σταθμοί της ιστορίας',description:'Εξερεύνησε εκθέματα και σημαντικά γεγονότα. Πάτησε μια καρτέλα για να διαβάσεις το αρχειακό κείμενο.'},
  {id:'museum-interviews',title:'Οι Φωνές του Αρχέλαου',description:'Η συλλογή συνεντεύξεων και μαρτυριών βρίσκεται σε ξεχωριστή σελίδα. Πάτησε τη μεγάλη κάρτα για να την εξερευνήσεις.'},
  {id:'tmimata',title:'Κάθε άθλημα έχει ιστορία',description:'Η μακρόστενη κάρτα οδηγεί στη σελίδα των Τμημάτων, όπου θα βρεις κάθε άθλημα και την ιστορία του.'}
 ];
 const start=document.getElementById('mu-tour-start');
 if(!start)return;
 let panel,current=-1,lastFocus=null;
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 function make(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e}
 function panelOnce(){
  if(panel)return panel;
  panel=make('dialog','mu-tour');panel.id='mu-tour';panel.setAttribute('aria-labelledby','mu-tour-title');
  const top=make('div','mu-tour-top');
  top.append(make('span','mu-tour-brand','Γ.Α.Σ. «Ο ΑΡΧΕΛΑΟΣ» · ΨΗΦΙΑΚΟ ΜΟΥΣΕΙΟ'));
  const close=make('button','mu-tour-close','×');close.type='button';close.setAttribute('aria-label','Κλείσιμο ξενάγησης');close.addEventListener('click',finish);top.append(close);
  const count=make('p','mu-tour-count');count.id='mu-tour-count';
  const progress=make('div','mu-tour-progress');progress.setAttribute('aria-hidden','true');
  for(let i=0;i<steps.length;i++)progress.append(make('span','mu-tour-dot'));
  const title=make('h2','mu-tour-title');title.id='mu-tour-title';
  const desc=make('p','mu-tour-desc');desc.id='mu-tour-description';panel.setAttribute('aria-describedby',desc.id);
  const actions=make('div','mu-tour-actions');
  const skip=make('button','mu-tour-skip','Τέλος ξενάγησης');skip.type='button';skip.addEventListener('click',finish);
  const back=make('button','mu-tour-back','Πίσω');back.type='button';back.addEventListener('click',()=>go(current-1));
  const next=make('button','mu-tour-next','Επόμενο');next.type='button';next.addEventListener('click',()=>current===steps.length-1?finish():go(current+1));
  actions.append(skip,back,next);
  panel.append(top,count,progress,title,desc,actions);
  document.body.append(panel);
  panel.addEventListener('close',cleanup);
  panel.addEventListener('cancel',event=>{event.preventDefault();finish()});
  return panel;
 }
 function cleanup(){
  document.querySelectorAll('.mu-tour-focus').forEach(x=>x.classList.remove('mu-tour-focus'));
  if(lastFocus&&lastFocus.isConnected)lastFocus.focus({preventScroll:true});
  lastFocus=null;current=-1;
 }
 function finish(){if(panel?.open)panel.close();else cleanup()}
 function go(i){
  if(i<0||i>=steps.length)return;
  current=i;
  const info=steps[i],section=document.getElementById(info.id);
  if(!section){finish();return}
  document.querySelectorAll('.mu-tour-focus').forEach(x=>x.classList.remove('mu-tour-focus'));
  const anchor=section.querySelector('h2')||section.querySelector('.mu-sports-link')||section;
  anchor.classList.add('mu-tour-focus');
  panel.querySelector('#mu-tour-count').textContent='ΣΤΑΘΜΟΣ '+String(i+1).padStart(2,'0')+' / '+String(steps.length).padStart(2,'0');
  panel.querySelector('#mu-tour-title').textContent=info.title;
  panel.querySelector('#mu-tour-description').textContent=info.description;
  [...panel.querySelectorAll('.mu-tour-dot')].forEach((dot,n)=>dot.classList.toggle('is-active',n<=i));
  panel.querySelector('.mu-tour-back').disabled=i===0;
  panel.querySelector('.mu-tour-next').textContent=i===steps.length-1?'Ολοκλήρωση':'Επόμενο';
  const header=document.querySelector('.arch-header')?.getBoundingClientRect().height||80;
  const top=Math.max(0,section.getBoundingClientRect().top+window.scrollY-header-18);
  window.scrollTo({top,behavior:reduced()?'instant':'smooth'});
  panel.querySelector('.mu-tour-next').focus({preventScroll:true});
 }
 start.addEventListener('click',()=>{
  lastFocus=document.activeElement;
  const dialog=panelOnce();
  if(!dialog.open)dialog.show();
  go(0);
 });
})();
