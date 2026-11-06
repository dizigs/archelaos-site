import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANTIGRAVITY_PILOT,buildAntigravityReviewRequest,extractReview,runAntigravityReview,pollAntigravityReview
} from './adapter.mjs';
const sha='0123456789abcdef0123456789abcdef01234567';
const job={issue:268,purpose:ANTIGRAVITY_PILOT.operation,commitSha:sha,
  files:[{path:'brain/src/selfheal_ack.mjs',content:'function fakeVerifier(){ return "UNKNOWN"; }'}]};
const grant={source:'TRUSTED_BRAIN',chargeSource:'VERIFIED_OPERATOR_PREPAY',
  exactSha:sha,issue:268,explicitOperatorApproval:true,budgetLedgerVerified:true,maximumEuro:5};
const reserveAttempt=async()=>({authorized:true,durablyCommitted:true,exactSha:sha,issue:268,id:'r1',maxEuro:4.9});
const recordAttempt=async()=>({durablyCommitted:true});
const recordRead=async()=>({durablyCommitted:true});
const authorizedRead={source:'TRUSTED_BRAIN',interactionId:'int_abc123',durablyCommitted:true};
const steps=[{type:'model_output',content:[{type:'text',text:'Review HMAC / UNKNOWN carefully.'}]}];
let outgoing=[];
const fetchStart=async(url,opts)=>{
  outgoing.push({url,opts});
  assert.equal(url,ANTIGRAVITY_PILOT.endpoint);
  assert.equal(opts.method,'POST');
  assert.equal(opts.redirect,'error');
  assert.equal(opts.headers['Api-Revision'],'2026-05-20');
  assert.equal(opts.headers['x-goog-api-key'],'synthetic-value-123456');
  const body=JSON.parse(opts.body);
  assert.equal(body.agent,'antigravity-preview-09-2026');
  assert.equal(body.background,true);assert.equal(body.store,true);
  assert.equal(body.agent_config.max_total_tokens,60000);
  assert.equal(body.environment.sources.length,1);
  assert.deepEqual(body.tools,[]);
  return {status:200,json:async()=>({id:'int_abc123',status:'in_progress'})};
};
const startArgs=(extra={})=>({job,apiKey:'synthetic-value-123456',enabled:true,
  approvedGrant:grant,reserveAttempt,recordAttempt,fetchImpl:fetchStart,...extra});
const pollArgs=(extra={})=>({interactionId:'int_abc123',apiKey:'synthetic-value-123456',
  authorizedRead,recordRead,fetchImpl:async(url,opts)=>{
    assert.equal(url,ANTIGRAVITY_PILOT.endpoint+'/int_abc123');assert.equal(opts.method,'GET');
    return {status:200,json:async()=>({id:'int_abc123',status:'completed',steps,usage:{total_tokens:85659}})};
  },...extra});
