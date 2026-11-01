/* Language selection for individual profile pages — follows the global navigation. */
(()=>{'use strict';const sections=[...document.querySelectorAll('[data-profile-language]')];if(!sections.length)return;
const title=document.querySelector('.profile-intro h1[data-name-el]');
const labels=document.querySelectorAll('[data-profile-el][data-profile-en]');
const apply=()=>{const en=document.documentElement.lang.toLowerCase().startsWith('en')||document.body.classList.contains('lang-en');if(title)title.textContent=title.dataset[en?'nameEn':'nameEl']||title.dataset.nameEl;
for(const node of labels)node.textContent=node.getAttribute(en?'data-profile-en':'data-profile-el');
const hasEnglish=sections.some(el=>el.dataset.profileLanguage==='en');for(const el of sections){el.hidden=hasEnglish?(el.dataset.profileLanguage!==(en?'en':'el')):(el.dataset.profileLanguage!=='el')}};
const saved=(()=>{try{return localStorage.getItem('archelaos_lang')}catch{return null}})();if(saved==='en'&&document.documentElement.lang!=='en'){document.documentElement.lang='en';document.body.classList.add('lang-en')}apply();
document.addEventListener('archelaos:language-change',apply);
new MutationObserver(apply).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
new MutationObserver(apply).observe(document.body,{attributes:true,attributeFilter:['class']});
})();
