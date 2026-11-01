
/* ARCHELAOS ACCESSIBILITY SUITE v1.3 — no tracking, external APIs or dependencies. */
(function(){
 'use strict';
 if(window.__ARCH_A11Y_INITIALIZED__)return;
 window.__ARCH_A11Y_INITIALIZED__=true;
 var doc=document, html=doc.documentElement;
 var defaults={scale:100,theme:'default',readable:false,space:false,letter:false,word:false,left:false,links:false,linkHighlight:false,headings:false,bigTargets:false,cursor:false,grayscale:false,lowSaturation:false,reduceMotion:false,simple:false,guide:false};
 var state=Object.assign({},defaults);
 var key='archelaos_accessibility_v1';
 try {var saved=JSON.parse(localStorage.getItem(key)||'null');if(saved&&typeof saved==='object')Object.keys(defaults).forEach(function(k){if(Object.prototype.hasOwnProperty.call(saved,k)&&typeof saved[k]===typeof defaults[k])state[k]=saved[k];});}catch(e){}
 state.scale=Math.min(200,Math.max(100,Math.round(Number(state.scale)/10)*10||100));
 if(!['default','dark','light'].includes(state.theme))state.theme='default';
 var tr={
  el:{launch:'Προσβασιμότητα',title:'Ρυθμίσεις προσβασιμότητας',subtitle:'Γ.Α.Σ. «Ο Αρχέλαος» · Προσαρμογή προβολής',close:'Κλείσιμο',note:'Οι ρυθμίσεις ισχύουν στις σελίδες του Αρχέλαου που διαθέτουν αυτό το εργαλείο και αποθηκεύονται μόνο σε αυτή τη συσκευή.',presets:'Γρήγορες επιλογές',vision:'Ευκολότερη όραση',read:'Άνετη ανάγνωση',calm:'Χωρίς κινήσεις',appearance:'Εμφάνιση και κείμενο',font:'Μέγεθος γραμμάτων',contrast:'Χρωματική αντίθεση',normal:'Κανονική',dark:'Μαύρο / λευκό',light:'Λευκό / μαύρο',readable:'Απλή γραμματοσειρά',space:'Μεγαλύτερο διάστιχο',letter:'Απόσταση χαρακτήρων',word:'Απόσταση λέξεων',left:'Αριστερή στοίχιση',links:'Υπογράμμιση συνδέσμων',linkHighlight:'Πλαίσια γύρω από συνδέσμους',headings:'Επισήμανση τίτλων',bigTargets:'Μεγαλύτερα κουμπιά',cursor:'Ευδιάκριτος δείκτης',grayscale:'Ασπρόμαυρη προβολή',lowSaturation:'Ήπια χρώματα',motion:'Πλοήγηση και συγκέντρωση',reduceMotion:'Χωρίς κινούμενα εφέ',simple:'Απλή προβολή (χωρίς κεφαλίδα/υποσέλιδο)',guide:'Οδηγός γραμμής ανάγνωσης',tools:'Εργαλεία περιήγησης',listHeadings:'Κατάλογος τίτλων',listLinks:'Κατάλογος συνδέσμων',listImages:'Περιγραφές εικόνων',listen:'Άκουσε το κείμενο',pause:'Παύση',resume:'Συνέχεια',stop:'Διακοπή',print:'Εκτύπωση',reset:'Επαναφορά όλων',saved:'Οι προτιμήσεις εφαρμόστηκαν.',resetDone:'Οι ρυθμίσεις επανήλθαν.',noItems:'Δεν βρέθηκαν καταχωρίσεις σε αυτή τη σελίδα.',unavailable:'Η εκφώνηση δεν υποστηρίζεται από αυτόν τον browser.',speechStart:'Η ανάγνωση ξεκίνησε. Για να τη σταματήσεις, πάτησε Διακοπή.',speechStop:'Η ανάγνωση σταμάτησε.',chooseText:'Επίλεξε πρώτα κείμενο ή χρησιμοποίησε το προεπιλεγμένο περιεχόμενο.',imageAlt:'Εικόνα χωρίς περιγραφικό κείμενο — χρειάζεται έλεγχος.',navGo:'Μετάβαση',skip:'Παράκαμψη πλοήγησης — κύριο περιεχόμενο',easyNav:'Εύκολη περιήγηση',easyHome:'Αρχική',easyMuseum:'Μουσείο',easyMoments:'70 Στιγμές',easyPeople:'Hall of Fame',easyBoard:'Διοίκηση',easySponsors:'Χορηγοί',noteWCAG:'Το πάνελ δεν υποκαθιστά τον έλεγχο WCAG 2.2 AA με πληκτρολόγιο και αναγνώστη οθόνης.',selected:'Το επιλεγμένο κείμενο θα διαβαστεί. Διαφορετικά, θα ακουστεί το κύριο περιεχόμενο της σελίδας.',noSpeech:'Δεν υπάρχει διαθέσιμο κείμενο για ανάγνωση.'},
  en:{launch:'Accessibility',title:'Accessibility settings',subtitle:'G.A.S. Archelaos · Display preferences',close:'Close',note:'Preferences apply to Archelaos pages with this tool and are stored only on this device.',presets:'Quick presets',vision:'Better visibility',read:'Easy reading',calm:'Reduced motion',appearance:'Display and text',font:'Text size',contrast:'Color contrast',normal:'Default',dark:'Black / white',light:'White / black',readable:'Plain typeface',space:'More line spacing',letter:'Letter spacing',word:'Word spacing',left:'Left align text',links:'Underline links',linkHighlight:'Outline links',headings:'Highlight headings',bigTargets:'Larger controls',cursor:'High visibility pointer',grayscale:'Grayscale display',lowSaturation:'Reduced saturation',motion:'Navigation and focus',reduceMotion:'Reduce animations',simple:'Simplified view (no header/footer)',guide:'Reading line guide',tools:'Navigation tools',listHeadings:'Headings list',listLinks:'Links list',listImages:'Image descriptions',listen:'Read aloud',pause:'Pause',resume:'Resume',stop:'Stop',print:'Print',reset:'Reset all',saved:'Your preferences have been applied.',resetDone:'Settings have been reset.',noItems:'No matching items on this page.',unavailable:'Speech synthesis is unavailable in this browser.',speechStart:'Reading started. Select Stop to end.',speechStop:'Reading stopped.',chooseText:'Select text, or use the page content.',imageAlt:'Image without description — requires review.',navGo:'Go to',skip:'Skip navigation — main content',easyNav:'Easy navigation',easyHome:'Home',easyMuseum:'Museum',easyMoments:'70 Moments',easyPeople:'Hall of Fame',easyBoard:'Board',easySponsors:'Sponsors',noteWCAG:'This panel is not a substitute for keyboard and screen reader WCAG 2.2 AA testing.',selected:'Selected text is read first. Otherwise the main page content is read.',noSpeech:'There is no text to read.'}
 };
 function lang(){return (html.lang||'').toLowerCase().startsWith('en')?'en':'el';}
 function t(k){return tr[lang()][k]||k;}
 function save(){try{localStorage.setItem(key,JSON.stringify(state));}catch(e){}}
 function cls(c,v){html.classList.toggle('arch-a11y-'+c,!!v);}
 function apply(){
   html.style.setProperty('--arch-a11y-font-scale',String(state.scale/100));
   cls('scale',state.scale!==100);cls('readable',state.readable);cls('spacing',state.space||state.letter||state.word);
   html.style.setProperty('--arch-a11y-line',state.space?'1.95':'1.65');
   html.style.setProperty('--arch-a11y-letter',state.letter?'.065em':'0em');
   html.style.setProperty('--arch-a11y-word',state.word?'.16em':'0em');
   ['left','links','link-highlight','headings','big-targets','cursor','grayscale','low-saturation','no-motion','simple','reading-guide'].forEach(function(c,i){var props=['left','links','linkHighlight','headings','bigTargets','cursor','grayscale','lowSaturation','reduceMotion','simple','guide'];cls(c,state[props[i]]);});
   cls('contrast-dark',state.theme==='dark');cls('contrast-light',state.theme==='light');
   if(state.reduceMotion){doc.querySelectorAll('video').forEach(function(v){try{v.pause();}catch(e){}});doc.querySelectorAll('.arch-polish-reveal,[class*="reveal"],.arch-whisper').forEach(function(v){v.classList.add('is-visible');});}
   var out=doc.getElementById('arch-a11y-scale-output');if(out)out.textContent=state.scale+'%';
 }
 apply();
 function el(tag,attrs,txt){var e=doc.createElement(tag);if(attrs)Object.keys(attrs).forEach(function(k){e.setAttribute(k,attrs[k]);});if(txt!==undefined)e.textContent=txt;return e;}
 function init(){
  if(doc.getElementById('arch-a11y-root'))return;
  var target=doc.querySelector('main')||doc.getElementById('home')||doc.querySelector('section');
  if(target){if(!target.id)target.id='arch-main-content';var skip=el('a',{'class':'arch-a11y-skip',href:'#'+target.id},t('skip'));doc.body.insertBefore(skip,doc.body.firstChild);}
  var simpleNav=el('nav',{id:'arch-a11y-easy-nav','class':'arch-a11y-easy-nav','aria-label':t('easyNav')});
  var simpleTitle=el('strong',null,t('easyNav'));
  simpleNav.appendChild(simpleTitle);
  var simpleLinks=el('div',{'class':'arch-a11y-easy-links'});
  [['index.html','easyHome'],['history.html','easyMuseum'],['70-stigmes.html','easyMoments'],['hall-of-fame.html','easyPeople'],['board.html','easyBoard'],['sponsors.html','easySponsors']].forEach(function(item){
    var link=el('a',{href:item[0],'data-a11y-easy':item[1]},t(item[1]));
    var page=(location.pathname.split('/').pop()||'index.html');
    if(page===item[0])link.setAttribute('aria-current','page');
    simpleLinks.appendChild(link);
  });
  simpleNav.appendChild(simpleLinks);doc.body.insertBefore(simpleNav,doc.body.firstChild);
  var root=el('div',{id:'arch-a11y-root','class':'arch-a11y-ui'});
  root.innerHTML='<button title="Προσβασιμότητα / Accessibility" id="arch-a11y-launch" type="button" data-a11y-aria="launch" aria-haspopup="dialog" aria-controls="arch-a11y-panel" aria-expanded="false"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="4" r="2"/><path d="M4 9h16M12 7v14M8 21l4-7 4 7"/></svg><span data-a11y-i18n="launch"></span></button>\n'+
  '<dialog id="arch-a11y-panel" aria-labelledby="arch-a11y-title" aria-describedby="arch-a11y-description"><div class="arch-a11y-head"><div><h2 id="arch-a11y-title" data-a11y-i18n="title"></h2><p class="arch-a11y-sub" data-a11y-i18n="subtitle"></p></div><button class="arch-a11y-close" type="button" data-a11y-action="close" data-a11y-aria="close" aria-label="Κλείσιμο">×</button></div><div class="arch-a11y-content"><p id="arch-a11y-description" class="arch-a11y-note" data-a11y-i18n="note"></p>\n'+
  '<fieldset><legend data-a11y-i18n="presets"></legend><div class="arch-a11y-actions"><button type="button" class="arch-a11y-action" data-a11y-action="vision" data-a11y-i18n="vision"></button><button type="button" class="arch-a11y-action" data-a11y-action="reading" data-a11y-i18n="read"></button><button type="button" class="arch-a11y-action" data-a11y-action="calm" data-a11y-i18n="calm"></button></div></fieldset>\n'+
  '<fieldset><legend data-a11y-i18n="appearance"></legend><div class="arch-a11y-range"><label for="arch-a11y-scale" data-a11y-i18n="font"></label><output id="arch-a11y-scale-output" for="arch-a11y-scale">100%</output></div><input id="arch-a11y-scale" name="scale" type="range" min="100" max="200" step="10" value="100"/><div style="margin-top:10px"><label for="arch-a11y-theme" data-a11y-i18n="contrast"></label><select id="arch-a11y-theme" name="theme"><option value="default" data-a11y-i18n="normal"></option><option value="dark" data-a11y-i18n="dark"></option><option value="light" data-a11y-i18n="light"></option></select></div><div class="arch-a11y-grid" data-a11y-checks="readable space letter word left links linkHighlight headings bigTargets cursor grayscale lowSaturation"></div></fieldset>\n'+
  '<fieldset><legend data-a11y-i18n="motion"></legend><div class="arch-a11y-grid" data-a11y-checks="reduceMotion simple guide"></div></fieldset>\n'+
  '<fieldset><legend data-a11y-i18n="tools"></legend><div class="arch-a11y-actions"><button class="arch-a11y-action" type="button" data-a11y-action="headings" data-a11y-i18n="listHeadings"></button><button class="arch-a11y-action" type="button" data-a11y-action="links" data-a11y-i18n="listLinks"></button><button class="arch-a11y-action" type="button" data-a11y-action="images" data-a11y-i18n="listImages"></button><button class="arch-a11y-action arch-a11y-primary" type="button" data-a11y-action="speech" data-a11y-i18n="listen"></button><button class="arch-a11y-action" type="button" data-a11y-action="pause" data-a11y-i18n="pause"></button><button class="arch-a11y-action" type="button" data-a11y-action="resume" data-a11y-i18n="resume"></button><button class="arch-a11y-action" type="button" data-a11y-action="stop" data-a11y-i18n="stop"></button><button class="arch-a11y-action" type="button" data-a11y-action="print" data-a11y-i18n="print"></button></div><p class="arch-a11y-muted" data-a11y-i18n="selected"></p><ol id="arch-a11y-tools-list" class="arch-a11y-tools-list" aria-live="polite" aria-label="Navigation results" hidden></ol></fieldset>\n'+
  '<button class="arch-a11y-action" type="button" data-a11y-action="reset" data-a11y-i18n="reset"></button><p id="arch-a11y-status" class="arch-a11y-status" role="status" aria-live="polite"></p><p class="arch-a11y-muted" data-a11y-i18n="noteWCAG"></p></div></dialog>';
  doc.body.appendChild(root);
  var guide=el('div',{id:'arch-a11y-guide','aria-hidden':'true'});doc.body.appendChild(guide);
  var panel=doc.getElementById('arch-a11y-panel'),launch=doc.getElementById('arch-a11y-launch'),status=doc.getElementById('arch-a11y-status');
  var keys=['readable','space','letter','word','left','links','linkHighlight','headings','bigTargets','cursor','grayscale','lowSaturation','reduceMotion','simple','guide'];
  root.querySelectorAll('[data-a11y-checks]').forEach(function(parent){parent.getAttribute('data-a11y-checks').split(' ').forEach(function(k){if(!keys.includes(k))return;var lb=el('label'),cb=el('input',{type:'checkbox',name:k});lb.appendChild(cb);lb.appendChild(el('span',{'data-a11y-i18n':k}));parent.appendChild(lb);});});
  function translate(){root.querySelectorAll('[data-a11y-i18n]').forEach(function(n){n.textContent=t(n.getAttribute('data-a11y-i18n'));});root.querySelectorAll('[data-a11y-aria]').forEach(function(n){n.setAttribute('aria-label',t(n.getAttribute('data-a11y-aria')));});var sk=doc.querySelector('.arch-a11y-skip');if(sk)sk.textContent=t('skip');launch.title=t('launch');simpleNav.setAttribute('aria-label',t('easyNav'));simpleTitle.textContent=t('easyNav');simpleNav.querySelectorAll('[data-a11y-easy]').forEach(function(n){n.textContent=t(n.getAttribute('data-a11y-easy'));});}
  translate();
  new MutationObserver(translate).observe(html,{attributes:true,attributeFilter:['lang']});
  function sync(){root.querySelectorAll('input[type=checkbox]').forEach(function(n){n.checked=!!state[n.name];});root.querySelector('#arch-a11y-scale').value=state.scale;root.querySelector('#arch-a11y-theme').value=state.theme;apply();}
  function notify(k){status.textContent=t(k);}
  function update(k,v){if(!(k in defaults))return;state[k]=v;apply();save();notify('saved');}
  function open(){translate();sync();panel.showModal();launch.setAttribute('aria-expanded','true');panel.querySelector('.arch-a11y-close').focus();}
  function close(){panel.close();}
  launch.addEventListener('click',open);
  panel.addEventListener('close',function(){launch.setAttribute('aria-expanded','false');launch.focus();});
  panel.addEventListener('click',function(e){if(e.target===panel)close();});
  panel.addEventListener('change',function(e){var n=e.target;if(n.matches('input[type=checkbox]'))update(n.name,n.checked);if(n.name==='theme')update('theme',n.value);});
  panel.addEventListener('input',function(e){if(e.target.name==='scale')update('scale',Number(e.target.value));});
  function preset(p){if(p==='vision')Object.assign(state,{scale:140,theme:'dark',readable:true,links:true,headings:true,bigTargets:true});if(p==='reading')Object.assign(state,{scale:120,readable:true,space:true,letter:true,word:true,left:true,links:true,reduceMotion:true});if(p==='calm')Object.assign(state,{reduceMotion:true,guide:false});save();sync();notify('saved');}
  function listOf(kind){var list=doc.getElementById('arch-a11y-tools-list');list.replaceChildren();var scope=doc.querySelector('main')||doc.body;var selector=kind==='headings'?'h1,h2,h3,h4,h5,h6':kind==='links'?'a[href]':'img';var nodes=Array.from(scope.querySelectorAll(selector)).filter(function(n){return !n.closest('#arch-a11y-root')&&!n.closest('[hidden]')&&!n.closest('[aria-hidden="true"]');}).slice(0,240);
   nodes.forEach(function(n,i){var li=el('li');if(kind==='images'){li.textContent=(i+1)+'. '+(n.getAttribute('alt')||t('imageAlt'));}else{var label=(n.textContent||n.getAttribute('aria-label')||'').replace(/\s+/g,' ').trim();if(!label)return;var a=el('a',{href:'#'},(i+1)+'. '+label.substring(0,145));a.addEventListener('click',function(ev){ev.preventDefault();close();n.scrollIntoView({block:'center',behavior:state.reduceMotion?'instant':'auto'});if(!n.hasAttribute('tabindex')&&!/^(A|BUTTON|INPUT)$/.test(n.tagName))n.setAttribute('tabindex','-1');n.focus({preventScroll:true});});li.appendChild(a);}list.appendChild(li);});
   if(!list.children.length)list.appendChild(el('li',null,t('noItems')));list.hidden=false;list.scrollTop=0;
  }
  var speechSupported=('speechSynthesis' in window)&&('SpeechSynthesisUtterance' in window),queue=[],speechActive=false;
  function stopSpeech(){if(speechSupported)window.speechSynthesis.cancel();speechActive=false;queue=[];}
  function readNext(){if(!speechActive||!queue.length){speechActive=false;return;}var u=new SpeechSynthesisUtterance(queue.shift());u.lang=lang()==='en'?'en-US':'el-GR';u.rate=.88;u.onend=readNext;u.onerror=function(){speechActive=false;};window.speechSynthesis.speak(u);}
  function speak(){if(!speechSupported){notify('unavailable');return;}stopSpeech();var scope=doc.querySelector('main')||doc.body;var selected=(window.getSelection&&String(window.getSelection()).trim())||'';var content=selected||Array.from(scope.querySelectorAll('h1,h2,h3,p,li,blockquote')).filter(function(n){return !n.closest('#arch-a11y-root')&&!n.closest('[hidden]')&&n.getAttribute('aria-hidden')!=='true'&&n.offsetParent!==null;}).map(function(n){return(n.textContent||'').trim();}).filter(Boolean).join('. ');content=content.substring(0,22000);if(!content){notify('noSpeech');return;}
   var pieces=content.match(/[\s\S]{1,220}(?:\s|$)/g)||[content];queue=pieces.map(function(s){return s.trim();}).filter(Boolean);speechActive=true;notify('speechStart');readNext();
  }
  panel.addEventListener('click',function(e){var b=e.target.closest('[data-a11y-action]');if(!b)return;var action=b.getAttribute('data-a11y-action');
   if(action==='close')close();else if(action==='reset'){Object.assign(state,defaults);save();sync();notify('resetDone');stopSpeech();}
   else if(action==='vision'||action==='reading'||action==='calm')preset(action);
   else if(action==='headings'||action==='links'||action==='images')listOf(action);
   else if(action==='speech')speak();else if(action==='stop'){stopSpeech();notify('speechStop');}
   else if(action==='pause'&&speechSupported)window.speechSynthesis.pause();else if(action==='resume'&&speechSupported)window.speechSynthesis.resume();
   else if(action==='print')window.print();
  });
  doc.addEventListener('pointermove',function(e){if(!state.guide)return;guide.style.top=Math.max(0,e.clientY-20)+'px';},{passive:true});
  window.addEventListener('pagehide',stopSpeech);sync();
 }
 if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

