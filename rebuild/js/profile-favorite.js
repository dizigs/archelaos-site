/* One shared favorites action on each canonical person profile page. */
(function(){'use strict';
function init(){
 const id=location.pathname.match(/\/people\/(arch-[a-z0-9-]+)\.html$/)?.[1];
 const parent=document.querySelector('.profile-actions');
 if(!id||!parent||!window.ArchelaosFavorites)return;
 if(parent.querySelector('[data-favorite-kind="person"]'))return;
 parent.append(window.ArchelaosFavorites.button('person',id));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
