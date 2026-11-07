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

test('both museum versions embed the same discussion cards and dialog',()=>{
 for(const path of ['history.html','rebuild/history.html']){
  const html=read(path);
  assert.match(html,/id="arch-factcheck-promo"/);
  assert.match(html,/id="fc-grid"/);
  assert.match(html,/id="fc-dialog"/);
  assert.match(html,/\/assets\/fact-check\.js\?v=2/);
 }
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

test('body without Content-Length is still limited to 6000 bytes',async()=>{
 const r=await api.onRequestPost({request:request(body({evidence:'x'.repeat(6500)})),env:{FACTCHECK_DB:{},TURNSTILE_SECRET:'secret'}});
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
