/* Content-only migration layer shared by museum and historical board dialogs. */
(function(){'use strict';
function fragment(raw){
 const parsed=new DOMParser().parseFromString(String(raw||''),'text/html');
 parsed.querySelectorAll('script,style,iframe,object,embed,form,template,meta,link').forEach(el=>el.remove());
 const language=document.documentElement.lang.toLowerCase().startsWith('en')?'en':'el';
 for(const item of [...parsed.body.querySelectorAll('*')]){
  const configured=item.getAttribute('data-lang');
  if(configured&&configured!==language){item.remove();continue}
  if(item.classList.contains('lang-en')&&language!=='en'||item.classList.contains('lang-el')&&language!=='el'
    ||item.classList.contains('arch-collection-en')&&language!=='en'||item.classList.contains('arch-collection-el')&&language!=='el'){
    item.remove();
  }
 }
 parsed.body.querySelectorAll('button').forEach(node=>node.replaceWith(...node.childNodes));
 for(const node of [...parsed.body.querySelectorAll('*')]){
  for(const attr of [...node.attributes]){
   if(['href','src','alt','title','colspan','rowspan'].includes(attr.name))continue;
   node.removeAttribute(attr.name);
  }
  if(node.tagName==='A'){
   let href=node.getAttribute('href')||'';
   if(/^people\//.test(href)){href='/'+href;node.setAttribute('href',href)}
   try{
    const url=new URL(href,location.href);
    if(!['http:','https:'].includes(url.protocol))node.removeAttribute('href');
    else if(url.origin!==location.origin){node.setAttribute('rel','noopener noreferrer');node.setAttribute('target','_blank')}
   }catch(_){node.removeAttribute('href')}
  }
  if(node.tagName==='IMG'){
   const src=node.getAttribute('src')||'';
   if(/^\s*(javascript|data:text\/html):/i.test(src))node.remove();
  }
 }
 const wrapper=document.createElement('div');wrapper.className='arch-archive-content';
 wrapper.append(...parsed.body.childNodes);
 return wrapper;
}
window.ArchelaosArchive=Object.freeze({fragment});
})();