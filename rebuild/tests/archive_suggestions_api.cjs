/* Isolated mocked Pages Function validation. NEVER calls Cloudflare or writes D1. */
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const src=readFileSync(require('node:path').join(__dirname,'../cloudflare/functions/api/archive-suggestions.js'),'utf8');
const base64='data:text/javascript;base64,'+Buffer.from(src).toString('base64');
let backendCalls=0,turnstileCalls=0,rate=0,stored=0;
class FakeDB{
 prepare(sql){
  return {bind:(...values)=>({
   first:async()=>{backendCalls++;rate++;return rate<=5?{hits:rate}:null},
   run:async()=>{backendCalls++;stored++;return {meta:{changes:1}}}
  })}
 }
}
const oldFetch=global.fetch;
global.fetch=async()=>{turnstileCalls++;return Response.json({success:true,hostname:'archelaos.club',action:'archive_suggestion'})};
function req(body,options={}){
 const headers={'content-type':'application/json','origin':'https://archelaos.club','cf-connecting-ip':'198.51.100.3',...options.headers};
 return new Request('https://archelaos.club/api/archive-suggestions',{method:'POST',headers,body:typeof body==='string'?body:JSON.stringify(body)});
}
const env={ENABLE_ARCHIVE_SUGGESTIONS:'true',ARCHIVE_DB:new FakeDB(),TURNSTILE_SECRET:'fake-test-secret',ARCHIVE_RATE_SALT:'fake-test-salt',ARCHIVE_TURNSTILE_HOSTNAME:'archelaos.club'};
const good={kind:'verification_request',record_id:'request-archery-historical-records',description:'Έχω το πρωτότυπο πρόγραμμα του αγώνα, με αναλυτικά αποτελέσματα και ημερομηνία 1998.',public_source_url:'https://example.com/archive',turnstile_token:'dummy-token-example'};
(async()=>{
 try{
  const {onRequestPost}=await import(base64);
  assert.equal((await onRequestPost({request:req(good),env:{}})).status,503);
  assert.equal((await onRequestPost({request:req(good,{headers:{origin:'https://other.example'}}),env})).status,403);
  assert.equal((await onRequestPost({request:req(good,{headers:{'content-type':'text/plain'}}),env})).status,415);
  assert.equal((await onRequestPost({request:req({...good,description:'short'}),env})).status,400);
  assert.equal((await onRequestPost({request:req({...good,record_id:'arch-wrong'}),env})).status,400);
  assert.equal((await onRequestPost({request:req({...good,public_source_url:'http://localhost/private'}),env})).status,400);
  assert.equal(backendCalls,0);assert.equal(turnstileCalls,0);
  const ok=await onRequestPost({request:req(good),env});
  assert.equal(ok.status,201);assert.equal((await ok.json()).status,'pending_review');
  assert.equal(stored,1);
  const payload=await onRequestPost({request:req(good),env});
  assert.equal(payload.status,201);
  rate=5;
  assert.equal((await onRequestPost({request:req(good),env})).status,429);
  assert.equal(stored,2);
  console.log('ARCHIVE SUGGESTIONS API QA OK: disabled by default, origin, body, IDs, Turnstile, D1 pending, rate limit.');
 }finally{global.fetch=oldFetch}
})().catch(e=>{console.error(e);process.exitCode=1});
