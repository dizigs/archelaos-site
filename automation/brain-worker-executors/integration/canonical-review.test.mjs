import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewCanonicalTask } from './canonical-review.mjs';
import { AUDIENCE, REPOSITORY, REQUIRED_CHECKS, REQUIRED_JOBS } from './index.mjs';

const sha='a'.repeat(40), digest='d'.repeat(64), reservation='e'.repeat(64);
const key='synthetic-only-brain-key-material-over-forty-three-characters';
const id=n=>'11111111-1111-4111-8111-'+String(n).padStart(12,'0');
const a='automation/a/file.mjs',b='automation/b/file.mjs';
const task=(n=1,lane='A',type='build',paths=[a])=>({
  taskId:id(n),receiptId:id(n),commitSha:sha,type,
  ...(type==='build'?{lane}:{}),paths
});
const receipt=t=>({
  verified:true,issuer:'central-brain',audience:AUDIENCE,repository:REPOSITORY,
  approved:true,taskId:t.taskId,receiptId:t.receiptId,commitSha:sha,type:t.type,
  lane:t.type==='build'?t.lane:null,allowedPaths:t.paths,scopeDigest:digest,
  expiresAtMs:Date.now()+60000,
  permissions:{draftOnly:true,merge:false,deploy:false}
});
const claim=t=>({
  taskId:t.taskId,type:t.type==='build'?'BUILD_'+t.lane:'TESTING',
  status:'CLAIMED',baseCommit:sha,scopeDigest:digest,
  executor:t.type==='build'?(t.lane==='A'?'gemini':'gemma'):'github-actions',
  budgetReservationId:t.type==='build'?reservation:null,
  productionAllowed:false,autoMergeAllowed:false
});
const proposal=t=>t.lane==='A'?({
  status:'DRAFT_REVIEW_REQUIRED',provider:'gemini',modelId:'gemini-2.5-flash-lite',
  taskId:t.taskId,commitSha:sha,reservationId:reservation,
  githubWritesPerformed:false,testsExecuted:false,mergeAllowed:false,deployAllowed:false,
  proposal:{summary:'Fix',changes:[{path:t.paths[0],content:'export const x=1;',rationale:'Fix'}],
    testNotes:[],risks:[]}
}):({
  status:'proposed',modelId:'@cf/google/gemma-4-26b-a4b-it',
  eventId:t.taskId,writesPerformed:false,mergeAllowed:false,deployAllowed:false,
  proposal:{summary:'Fix',files:[{path:t.paths[0],replacement:'export const x=2;',reason:'Fix'}],
    tests:[],risk:'low'}
});
async function signed(t, changes={}) {
  const raw=JSON.stringify({...receipt(t),...changes}),timestampMs=Date.now();
  const enc=new TextEncoder(),k=await crypto.subtle.importKey('raw',enc.encode(key),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=await crypto.subtle.sign('HMAC',k,enc.encode(String(timestampMs)+'\n'+raw));
  return {raw,timestampMs,signature:[...new Uint8Array(sig)].map(v=>v.toString(16).padStart(2,'0')).join('')};
}
function mock(t,override={}) {
  const called={reserve:0,settle:0,provider:0};
  const brain={
    readSignedReceipt:async()=>signed(t,override.receipt),
    readClaim:async()=>({...claim(t),...override.claim}),
    readControls:async()=>({globalPaused:false,aiPaused:false,...override.controls})
  };
  const checks={readVerified:async()=>REQUIRED_CHECKS.map((workflow,i)=>({
    workflow,repository:REPOSITORY,headSha:sha,provenanceVerified:true,
    runId:100+i,runAttempt:1,status:'completed',conclusion:'success',
    jobs:REQUIRED_JOBS[workflow].map(name=>({name,status:'completed',conclusion:'success'}))
  }))};
  const ports={brain,checks,budget:{reserve:()=>called.reserve++,settle:()=>called.settle++},
    builder:{execute:()=>called.provider++}};
  const options={mode:'synthetic-review',signingKey:key,nativeOutputJSON:JSON.stringify(proposal(t))};
  return {ports,options,called};
}
test('default OFF, zero provider calls or budget writes',async()=>{
  const t=task(),m=mock(t),r=await reviewCanonicalTask(t,m.ports);
  assert.equal(r.code,'REVIEW_ONLY_MODE_REQUIRED');
  assert.deepEqual(m.called,{reserve:0,settle:0,provider:0});
});
for(const lane of ['A','B'])test('single immutable Brain reservation, proposal only '+lane,async()=>{
  const t=task(lane==='A'?2:3,lane,'build',[lane==='A'?a:b]),m=mock(t);
  const r=await reviewCanonicalTask(t,m.ports,m.options);
  assert.equal(r.status,'PROPOSAL_REVIEW_ONLY');
  assert.equal(r.centralLedgerReservationId,reservation);
  assert.equal(r.financialSettlementVerified,false);
  assert.equal(r.draftPrCreated,false);
  assert.equal(r.mergeAllowed,false);
  assert.deepEqual(m.called,{reserve:0,settle:0,provider:0});
});
test('unknown prior claim retains Brain locks and billing',async()=>{
  const t=task(4),m=mock(t,{claim:{status:'RECONCILE_REQUIRED'}});
  assert.equal((await reviewCanonicalTask(t,m.ports,m.options)).code,'CANONICAL_CLAIM_UNVERIFIED');
  assert.equal(m.called.reserve,0);
});
test('missing canonical reservation blocks, never creates another',async()=>{
  const t=task(5),m=mock(t,{claim:{budgetReservationId:null}});
  assert.equal((await reviewCanonicalTask(t,m.ports,m.options)).code,'CANONICAL_LEDGER_RESERVATION_UNVERIFIED');
  assert.equal(m.called.reserve,0);
});
test('changed file scope and forged MAC are rejected',async()=>{
  const t=task(6),m=mock(t,{receipt:{allowedPaths:[b]}});
  assert.equal((await reviewCanonicalTask(t,m.ports,m.options)).code,'BRAIN_PATH_AUTHORIZATION_MISMATCH');
  const n=mock(t);n.ports.brain.readSignedReceipt=async()=>({
    ...(await signed(t)),signature:'f'.repeat(64)
  });
  assert.equal((await reviewCanonicalTask(t,n.ports,n.options)).code,'BRAIN_SIGNATURE_INVALID');
});
test('Brain pause blocks even a read-only proposal',async()=>{
  const t=task(7),m=mock(t,{controls:{aiPaused:true}});
  assert.equal((await reviewCanonicalTask(t,m.ports,m.options)).code,'BRAIN_PAUSED');
});
test('strict JSON and out-of-scope native edit fail closed',async()=>{
  const t=task(8),m=mock(t);
  assert.equal((await reviewCanonicalTask(t,m.ports,{...m.options,nativeOutputJSON:'{'})).code,'INVALID_NATIVE_JSON');
  const p=proposal(t);p.proposal.changes[0].path=b;
  assert.equal((await reviewCanonicalTask(t,m.ports,{...m.options,nativeOutputJSON:JSON.stringify(p)})).code,'UNSAFE_OR_OUT_OF_SCOPE_PROPOSAL');
});
test('missing required Testing workflows remain blocked',async()=>{
  const t=task(9,undefined,'testing'),m=mock(t);
  m.ports.checks.readVerified=async()=>[];
  const r=await reviewCanonicalTask(t,m.ports,m.options);
  assert.equal(r.status,'TESTING_FAILED_CLOSED');
  assert.equal(r.mergeAllowed,false);
  assert.deepEqual(m.called,{reserve:0,settle:0,provider:0});
});
test('passed Testing evidence remains review-only',async()=>{
  const t=task(10,undefined,'testing'),m=mock(t);
  const r=await reviewCanonicalTask(t,m.ports,m.options);
  assert.equal(r.status,'TESTING_PASSED_REVIEW_ONLY');
  assert.equal(r.mergeAllowed,false);
});
test('provider status spoofing cannot claim a merged PR',async()=>{
  const t=task(11),m=mock(t),p=proposal(t);p.status='merged';
  assert.equal((await reviewCanonicalTask(t,m.ports,{...m.options,nativeOutputJSON:JSON.stringify(p)})).code,'GEMINI_OUTPUT_CONTRACT_MISMATCH');
});
