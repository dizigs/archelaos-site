/* Hall of Fame: search, surname filters, sports, pagination and shared native popup. */
(function(){'use strict';
const $=s=>document.querySelector(s);
const state={people:[],category:'all',sport:'all',letter:'all',page:1,perPage:18,lang:'el'};
const greek='ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ'.split('');
const latin='ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const sports={
 athletics:['στιβ','athletics'],wrestling:['παλ','wrestling'],gymnastics:['ενοργαν','gymnastics'],
 handball:['χειροσφ','χαντμπολ','handball'],archery:['τοξοβολ','archery','archer'],
 swimming:['κολυμβ','swimming'],basketball:['καλαθοσφ','μπασκετ','basketball'],
 volleyball:['πετοσφ','βολει','volleyball'],shooting:['σκοποβολ','shooting'],
 waterpolo:['υδατοσφ','πολο','water polo'],tabletennis:['επιτραπεζ','table tennis'],
 weightlifting:['αρση βαρ','weightlifting']
};
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('el');
const isEn=()=>state.lang==='en';
const tr=(el,en)=>isEn()?en:el;
const field=(p,key)=>isEn()?(p[key+'_en']||p[key]||''):(p[key]||'');
const surname=name=>{const words=String(name||'').replace(/\([^)]*\)/g,' ').replace(/[.,]/g,' ').trim().split(/\s+/).filter(Boolean);return words.at(-1)||''};
const surnameKey=p=>norm(surname(field(p,'name')));
function isSport(p){if(state.sport==='all')return true;const content=norm([p.role,p.role_en].join(' '));return sports[state.sport].some(v=>content.includes(v))}
function filter(){
 const q=norm($('#hall-search').value.trim());
 return state.people.filter(p=>(state.category==='all'||p.category===state.category)&&isSport(p)
 &&(state.letter==='all'||surnameKey(p).startsWith(norm(state.letter)))
 &&(!q||norm([p.name,p.name_en,p.role,p.role_en].join(' ')).includes(q)))
 .sort((a,b)=>surnameKey(a).localeCompare(surnameKey(b),state.lang)||norm(field(a,'name')).localeCompare(norm(field(b,'name')),state.lang));
}
function el(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node}
function renderAlpha(){
 const parent=$('#hall-alpha');parent.replaceChildren();
 for(const letter of ['all',...(isEn()?latin:greek)]){
  const b=el('button',letter===state.letter?'selected':'',letter==='all'?tr('Α–Ω','A–Z'):letter);b.type='button';
  b.setAttribute('aria-pressed',String(letter===state.letter));
  b.addEventListener('click',()=>{state.letter=letter;state.page=1;render()});parent.append(b);
 }
}
function renderControls(){
 document.querySelectorAll('#hall-categories button').forEach(b=>{
  const yes=b.dataset.category===state.category;b.classList.toggle('selected',yes);b.setAttribute('aria-pressed',String(yes));
 });
 document.querySelectorAll('[data-el][data-en]').forEach(node=>node.textContent=node.getAttribute(isEn()?'data-en':'data-el'));
 $('#hall-language').textContent=isEn()?'EN / GR':'GR / EN';
 $('#hall-search').placeholder=tr('Όνομα ή άθλημα…','Name or sport…');
 document.documentElement.lang=state.lang;
 renderAlpha();
}
function personCard(p){
 const b=el('button','h-new-person');b.type='button';
 b.setAttribute('aria-label',tr('Προβολή βιογραφικού: ','View biography: ')+field(p,'name'));
 const top=el('span','h-new-person-top');
 const letter=surname(field(p,'name')).match(/\p{L}/u)?.[0]||'•';
 const mono=el('span','h-new-monogram',letter),arrow=el('span','h-new-arrow','↗');arrow.setAttribute('aria-hidden','true');
 top.append(mono,arrow);
 const details=el('span','h-new-person-details');
 details.append(el('strong','',field(p,'name')),el('small','',field(p,'role')));
 const bottom=el('span','h-new-person-bottom',tr('Δείτε το βιογραφικό','Read biography'));
 b.append(top,details,bottom);
 b.addEventListener('click',()=>window.ArchelaosBio.show(p));
 return b;
}
function paginate(data){
 const parent=$('#hall-pages');parent.replaceChildren();
 const total=Math.ceil(data.length/state.perPage);
 if(total<2)return;
 const b=(label,page,disabled,active)=>{
  const button=el('button','',label);button.type='button';button.disabled=disabled;
  if(active)button.setAttribute('aria-current','page');
  button.addEventListener('click',()=>{
   state.page=page;render();$('#hall-count').scrollIntoView({behavior:'instant',block:'start'});
  });parent.append(button);
 };
 b(tr('← Προηγούμενη','← Previous'),state.page-1,state.page<=1,false);
 const pages=[1,total,state.page-1,state.page,state.page+1].filter(n=>n>=1&&n<=total);
 const distinct=[...new Set(pages)].sort((a,b)=>a-b);let last=0;
 for(const p of distinct){if(p-last>1)parent.append(el('span','','…'));b(String(p),p,false,p===state.page);last=p}
 b(tr('Επόμενη →','Next →'),state.page+1,state.page>=total,false);
}
function render(){
 renderControls();
 const data=filter();const count=data.length;
 const totalPages=Math.max(1,Math.ceil(count/state.perPage));state.page=Math.min(state.page,totalPages);
 $('#hall-count').textContent=tr(count+' από '+state.people.length+' πρόσωπα · Αλφαβητικά κατά επώνυμο',count+' of '+state.people.length+' people · Sorted by surname');
 const parent=$('#hall-grid');parent.replaceChildren();
 if(!count)parent.append(el('p','h-new-empty',tr('Δεν βρέθηκαν πρόσωπα με αυτά τα κριτήρια.','No matching people found.')));
 else{
  const fragment=document.createDocumentFragment();
  for(const p of data.slice((state.page-1)*state.perPage,state.page*state.perPage))fragment.append(personCard(p));
  parent.append(fragment);
 }
 paginate(data);
 window.ArchelaosMotion?.observe(document);
}
function setLanguage(lang){
 state.lang=lang;
 try{localStorage.setItem('archelaos_lang',lang)}catch(_){}
 state.page=1;state.letter='all';render();
 document.dispatchEvent(new CustomEvent('archelaos:language-change',{detail:{lang}}));
}
async function init(){
 try{state.lang=localStorage.getItem('archelaos_lang')==='en'?'en':'el'}catch(_){}
 $('#hall-language').addEventListener('click',()=>setLanguage(isEn()?'el':'en'));
 $('#hall-search').addEventListener('input',()=>{state.page=1;render()});
 $('#hall-sport').addEventListener('change',e=>{state.sport=e.target.value;state.page=1;render()});
 $('#hall-reset').addEventListener('click',()=>{
  state.category='all';state.sport='all';state.letter='all';state.page=1;
  $('#hall-search').value='';$('#hall-sport').value='all';render();
 });
 $('#hall-categories').addEventListener('click',e=>{
  const b=e.target.closest('[data-category]');if(!b)return;state.category=b.dataset.category;state.page=1;render();
 });
 try{
  const data=await window.ArchelaosBio.load();
  state.people=data.people;$('#hall-total').textContent=String(state.people.length);render();
 }catch(err){
  console.error('Hall of Fame loading:',err);
  $('#hall-count').textContent=tr('Δεν ήταν δυνατή η φόρτωση του αρχείου βιογραφικών.','The biography archive could not be loaded.');
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