test('DISABLED truly has zero egress',async()=>{let calls=0;const r=await runAntigravityReview({job,fetchImpl:async()=>{calls++}});assert.equal(r.status,'DISABLED');assert.equal(calls,0)});
test('source scope, exact SHA and secret heuristic',()=>{
  const body=buildAntigravityReviewRequest(job);
  assert.equal(body.background,true);assert.equal(body.store,true);assert.equal(body.agent,ANTIGRAVITY_PILOT.agent);
  assert.equal(body.environment.sources[0].target,'/workspace/public-source-1.txt');
  assert.throws(()=>buildAntigravityReviewRequest({...job,commitSha:'main'}),/INVALID_EXACT_SHA/);
  assert.throws(()=>buildAntigravityReviewRequest({...job,files:[{path:'.env',content:'x'}]}),/DISALLOWED_PATH/);
  assert.throws(()=>buildAntigravityReviewRequest({...job,files:[job.files[0],job.files[0]]}),/DISALLOWED_PATH/);
  assert.throws(()=>buildAntigravityReviewRequest({...job,files:[{path:job.files[0].path,content:'-----BEGIN PRIVATE KEY-----'}]}),/POTENTIAL_SECRET/);
});
test('unverified credits, unsafe operator amount and missing ledger deny POST',async()=>{
  for(const g of [null,{...grant,chargeSource:'GOOGLE_AI_PRO'},{...grant,maximumEuro:20},{...grant,budgetLedgerVerified:false}]) {
    let calls=0;
    const r=await runAntigravityReview(startArgs({approvedGrant:g,fetchImpl:async()=>{calls++}}));
    assert.equal(r.status,'BLOCKED_BENEFITS_UNVERIFIED');assert.equal(calls,0);
  }
});
test('authorization must be durably committed and amount bounded',async()=>{
  for(const reserve of [
    async()=>({authorized:true,durablyCommitted:false,exactSha:sha,issue:268,maxEuro:2}),
    async()=>({authorized:true,durablyCommitted:true,exactSha:sha,issue:268,maxEuro:6}),
    async()=>{throw Error('db unavailable')}
  ]) {
    const r=await runAntigravityReview(startArgs({reserveAttempt:reserve,fetchImpl:async()=>{throw Error('MUST NOT CALL')}}));
    assert.equal(r.status,'BLOCKED_BUDGET_RESERVATION');
  }
});
test('one POST only returns persisted background interaction id',async()=>{
  outgoing=[];const r=await runAntigravityReview(startArgs());
  assert.equal(r.status,'IN_PROGRESS');assert.equal(r.interactionId,'int_abc123');
  assert.equal(outgoing.length,1);
});
test('REST output uses steps, not SDK output_text',async()=>{
  assert.equal(extractReview({status:'completed',steps}), 'Review HMAC / UNKNOWN carefully.');
  assert.equal(extractReview({status:'incomplete',steps}), '');
  assert.equal(extractReview({status:'completed',steps:[{type:'model_output',content:[{type:'image',data:'binary'}]}]}),'');
  const r=await pollAntigravityReview(pollArgs());
  assert.equal(r.status,'DRAFT_REVIEW_REQUIRED');
  assert.equal(r.review,'Review HMAC / UNKNOWN carefully.');
  assert.equal(r.totalTokens,85659);
});
test('poll is GET-only and never starts new billable interaction',async()=>{
  let calls=0;
  const r=await pollAntigravityReview(pollArgs({
    fetchImpl:async(url,opts)=>{calls++;assert.equal(opts.method,'GET');
      return {status:200,json:async()=>({id:'int_abc123',status:'in_progress'})};}
  }));
  assert.equal(r.status,'IN_PROGRESS');assert.equal(calls,1);
});
test('malformed id or untrusted polling receipt denies egress',async()=>{
  for(const args of [
    {interactionId:'../malicious'},{authorizedRead:{...authorizedRead,durablyCommitted:false}},
    {authorizedRead:{...authorizedRead,interactionId:'int_other'}}
  ]) {
    let calls=0;
    const r=await pollAntigravityReview(pollArgs({...args,fetchImpl:async()=>{calls++}}));
    assert.equal(r.status,'BLOCKED_POLL');assert.equal(calls,0);
  }
});
test('timeout, 500 and bad IDs never trigger another POST',async()=>{
  for(const impl of [
    async()=>{throw Error('HeadersTimeoutError')},
    async()=>({status:500}),
    async()=>({status:200,json:async()=>({id:'wrong',status:'in_progress'})})
  ]) {
    let calls=0;const r=await runAntigravityReview(startArgs({fetchImpl:async(...p)=>{calls++;return impl(...p)}}));
    assert.equal(calls,1);assert.match(r.status,/UNKNOWN/);
  }
});
test('terminal states are not misreported as completed and receipts are mandatory',async()=>{
  for(const status of ['incomplete','failed','cancelled','requires_action']) {
    const r=await pollAntigravityReview(pollArgs({fetchImpl:async()=>({status:200,
      json:async()=>({id:'int_abc123',status,steps})})}));
    assert.notEqual(r.status,'DRAFT_REVIEW_REQUIRED');
  }
  const r=await pollAntigravityReview(pollArgs({recordRead:async()=>{throw Error('db')}}));
  assert.equal(r.status,'UNKNOWN_POLL_RECEIPT');
});
