import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = relative => readFileSync(new URL('../' + relative, import.meta.url), 'utf8');
const bank = JSON.parse(read('assets/fact-check-claims.json'));
const api = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(read('functions/api/fact-check.js')));
const receipt='1fdf0c72-938a-4b8f-8c2f-6bbfe0ca2a13';
const url='https://archelaos.club/api/fact-check';
const body=(patch={})=>({claimId:'TF001',choice:'unknown',catalogVersion:1,receipt,evidence:'',referenceUrl:'',turnstileToken:'test-valid-token',...patch});
const request=(data,headers={})=>new Request(url,{method:'POST',headers:{Origin:'https://archelaos.club','Content-Type':'application/json',...headers},body:JSON.stringify(data)});

test('all 61 research dilemmas are listed and have no answers',()=>{
 assert.equal(bank.schema_version,1);
 assert.equal(bank.items.length,61);
 assert.deepEqual(bank.items.map(x=>x.id),Array.from({length:61},(_,i)=>'TF'+String(i+1).padStart(3,'0')));
 for(const entry of bank.items){assert.equal(entry.status,'unverified');assert.ok(entry.claim.length>20);
  assert.ok(entry.category.length>1);assert.equal(Object.hasOwn(entry,'answer'),false);}
});

test('both museum versions render one photo-free research card at a time',()=> {
 for(const path of ['history.html','rebuild/history.html']){
  const html=read(path),section=html.slice(html.indexOf('<section id="arch-factcheck-promo"'),html.indexOf('</section>',html.indexOf('<section id="arch-factcheck-promo"'))+10);
  assert.match(section,/id="arch-factcheck-promo"/);
  assert.match(section,/id="fc-grid"/);
  assert.match(section,/id="fc-progress-fill"/);
  assert.match(section,/id="fc-save-status"/);
  assert.match(section,/id="fc-turnstile"/);
  assert.match(section,/id="fc-send"/);
  assert.match(section,/id="fc-security" hidden/);
   assert.equal(section.includes('id="fc-dialog"'),false);
   assert.equal(section.includes('<img'),false);
   assert.equal(section.includes('<picture'),false);
   assert.equal(section.includes('<video'),false);
  assert.doesNotMatch(section,/Fact <em>Check/);
   assert.ok(html.includes('/assets/fact-check.js?v=5'));
   assert.ok(html.includes('/assets/fact-check.css?v=5'));
 }
});
test('dilemmas show two named alternatives, other questions use true false unknown',()=>{
 const dilemmas=bank.items.filter(x=>x.alternatives);
 assert.deepEqual(dilemmas.map(x=>x.id),["TF001","TF014","TF015","TF016","TF017","TF022","TF026","TF032","TF034","TF041","TF047","TF055"]);
 for(const question of dilemmas){
  assert.equal(question.alternatives.length,2);
  assert.ok(question.alternatives.every(x=>x.length>2));
 }
 const selected=bank.items.filter(x=>x.publicReview===true);
 assert.deepEqual(selected.map(x=>x.id),["TF001","TF014","TF015","TF016","TF017","TF022","TF026","TF032","TF034","TF041","TF047"]);
 assert.equal(selected.length,11);
 assert.equal(bank.items.filter(x=>x.publicReview===false).length,50);
 assert.equal(bank.items.find(x=>x.id==='TF055').publicReview,false);
 assert.equal(bank.items.find(x=>x.id==='TF021').publicReview,false);
 assert.ok(selected.every(x=>x.reviewContext?.length>40));
 assert.ok(selected.every(x=>x.alternatives?.length===2));
 assert.deepEqual([...selected].sort((a,b)=>a.displayOrder-b.displayOrder).map(x=>x.id),["TF032","TF047","TF034","TF022","TF014","TF026","TF015","TF041","TF001","TF016","TF017"]);
 const browser=read('assets/fact-check.js');
  assert.ok(browser.includes('position+=1;render(true);'));
  assert.ok(browser.includes('pending.push(answer)'));
  assert.ok(browser.includes('pending.slice()'));
  assert.ok(browser.includes('sendButton.addEventListener(\'click\',requestSubmission)'));
  assert.doesNotMatch(browser,/if\(ready\)ensureSecurity\(\)/);
  assert.doesNotMatch(browser,/position\+=1;render\(true\);\s*void send\(\)/);
  assert.ok(browser.includes("const published=obj.items.filter(x=>x.publicReview===true)"));
  assert.ok(browser.includes("questions=published.sort((a,b)=>a.displayOrder-b.displayOrder)"));
  assert.ok(browser.includes("const context=make('p','fc-context'"));
  assert.ok(browser.includes('window.turnstile'));
  assert.equal(browser.includes('showModal('),false);
});

