/* Language selection for individual profile pages — follows the global navigation. */
(()=>{'use strict';const sections=[...document.querySelectorAll('[data-profile-language]')];if(!sections.length)return;
const apply=()=>{const en=document.documentElement.lang.toLowerCase().startsWith('en')||document.body.classList.contains('lang-en');const hasEnglish=sections.some(el=>el.dataset.profileLanguage==='en');for(const el of sections){el.hidden=hasEnglish?(el.dataset.profileLanguage!==(en?'en':'el')):(el.dataset.profileLanguage!=='el')}};
const saved=(()=>{try{return localStorage.getItem('archelaos_lang')}catch{return null}})();if(saved==='en'&&document.documentElement.lang!=='en'){document.documentElement.lang='en';document.body.classList.add('lang-en')}apply();
document.addEventListener('archelaos:language-change',apply);
new MutationObserver(apply).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
new MutationObserver(apply).observe(document.body,{attributes:true,attributeFilter:['class']});
})();
