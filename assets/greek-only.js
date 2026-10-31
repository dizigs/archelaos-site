/* Greek-only presentation: disables former bilingual controls without disturbing legacy page handlers. */
(()=>{'use strict';
 const css=document.createElement('style');css.id='arch-greek-only-css';
 css.textContent=`
 html [data-lang="en"],html [lang="en"]:not(html),[data-asn-language],.asn-lang-btn,.asn-mobile-lang,
 #language,#archAnniversaryLanguage,button.language,.lang-switch,.language-toggle,
 button[aria-label="Change language"],button[aria-label="Εναλλαγή γλώσσας / Switch language"]{
  display:none!important;visibility:hidden!important;
 }
 `;
 document.head.appendChild(css);
 const enforce=()=>{
   if(document.documentElement.lang!=='el')document.documentElement.lang='el';
   document.documentElement.setAttribute('data-initial-lang','el');
   if(document.body){
     document.body.classList.remove('lang-en');
     document.body.classList.add('lang-el');
   }
   try{if(localStorage.getItem('archelaos_lang')!=='el')localStorage.setItem('archelaos_lang','el')}catch(_){}
 };
 enforce();
 const watch=new MutationObserver(enforce);
 watch.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 const ready=()=>{
   enforce();
   if(document.body)watch.observe(document.body,{attributes:true,attributeFilter:['class']});
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
 window.addEventListener('pageshow',enforce);
})();
