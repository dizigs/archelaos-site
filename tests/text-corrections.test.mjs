import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
const src=await readFile(new URL('../functions/api/text-corrections.js',import.meta.url),'utf8');
const {onRequestGet,onRequestPost}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
globalThis.crypto??=webcrypto;
let rate=0,insertions=[],verificationAction='text_correction',verificationHost='archelaos.club';
const dedupe=new Set();
const db={prepare(sql){return {bind(...args){return {
 async first(){assert.match(sql,/text_correction_rate/);rate++;return rate<=5?{hits:rate}:null},
 async run(){assert.match(sql,/text_corrections/);const row={id:args[0],kind:args[1],recordId:args[2],title:args[3],page:args[4],excerpt:args[5],hash:args[6],description:args[7],source:args[8],dedupe:args[9],status:args[10],createdAt:args[11]};insertions.push(row);const duplicate=dedupe.has(row.dedupe);dedupe.add(row.dedupe);return {meta:{changes:duplicate?0:1}}}
}}}}};
const env={ENABLE_TEXT_CORRECTIONS:'true',ARCHIVE_DB:db,TURNSTILE_SECRET:'fake-secret',ARCHIVE_RATE_SALT:'fake-salt',ARCHIVE_TURNSTILE_HOSTNAME:'archelaos.club',TEXT_CORRECTIONS_SITE_KEY:'test-public-site-key'};
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>Response.json({success:true,hostname:verificationHost,action:verificationAction});
const good={record_kind:'person',record_id:'arch-2cb062fabc11',record_title:'Βιογραφικό Αρχέλαου',source_page:'https://archelaos.club/hall-of-fame.html',text_excerpt:'Αρχικό τεκμηριωμένο κείμενο.',description:'Ο αγώνας έγινε το 1994, σύμφωνα με το έντυπο πρόγραμμα.',public_source_url:'https://example.com/evidence',turnstile_token:'test-token-value'};
const request=(value,headers={})=>new Request('https://archelaos.club/api/text-corrections',{method:'POST',
 headers:{origin:'https://archelaos.club','content-type':'application/json','cf-connecting-ip':'198.51.100.9',...headers},
 body:typeof value==='string'?value:JSON.stringify(value)});
test('GET is disabled by default, no public key or write',()=>{
  const res=onRequestGet({env:{}});assert.equal(res.status,200);
 });
 test('strict origin, input type, record and link validation',async()=>{
  assert.equal((await onRequestPost({request:request(good),env:{}})).status,503);
  assert.equal((await onRequestPost({request:request(good,{origin:'https://evil.example'}),env})).status,403);
  assert.equal((await onRequestPost({request:request(good,{'content-type':'text/plain'}),env})).status,415);
  assert.equal((await onRequestPost({request:request({...good,record_id:'bad id'}),env})).status,400);
  assert.equal((await onRequestPost({request:request({...good,source_page:'https://evil.example/news.html'}),env})).status,400);
  assert.equal((await onRequestPost({request:request({...good,public_source_url:'http://localhost/secret'}),env})).status,400);
  assert.equal((await onRequestPost({request:request({...good,description:'short'}),env})).status,400);
  assert.equal((await onRequestPost({request:request('x'.repeat(10000)),env})).status,413);
  assert.equal(rate,0);assert.equal(insertions.length,0);
 });
 test('Turnstile action and hostname are fail-closed',async()=>{
  verificationAction='contact';
  assert.equal((await onRequestPost({request:request(good),env})).status,403);
  verificationAction='text_correction';verificationHost='another.example';
  assert.equal((await onRequestPost({request:request(good),env})).status,403);
  verificationHost='archelaos.club';assert.equal(insertions.length,0);
 });
 test('PENDING write includes exact record, excerpt hash and review metadata',async()=>{
  const res=await onRequestPost({request:request(good),env});
  assert.equal(res.status,201);
  assert.equal((await res.json()).status,'pending_review');
  assert.equal(insertions.length,1);
  assert.equal(insertions[0].kind,'person');
  assert.equal(insertions[0].recordId,good.record_id);
  assert.equal(insertions[0].status,'pending');
  assert.equal(insertions[0].page,good.source_page);
  assert.match(insertions[0].hash,/^[a-f0-9]{64}$/);
 });
 test('idempotent duplicate and five-per-minute rate guard',async()=>{
  assert.equal((await onRequestPost({request:request(good),env})).status,202);
  for(let i=0;i<3;i++)await onRequestPost({request:request({...good,description:good.description+' '+i}),env});
  assert.equal((await onRequestPost({request:request(good),env})).status,429);
 });
 test('public exhibit and archive-page cards may submit proposed edits',async()=>{
  rate=0;dedupe.clear();const before=insertions.length;
  for(const kind of ['exhibit','page']){
   const entry={...good,record_kind:kind,record_id:'arch-museum-1956',description:good.description+' '+kind};
   const res=await onRequestPost({request:request(entry),env});
   assert.equal(res.status,201,kind);
  }
  assert.equal(insertions.length,before+2);
  assert.deepEqual(insertions.slice(-2).map(x=>x.kind),['exhibit','page']);
 });
 test('client animation is reduced-motion safe and JS loaded by favorites',async()=>{
  const css=await readFile(new URL('../assets/correction-suggestions.css',import.meta.url),'utf8');
  const frontend=await readFile(new URL('../assets/correction-suggestions.js',import.meta.url),'utf8');
  const favorites=await readFile(new URL('../assets/favorites.js',import.meta.url),'utf8');
  assert.match(css,/220ms/);assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(frontend,/aria-expanded/);assert.match(frontend,/record_id:id/);
  assert.match(favorites,/correction-suggestions\.js/);
  const rebuilt=await readFile(new URL('../rebuild/js/favorites.js',import.meta.url),'utf8');
  const globalBiography=await readFile(new URL('../assets/hof-inplace.js',import.meta.url),'utf8');
  assert.match(rebuilt,/correction-suggestions\.js/,'production rebuild must load correction UI');
  assert.match(globalBiography,/dialog\.id='arch-bio-global'/,'global Hall dialog must have matching stable DOM ID');

 });
after(()=>{globalThis.fetch=originalFetch});
