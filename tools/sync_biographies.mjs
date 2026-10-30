#!/usr/bin/env node
/**
 * V3 biography build tool. Canonical source: hall-of-fame-people.json.
 * Run: node tools/sync_biographies.mjs --write
 * CI:  node tools/sync_biographies.mjs --check
 * Never reads or publishes private Google Drive documents.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const mode=process.argv[2];
if(!['--write','--check'].includes(mode)){console.error('Usage: node tools/sync_biographies.mjs --write|--check');process.exit(2)}
const source=JSON.parse(readFileSync(join(root,'hall-of-fame-people.json'),'utf8'));
const people=source.people;
if(!Array.isArray(people)||!people.length||source.count!==people.length)throw new Error('Invalid canonical people count');
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const ids=new Set();
for(const p of people){if(!/^[a-z0-9-]+$/.test(p.id)||ids.has(p.id)||!p.name)throw new Error('Invalid/duplicate person ID: '+p.id);ids.add(p.id)}
const historyEvents=JSON.parse(readFileSync(join(root,'archelaos-history-events.json'),'utf8')).events;
const relatedHistory=p=>{const matches=historyEvents.filter(event=>Array.isArray(event.people)&&event.people.includes(p.id));return matches.length?'<section class="related-history"><h2>Σχετικά ιστορικά γεγονότα</h2><ul>'+matches.map(event=>'<li><a href="/history-events.html#'+esc(event.id)+'">'+esc(event.date.slice(0,4)+' · '+event.title)+'</a></li>').join('')+'</ul></section>':'';};
const html=p=>{
 const url='https://archelaos.club/people/'+encodeURIComponent(p.id)+'.html';
 const title=p.name+' | Γ.Α.Σ. Αρχέλαος Κατερίνης';
 const description=(p.bio||p.name+' — Γ.Α.Σ. Αρχέλαος Κατερίνης').replace(/\s+/g,' ').slice(0,155);
 const schema=JSON.stringify({'@context':'https://schema.org','@type':'Person',name:p.name,url,description:p.bio||'',...(p.name_en?{alternateName:p.name_en}:{})}).replace(/</g,'\\u003c');
 const nameTitle='<h1 data-name-el="'+esc(p.name)+'" data-name-en="'+esc(p.name_en||p.name)+'">'+esc(p.name)+'</h1>';
 const refs=(p.refs||[]).filter(x=>x&&typeof x.url==='string'&&/^https?:\/\//.test(x.url)).map(x=>'<li><a href="'+esc(x.url)+'" rel="noopener noreferrer">'+esc(x.label||x.url)+'</a></li>').join('');
 return '<!doctype html>\n'+
 '<html lang="el"><head><link rel="stylesheet" href="/assets/navigation.css"><link rel="stylesheet" href="/assets/footer.css"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="'+esc(description)+'"><meta name="robots" content="index,follow"><title>'+esc(title)+'</title><link rel="canonical" href="'+esc(url)+'"><meta property="og:type" content="profile"><meta property="og:site_name" content="Γ.Α.Σ. Αρχέλαος Κατερίνης"><meta property="og:title" content="'+esc(title)+'"><meta property="og:description" content="'+esc(description)+'"><meta property="og:url" content="'+esc(url)+'"><meta property="og:image" content="https://archelaos.club/social-preview.jpg"><link rel="stylesheet" href="/assets/profile.css"><style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;font:17px/1.7 system-ui,-apple-system,Segoe UI,sans-serif;background:#f8f6ef;color:#18372a}header{background:#073d2a;color:white;padding:24px max(20px,calc((100% - 960px)/2))}header a{color:white;text-decoration:none}header img{width:58px;height:58px;vertical-align:middle;margin-right:15px}main{max-width:960px;margin:44px auto;padding:0 22px}article{background:white;border:1px solid #e3e4d8;border-radius:20px;padding:clamp(22px,5vw,56px)}h1{line-height:1.2;margin:16px 0 12px;font-size:clamp(29px,5vw,44px)}.category{color:#6d623e;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}.bio{white-space:pre-line}a{color:#075239}a:focus-visible{outline:3px solid #c7a65e;outline-offset:3px}.return{display:inline-block;margin-top:25px;font-weight:700}footer{text-align:center;padding:32px}</style><script type="application/ld+json">'+schema+'</script><link rel="stylesheet" href="/assets/accessibility.css"></head>\n'+
 '<body class="person-page"><main class="profile-main"><article class="profile-card"><div class="profile-intro"><div class="category">'+esc(p.role||'Hall of Fame')+'</div>'+nameTitle+'</div><div class="profile-body"><section class="profile-section" data-profile-language="el"><h2 data-profile-el="Βιογραφικό" data-profile-en="Biography">Βιογραφικό</h2><div class="bio">'+esc(p.bio||'')+'</div></section>'+(p.bio_en?'<section class="profile-section" lang="en" data-profile-language="en" hidden><h2>Biography</h2><div class="bio">'+esc(p.bio_en)+'</div></section>':'')+(refs?'<section><h2 data-profile-el="Πηγές" data-profile-en="Sources">Πηγές</h2><ul>'+refs+'</ul></section>':'')+relatedHistory(p)+'<div class="profile-actions"><a class="return" href="/hall-of-fame.html"><span data-profile-el="← Επιστροφή στο Hall of Fame" data-profile-en="← Return to Hall of Fame">← Επιστροφή στο Hall of Fame</span></a><a class="secondary" href="/history-events.html"><span data-profile-el="Ιστορικά γεγονότα →" data-profile-en="Historical events →">Ιστορικά γεγονότα →</span></a></div></div></article></main><script src="/assets/navigation.js" defer></script><script src="/assets/profile.js" defer></script><script src="/assets/footer.js" defer></script><script src="/assets/accessibility.js" defer></script></body></html>';
};
const indexPath=join(root,'archelaos-person-index.json'),sitemapPath=join(root,'sitemap.xml');
const existingIndex=JSON.parse(readFileSync(indexPath,'utf8'));
const previousById=new Map(existingIndex.map(x=>[x.id,x]));
// Alias spellings are editorial data: never discard them during regeneration.
const index=people.map(p=>({id:p.id,name:p.name,...(p.name_en?{name_en:p.name_en}:{}),names:[...new Set([p.name,...(p.names||[]),...(previousById.get(p.id)?.names||[])])]}));
const urlLines=people.map(p=>'  <url><loc>https://archelaos.club/people/'+p.id+'.html</loc></url>').join('\n');
const sitemapBase=readFileSync(sitemapPath,'utf8').replace(/  <url><loc>https:\/\/archelaos\.club\/people\/[a-z0-9-]+\.html<\/loc><\/url>\n?/g,'');
const sitemap=sitemapBase.replace('</urlset>',urlLines+'\n</urlset>');
let problems=[];
if(mode==='--write'){
 mkdirSync(join(root,'people'),{recursive:true});
 for(const p of people)writeFileSync(join(root,'people',p.id+'.html'),html(p));
 writeFileSync(indexPath,JSON.stringify(index,null,2)+'\n');
 writeFileSync(sitemapPath,sitemap);
 console.log('Generated '+people.length+' biographies, index and sitemap from canonical JSON.');
}else{
 const indexed=new Map(existingIndex.map(x=>[x.id,x]));
 for(const p of people){
  const path=join(root,'people',p.id+'.html');
  if(!existsSync(path)){problems.push('Missing profile '+p.id);continue}
  const body=readFileSync(path,'utf8');
  if(!(body.includes('<h1>'+esc(p.name)+'</h1>')||body.includes('>'+esc(p.name)+'</h1>'))||!body.includes('<div class="bio">'+esc(p.bio||'')+'</div>'))problems.push('Outdated profile '+p.id);
  if(relatedHistory(p)&&!body.includes(relatedHistory(p)))problems.push('Missing historical relationships '+p.id);
  if(!indexed.has(p.id)||indexed.get(p.id).name!==p.name)problems.push('Outdated index '+p.id);
  if(indexed.has(p.id)&&((p.names||[]).some(n=>!indexed.get(p.id).names?.includes(n))))problems.push('Missing canonical alias '+p.id);
  if(!sitemapBase.includes('</urlset>')||!readFileSync(sitemapPath,'utf8').includes('/people/'+p.id+'.html</loc>'))problems.push('Missing sitemap '+p.id);
 }
 if(existingIndex.length!==people.length)problems.push('Index count mismatch');
 if(problems.length){console.error(problems.slice(0,30).join('\n'));process.exit(1)}
 console.log('Checked '+people.length+' existing biography pages, index and sitemap.');
}