test('museum polish uses club colors and brief accessible motion',()=>{
 const css=read('assets/fact-check.css');
 assert.match(css,/#073d2a/);
 assert.match(css,/#b99750/);
 assert.match(css,/@keyframes fc-card-reveal/);
 assert.match(css,/190ms/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/\.fc-skip:hover/);
 assert.doesNotMatch(css,/background-image:\s*url\(/);
});

test('GET only advertises readiness after database schema exists',async()=>{
 assert.deepEqual(await (await api.onRequestGet({env:{}})).json(),{ready:false,sitekey:'0x4AAAAAAFoyKwIFuvMbrcAd'});
 const env={FACTCHECK_DB:{prepare(){return {first:async()=>null}}},TURNSTILE_SECRET:'x'};
 assert.equal((await (await api.onRequestGet({env})).json()).ready,false);
 env.FACTCHECK_DB.prepare=()=>({first:async()=>({name:'factcheck_responses'})});
 assert.equal((await (await api.onRequestGet({env})).json()).ready,true);
});

test('handler fails closed without bindings or proper Origin',async()=>{
 assert.equal((await api.onRequestPost({request:request(body()),env:{}})).status,503);
 const env={FACTCHECK_DB:{},TURNSTILE_SECRET:'secret'};
 assert.equal((await api.onRequestPost({request:request(body(),{Origin:'https://evil.example'}),env})).status,403);
});

test('invalid IDs, version, receipts and optional field types fail before database access',async()=>{
 let writes=0;const env={FACTCHECK_DB:{prepare(){writes++;throw Error('should not write')}},TURNSTILE_SECRET:'secret'};
 const malformed=[
  {claimId:'TF000'},{claimId:'TF062'},{claimId:'TF999'},
  {catalogVersion:2},{receipt:'not-a-uuid'},{evidence:42},{referenceUrl:{}}
 ];
 for(const patch of malformed){const r=await api.onRequestPost({request:request(body(patch)),env});assert.equal(r.status,400,JSON.stringify(patch));}
 assert.equal(writes,0);
});

test('body without Content-Length is still limited to 32000 bytes',async()=>{
 const r=await api.onRequestPost({request:request(body({evidence:'x'.repeat(33000)})),env:{FACTCHECK_DB:{},TURNSTILE_SECRET:'secret'}});
 assert.equal(r.status,413);
});

test('no token means no storage',async()=>{
 let writes=0;const env={FACTCHECK_DB:{prepare(){writes++;throw Error('should not write')}},TURNSTILE_SECRET:'secret'};
 const r=await api.onRequestPost({request:request(body({turnstileToken:''})),env});
 assert.equal(r.status,403);assert.equal(writes,0);
});

test('valid submission writes pending record once; retry with same receipt is idempotent',async()=>{
 const originalFetch=globalThis.fetch;let writes=0;
 globalThis.fetch=async()=>Response.json({success:true,hostname:'archelaos.club',action:'fact_check'});
 const env={TURNSTILE_SECRET:'test-secret',FACTCHECK_DB:{prepare(sql){return {bind(...values){return {
  async run(){writes++;assert.match(sql,/INSERT OR IGNORE/);assert.equal(values[0],receipt);return {meta:{changes:writes===1?1:0}};},
  async first(){return {claim_id:'TF001',choice:'unknown',evidence:'',reference_url:''};}
 }}}}}};
 try{
  const first=await api.onRequestPost({request:request(body()),env});
  assert.equal(first.status,201);assert.equal((await first.json()).ok,true);
  const second=await api.onRequestPost({request:request(body()),env});
  assert.equal(second.status,202);assert.equal((await second.json()).duplicate,true);
  assert.equal(writes,2);
 }finally{globalThis.fetch=originalFetch;}
});


const batchRequest=(answers,extras={})=>request({catalogVersion:1,answers,turnstileToken:'test-valid-token',...extras});
const batchAnswer=(i,patch={})=>({claimId:'TF'+String(i).padStart(3,'0'),choice:'unknown',
 receipt:'1fdf0c72-938a-4b8f-8c2f-'+String(i).padStart(12,'0'),evidence:'',referenceUrl:'',...patch});
test('fast batch rejects malformed input, duplicate claims and unsafe URLs',async()=>{
 let touched=0;
 const env={FACTCHECK_DB:{prepare(){touched++;throw Error('unexpected DB access');}},TURNSTILE_SECRET:'secret'};
 const bad=[
  [batchAnswer(1),batchAnswer(1,{receipt:'1fdf0c72-938a-4b8f-8c2f-000000000090'})],
  [batchAnswer(1,{claimId:'TF099'})],
  [batchAnswer(1,{choice:'option_a'})],
  [batchAnswer(1,{evidence:'a'.repeat(601)})],
  [batchAnswer(1,{referenceUrl:'http://invalid.test'})],
  [batchAnswer(1,{referenceUrl:'https://localhost/path'})],
  Array.from({length:26},(_,i)=>batchAnswer(i+1))
 ];
 for(const answers of bad){
  const result=await api.onRequestPost({request:batchRequest(answers),env});
  assert.equal(result.status,400,JSON.stringify(answers));
 }
 assert.equal(touched,0);
});
test('one Turnstile token saves the full visitor session with eleven choices',async()=>{
 const originalFetch=globalThis.fetch,store=new Map(),answers=Array.from({length:11},(_,i)=>batchAnswer(i+1));
 let verifications=0,inserted=0;
 globalThis.fetch=async()=>{verifications++;return Response.json({success:true,hostname:'archelaos.club',action:'fact_check'});};
 const env={
  TURNSTILE_SECRET:'secret',
  FACTCHECK_DB:{
   prepare(sql){
    return {bind(...args){
     return {
      async first(){assert.match(sql,/SELECT claim_id/);const row=store.get(args[0]);return row??null;},
      async run(){throw Error('batch insert should be used');},
      async insert(){assert.match(sql,/INSERT OR IGNORE/);
       const [receipt,claim_id,choice,evidence,reference_url]=args;
       if(store.has(receipt))return {meta:{changes:0}};
       store.set(receipt,{claim_id,choice,evidence,reference_url});inserted++;return {meta:{changes:1}};}
     };
    }};
   },
   async batch(statements){const results=[];for(const item of statements)results.push(await item.insert());return results;}
  }
 };
 try{
  const first=await api.onRequestPost({request:batchRequest(answers),env});
  assert.equal(first.status,201);assert.equal((await first.json()).accepted,11);
  assert.equal(store.size,11);assert.equal(inserted,11);
  const repeat=await api.onRequestPost({request:batchRequest(answers),env});
  assert.equal(repeat.status,202);assert.equal((await repeat.json()).duplicate,true);
  assert.equal(store.size,11);assert.equal(inserted,11);assert.equal(verifications,2);
  const clash=await api.onRequestPost({request:batchRequest([batchAnswer(1,{choice:'false'})]),env});
  assert.equal(clash.status,409);assert.equal(store.size,11);
 }finally{globalThis.fetch=originalFetch;}
});
