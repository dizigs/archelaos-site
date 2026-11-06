import test from 'node:test';
import assert from 'node:assert/strict';
import {executeGeminiBuildA,inspectGeminiBuildAJob,FLASH_LITE_MODELS,BUILD_A_OPERATION} from './adapter.mjs';

const NOW=Date.parse('2026-11-05T12:00:00Z'), SECRET='FAKE_GEMINI_KEY_NEVER_REAL',PATH='automation/build-a-example.mjs';
const job={taskId:'builda_123456',commitSha:'a'.repeat(40),paths:[PATH],
  instruction:'Review and suggest a small change.',sourceFiles:[{path:PATH,content:'export const result = 1;'}],approved:true};
const structured={summary:'Small reviewed change',changes:[{path:PATH,content:'export const result = 2;',rationale:'Reproducible improvement'}],
  testNotes:['Run node tests offline'],risks:['Requires independent CI verification']};
function body(p=structured,usage={promptTokenCount:320,candidatesTokenCount:85}){
  return {candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(p)}]}}],usageMetadata:usage};
}
function jsonResponse(payload,status=200,headers={}){
  return new Response(JSON.stringify(payload),{status,headers});
}
function fixture(overrides={}){
  const calls=[],receipts=[],grants=[];
  const options={job,key:SECRET,modelId:'gemini-3.5-flash-lite',liveEnabled:true,timeoutMs:200,now:()=>NOW,sleep:async()=>{},
    authorizeAttempt:async c=>{
      grants.push(c);
      return {authorized:true,source:'central-brain',provider:'gemini',operation:BUILD_A_OPERATION,taskId:c.taskId,
        commitSha:c.commitSha,modelId:c.modelId,requestHash:c.requestHash,scopeHash:c.scopeHash,attempt:c.attempt,
        modelAccessVerified:true,credentialBindingVerified:true,priceAndFxVerified:true,durableReservation:true,
        reservationId:'receipt_00000'+c.attempt,budgetCapEurMicros:20_000_000,reservedEurMicros:30_000,
        quotedMaxEurMicros:25_000,remainingAfterReserveEurMicros:19_000_000,
        expiresAtEpochMs:NOW+30_000,ledgerPeriod:'2026-11'};
    },
    recordAttempt:async receipt=>{receipts.push(receipt);},
    fetchGoogle:async(url,init)=>{calls.push({url,init});return jsonResponse(body());},...overrides};
  return {options,calls,receipts,grants};
}
test('official stable model allowlist excludes old/shutdown model',()=>{
  assert.deepEqual(FLASH_LITE_MODELS,['gemini-3.5-flash-lite','gemini-2.5-flash-lite']);
});
test('job validation rejects unauthorized, workflow and traversal paths',()=>{
  assert.equal(inspectGeminiBuildAJob(job).taskId,job.taskId);
  for(const invalid of [
    {...job,approved:false},{...job,production:true},{...job,autoMerge:true},
    {...job,paths:['.github/workflows/rebuild-check.yml']},
    {...job,paths:['automation/../secrets']},
    {...job,paths:['automation/unsafe\\file']},
    {...job,sourceFiles:[{path:'automation/other.mjs',content:'x'}]},
    {...job,unexpected:'extra'}
  ])assert.throws(()=>inspectGeminiBuildAJob(invalid));
});
test('OFF by default never calls Brain or Gemini',async()=>{
  const f=fixture({liveEnabled:false});
  await assert.rejects(()=>executeGeminiBuildA(f.options),{code:'GEMINI_BUILD_A_DISABLED'});
  assert.equal(f.grants.length,0);assert.equal(f.calls.length,0);
});
test('key, ledger and allowlisted model required before network',async()=>{
  for(const changed of [{key:undefined},{authorizeAttempt:undefined},{recordAttempt:undefined},{modelId:'gemini-2.0-flash-lite'}]){
    const f=fixture(changed);
    await assert.rejects(()=>executeGeminiBuildA(f.options));
    assert.equal(f.calls.length,0);
  }
});
test('invalid quotes, FX, model access or ledger claim block provider',async()=>{
  for(const invalid of [
    {reservedEurMicros:0},{quotedMaxEurMicros:50_000},{priceAndFxVerified:false},
    {modelAccessVerified:false},{credentialBindingVerified:false},{durableReservation:false},
    {remainingAfterReserveEurMicros:-1},{budgetCapEurMicros:20_000_001},
    {expiresAtEpochMs:NOW-1},{ledgerPeriod:'2026-10'},{source:'browser'},{requestHash:'wrong'}
  ]){
    const f=fixture(),old=f.options.authorizeAttempt;
    f.options.authorizeAttempt=async c=>({...await old(c),...invalid});
    await assert.rejects(()=>executeGeminiBuildA(f.options),{code:'BRAIN_GEMINI_BUDGET_DENIED'});
    assert.equal(f.calls.length,0);
  }
});
test('one valid request gives review-only proposal and usage receipt',async()=>{
  const f=fixture(),result=await executeGeminiBuildA(f.options);
  assert.equal(result.status,'DRAFT_REVIEW_REQUIRED');
  assert.equal(result.githubWritesPerformed,false);
  assert.equal(result.testsExecuted,false);
  assert.deepEqual(result.proposal,structured);
  assert.equal(f.calls.length,1);assert.equal(f.receipts.length,1);
  assert.equal(f.receipts[0].kind,'success');
  assert.deepEqual(f.receipts[0].usage,{inputTokens:320,outputTokens:85});
  const {url,init}=f.calls[0];
  assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
  assert.equal(init.headers['x-goog-api-key'],SECRET);
  assert.equal(init.redirect,'manual');
  const c=JSON.parse(init.body).generationConfig;
  assert.equal(c.responseMimeType,'application/json');assert.equal(c.maxOutputTokens,4096);assert.equal(c.responseSchema.type,'OBJECT');
});
test('HTTP429 retries once only after another durable reservation',async()=>{
  let n=0;
  const f=fixture({fetchGoogle:async()=>++n===1?jsonResponse({},429,{'retry-after':'0'}):jsonResponse(body())});
  const result=await executeGeminiBuildA(f.options);
  assert.equal(result.status,'DRAFT_REVIEW_REQUIRED');
  assert.equal(n,2);assert.equal(f.grants.length,2);
  assert.deepEqual(f.receipts.map(x=>x.kind),['rejected_429','success']);
  assert.notEqual(f.receipts[0].reservationId,f.receipts[1].reservationId);
});
test('long 429 Retry-After defers, no new reservation',async()=>{
  let n=0;
  const f=fixture({fetchGoogle:async()=>{n++;return jsonResponse({},429,{'retry-after':'60'});}});
  await assert.rejects(()=>executeGeminiBuildA(f.options),{code:'GEMINI_RETRY_DEFERRED'});
  assert.equal(n,1);assert.equal(f.grants.length,1);
  assert.equal(f.receipts[0].kind,'rejected_429');
});
test('500 response never retries, ambiguous receipt retained',async()=>{
  let n=0;
  const f=fixture({fetchGoogle:async()=>{n++;return jsonResponse({message:SECRET},500);}});
  await assert.rejects(()=>executeGeminiBuildA(f.options),{code:'GEMINI_PROVIDER_OUTCOME_UNCERTAIN'});
  assert.equal(n,1);assert.equal(f.receipts[0].kind,'unknown');
});
test('timeout never retries or leaks credential in error',async()=>{
  let n=0;
  const f=fixture({timeoutMs:100,fetchGoogle:(_,init)=>{n++;return new Promise((r,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('secret '+SECRET)),{once:true}));}});
  await assert.rejects(()=>executeGeminiBuildA(f.options),e=>e.code==='GEMINI_OUTCOME_UNCERTAIN'&&!e.message.includes(SECRET));
  assert.equal(n,1);assert.equal(f.receipts[0].kind,'unknown');
});
test('invalid envelope, usage, paths, duplicate changes and truncation fail closed',async()=>{
  for(const response of [
    new Response('{invalid',{status:200}),
    jsonResponse(body(structured,{})),
    jsonResponse(body({...structured,changes:[{path:'automation/other.mjs',content:'x',rationale:'no'}]})),
    jsonResponse(body({...structured,changes:[structured.changes[0],structured.changes[0]]})),
    jsonResponse(body({...structured,changes:[{...structured.changes[0],content:'x'.repeat(6001)}]})),
    jsonResponse({...body(),candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:JSON.stringify(structured)}]}}]})
  ]){
    const f=fixture({fetchGoogle:async()=>response});
    await assert.rejects(()=>executeGeminiBuildA(f.options));
    assert.equal(f.receipts.length,1);assert.equal(f.grants.length,1);
    assert.notEqual(f.receipts[0].kind,'success');
  }
});
test('failed receipt storage blocks retry',async()=>{
  let n=0;
  const f=fixture({recordAttempt:async()=>{throw Error('private failure '+SECRET);},fetchGoogle:async()=>{n++;return jsonResponse({},429);}});
  await assert.rejects(()=>executeGeminiBuildA(f.options),{code:'BRAIN_GEMINI_RECEIPT_FAILED'});
  assert.equal(n,1);assert.equal(f.grants.length,1);
});
test('duplicate budget reservation blocks second provider call',async()=>{
  let n=0;const f=fixture({fetchGoogle:async()=>{n++;return jsonResponse({},429);}});
  f.options.authorizeAttempt=async c=>({
    authorized:true,source:'central-brain',provider:'gemini',operation:BUILD_A_OPERATION,taskId:c.taskId,
    commitSha:c.commitSha,modelId:c.modelId,requestHash:c.requestHash,scopeHash:c.scopeHash,attempt:c.attempt,
    modelAccessVerified:true,credentialBindingVerified:true,priceAndFxVerified:true,durableReservation:true,
    reservationId:'receipt_same_000',budgetCapEurMicros:20_000_000,reservedEurMicros:30_000,quotedMaxEurMicros:25_000,
    remainingAfterReserveEurMicros:19_000_000,expiresAtEpochMs:NOW+30_000,ledgerPeriod:'2026-11'
  });
  await assert.rejects(()=>executeGeminiBuildA(f.options),{code:'BRAIN_GEMINI_BUDGET_DENIED'});
  assert.equal(n,1);
});
