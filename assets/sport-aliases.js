/* Sport terminology used by the unified site search and the news reader. */
(function(){'use strict';if(window.ArchelaosSportSearch)return;
const norm=s=>String(s||'').toLocaleLowerCase('el').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ς/g,'σ').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const sports=[
 ['χειροσφαιριση','χειροσφαιρισης','χαντμπολ','χαντ μπολ','χαντμπωλ','handball','hand ball'],
 ['καλαθοσφαιριση','καλαθοσφαιρισης','μπασκετ','μπασκετμπολ','basketball','basket ball','basket'],
 ['πετοσφαιριση','πετοσφαιρισης','βολει','βολευ','volleyball','volley ball'],
 ['παλη','παλης','ελληνορωμαικη','ελευθερα','ελληνορωμαικη παλη','ελευθερα παλη','wrestling','greco roman','freestyle wrestling'],
 ['τοξοβολια','τοξοβολιας','τοξοτες','τοξοτης','archery','archer','recurve','barebow'],
 ['σκοποβολια','σκοποβολιας','σκοποβολη','σκοποβολης','σκοπευτικο','σκοπευτης','shooting','sport shooting','air rifle','air pistol'],
 ['στιβος','στιβου','στιβο','κλασικος αθλητισμος','αθλητισμος στιβου','athletics','track and field','track field'],
 ['ενοργανη','ενοργανης','ενοργανη γυμναστικη','artistic gymnastics','artistic gym','gymnastics'],
 ['κολυμβηση','κολυμβησης','swimming','swim'],
 ['τεχνικη κολυμβηση','τεχνικης κολυμβησης','finswimming','fin swimming','finswim','κολυμβηση με πεδιλα'],
 ['αρση βαρων','αρσης βαρων','αρσηβαρων','weightlifting','weight lifting'],
 ['ποδοσφαιρο','ποδοσφαιρου','football','soccer'],
 ['επιτραπεζια αντισφαιριση','πιγκ πονγκ','πινγκ πονγκ','ping pong','table tennis'],
 ['αντισφαιριση','τενις','tennis'],
 ['πυγμαχια','πυγμαχιας','boxing'],
 ['ποδηλασια','ποδηλασιας','cycling'],
 ['κωπηλασια','κωπηλασιας','rowing'],
 ['τζουντο','τζούντο','judo']
];
const aliasGroups=sports.map(g=>[...new Set(g.map(norm))]);
const index=new Map();aliasGroups.forEach((g,i)=>g.forEach(a=>index.set(a,i)));
function variants(term){
 const key=norm(term);const g=index.get(key);
 if(g===undefined)return[key];return aliasGroups[g];
}
function includes(text,variant){
 const hay=' '+norm(text)+' ',needle=' '+norm(variant)+' ';
 return hay.includes(needle);
}
function matches(text,term){
 const key=norm(term);if(!key)return false;
 if(includes(text,key))return true;
 const g=index.get(key);
 if(g===undefined)return norm(text).includes(key);
 return aliasGroups[g].some(a=>includes(text,a));
}
function sportMatch(text,query){const q=norm(query).split(/\s+/).filter(Boolean);return q.every(token=>matches(text,token))}
window.ArchelaosSportSearch=Object.freeze({normalize:norm,variants,matches,sportMatch});
})();