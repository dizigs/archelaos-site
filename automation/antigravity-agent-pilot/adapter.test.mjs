import test from 'node:test';
import assert from 'node:assert/strict';
import {ANTIGRAVITY_PILOT,buildAntigravityReviewRequest,runAntigravityReview} from './adapter.mjs';
const sha='0123456789abcdef0123456789abcdef01234567';
const job={issue:268,purpose:ANTIGRAVITY_PILOT.operation,commitSha:sha,files:[{path:'brain/test/selfheal_ack.test.mjs',content:'test("HMAC mismatch",()=>status==="UNKNOWN")'}]};
const grant={source:'TRUSTED_BRAIN',chargeSource:'VERIFIED_FREE_API_QUOTA',exactSha:sha,issue:268,explicitOperatorApproval:true};
const reserveAttempt=async()=>({authorized:true,durablyCommitted:true,exactSha:sha,issue:268,id:'r1'});
const recordAttempt=async()=>({durablyCommitted:true});
const mockFetch=async(url,options)=>{
  assert.equal(url,ANTIGRAVITY_PILOT.endpoint);
  assert.equal(options.redirect,'manual');
  const body=JSON.parse(options.body);
  assert.equal(body.agent_config.max_total_tokens,12000);
  assert.deepEqual(body.tools,[{type:'code_execution'}]);
  return {status:200,json:async()=>({status:'completed',usage:{total_tokens:24},output_text:'HMAC: verify mismatch is UNKNOWN'})};
};
const args=(extra={})=>({job,apiKey:'synthetic-key-value',enabled:true,approvedGrant:grant,reserveAttempt,recordAttempt,fetchImpl:mockFetch,...extra});
test('default no network',async()=>{let calls=0;let r=await runAntigravityReview({job,fetchImpl:async()=>{calls++}});assert.equal(r.status,'DISABLED');assert.equal(calls,0)});
test('Pro benefits alone and missing evidence are denied before egress',async()=>{
 for(const g of [null,{...grant,chargeSource:'GOOGLE_AI_PRO'},{...grant,explicitOperatorApproval:false}]) {
   let calls=0;const r=await runAntigravityReview(args({approvedGrant:g,fetchImpl:async()=>{calls++}}));
   assert.equal(r.status,'BLOCKED_BENEFITS_UNVERIFIED');assert.equal(calls,0);
 }
});
test('exact SHA and public path allowlist',()=>{
 assert.equal(buildAntigravityReviewRequest(job).agent,ANTIGRAVITY_PILOT.agent);
 assert.throws(()=>buildAntigravityReviewRequest({...job,commitSha:'main'}),/INVALID_EXACT_SHA/);
 assert.throws(()=>buildAntigravityReviewRequest({...job,files:[{path:'.env',content:'x'}]}),/DISALLOWED_PATH/);
 assert.throws(()=>buildAntigravityReviewRequest({...job,files:[{path:job.files[0].path,content:'-----BEGIN PRIVATE KEY-----'}]}),/POTENTIAL_SECRET/);
 assert.throws(()=>buildAntigravityReviewRequest({...job,files:[job.files[0],job.files[0]]}),/DISALLOWED_PATH/);
});
test('no ledger and invalid timeout fail closed',async()=>{
 assert.equal((await runAntigravityReview(args({reserveAttempt:null}))).status,'BLOCKED_BUDGET_OR_RUNTIME');
 assert.equal((await runAntigravityReview(args({timeoutMs:16000}))).status,'BLOCKED_TIMEOUT');
 assert.equal((await runAntigravityReview(args({reserveAttempt:async()=>({authorized:false})}))).status,'BLOCKED_BUDGET_RESERVATION');
 assert.equal((await runAntigravityReview(args({reserveAttempt:async()=>{throw Error('database')} }))).status,'BLOCKED_BUDGET_RESERVATION');
});
test('one mock interaction is draft-only',async()=>{
 const r=await runAntigravityReview(args());assert.equal(r.status,'DRAFT_REVIEW_REQUIRED');assert.equal(r.totalTokens,24);
});
test('provider error, incomplete and missing usage are UNKNOWN without retries',async()=>{
 for(const response of [{status:429},{status:500},{status:200,json:async()=>({status:'incomplete',usage:{total_tokens:3}})},{status:200,json:async()=>({status:'completed',output_text:'x'})}]) {
  let calls=0;const r=await runAntigravityReview(args({fetchImpl:async()=>{calls++;return response}}));
  assert.match(r.status,/UNKNOWN/);assert.equal(calls,1);
 }
});
test('transport and receipt failure produce UNKNOWN',async()=>{
 assert.equal((await runAntigravityReview(args({fetchImpl:async()=>{throw Error('failed with secret')}}))).status,'UNKNOWN_TRANSPORT');
 assert.equal((await runAntigravityReview(args({recordAttempt:async()=>{throw Error('db error')}}))).status,'UNKNOWN_RECEIPT');
});
