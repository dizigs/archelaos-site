/* The voices of Archelaos: ten archival texts restored from the prior public
 * museum folio. They are selected excerpts, NOT newly verified verbatim minutes.
 * Plain buttons, no decorative arrow widgets, no modal collisions. */
(function(){'use strict';
 const root=document.querySelector('#archive-voices');if(!root)return;
 const list=root.querySelector('#voice-tabs'),reader=root.querySelector('#voice-reader');
 const year=root.querySelector('#voice-year'),watermark=root.querySelector('#voice-watermark'),
       title=root.querySelector('#voice-title'),intro=root.querySelector('#voice-intro'),
       quote=root.querySelector('#voice-quote'),count=root.querySelector('#voice-count'),
       note=root.querySelector('#voice-note');
 const choose=(item,index)=>{
  [...list.querySelectorAll('button')].forEach((b,i)=>{
   b.setAttribute('aria-pressed',String(i===index));
   b.classList.toggle('is-active',i===index);
  });
  year.textContent=item.year;watermark.textContent=item.year;
  title.textContent=item.titleEL;intro.textContent=item.introEL;
  quote.textContent='«'+item.quoteEL+'»';count.textContent=String(index+1).padStart(2,'0')+' / 10';
 };
 async function init(){
  try{
   const path=location.pathname.startsWith('/rebuild/')?'/rebuild/data/archive-voices.json':'/assets/site/data/archive-voices.json';
   const result=await fetch(path);if(!result.ok)throw Error('HTTP '+result.status);
   const data=await result.json();
   if(data.schema_version!==1||!Array.isArray(data.excerpts)||data.excerpts.length!==10)throw Error('Invalid voice archive');
   const records=data.excerpts;const buttons=[];
   records.forEach((item,i)=>{
    const b=document.createElement('button');b.type='button';b.className='voice-tab';
    b.setAttribute('aria-controls','voice-reader');b.setAttribute('aria-pressed',String(i===0));
    const num=document.createElement('span');num.className='voice-tab-number';num.textContent=String(i+1).padStart(2,'0');
    const yr=document.createElement('strong');yr.textContent=item.year;
    const name=document.createElement('span');name.className='voice-tab-title';name.textContent=item.titleEL;
    b.append(num,yr,name);
    b.addEventListener('click',()=>choose(item,i));
    b.addEventListener('keydown',event=>{
     const move=event.key==='ArrowDown'||event.key==='ArrowRight'?1:event.key==='ArrowUp'||event.key==='ArrowLeft'?-1:0;
     if(!move&&event.key!=='Home'&&event.key!=='End')return;
     event.preventDefault();
     const next=event.key==='Home'?0:event.key==='End'?records.length-1:(i+move+records.length)%records.length;
     buttons[next].focus();choose(records[next],next);
    });
    buttons.push(b);list.append(b);
   });
   reader.hidden=false;choose(records[0],0);
   note.textContent='Ιστορικά αποσπάσματα όπως παρουσιάζονταν στο προηγούμενο ψηφιακό αρχείο. Η αντιπαραβολή με τα πρωτότυπα τεκμήρια συνεχίζεται.';
  }catch(error){
   console.warn('Could not load archival voices',error);
   note.textContent='Η συλλογή ιστορικών αποσπασμάτων δεν είναι προσωρινά διαθέσιμη.';
  }
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();