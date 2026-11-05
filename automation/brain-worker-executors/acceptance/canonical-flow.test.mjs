/** Six-module cross-PR synthetic handoff; NO live GitHub, Brain or AI calls. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir=process.env.ACCEPTANCE_SOURCE_DIR;
if(!dir)throw Error('Missing pinned integration and provenance sources');
const load=(name,file)=>import(pathToFileURL(resolve(dir,name,
  'automation/brain-worker-executors/integration',file)).href);
const [core,review,readback]=await Promise.all([
  load('integration','index.mjs'),
  load('integration','canonical-review.mjs'),
  load('provenance','github-readback.mjs')
]);
const SHA='a'.repeat(40),SCOPE='d'.repeat(64),KEY='only-a-synthetic-signing-key-for-mock-acceptance-tests';
const PATH='automation/acceptance-example.mjs';
const id=n=>'99999999-9999-4999-8999-'+String(n).padStart(12,'0');
const task=(n,lane,type='build')=>({taskId:id(n),receiptId:id(100+n),
  type,commitSha:SHA,...(type==='build'?{lane}:{}),paths:[PATH]});
function receipt(t){
  return {verified:true,issuer:'central-brain',audience:core.AUDIENCE,
    repository:core.REPOSITORY,approved:true,taskId:t.taskId,
    receiptId:t.receiptId,commitSha:SHA,type:t.type,
    lane:t.type==='build'?t.lane:null,allowedPaths:t.paths,scopeDigest:SCOPE,
    expiresAtMs:Date.now()+60000,permissions:{draftOnly:true,merge:false,deploy:false}};
}
const reserveId=t=>t.lane==='A'?'e'.repeat(64):'f'.repeat(64);
function claim(t){
  return {taskId:t.taskId,type:t.type==='build'?'BUILD_'+t.lane:'TESTING',
    status:'CLAIMED',baseCommit:SHA,scopeDigest:SCOPE,
    executor:t.type==='build'?(t.lane==='A'?'gemini':'gemma'):'github-actions',
    budgetReservationId:t.type==='build'?reserveId(t):null,
    productionAllowed:false,autoMergeAllowed:false};
}
async function sign(t){
  const raw=JSON.stringify(receipt(t)),timestampMs=Date.now();
  const encoder=new TextEncoder();
  const key=await crypto.subtle.importKey('raw',encoder.encode(KEY),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const buffer=await crypto.subtle.sign('HMAC',key,
    encoder.encode(String(timestampMs)+'\n'+raw));
  const signature=[...new Uint8Array(buffer)].map(x=>x.toString(16).padStart(2,'0')).join('');
  return {raw,timestampMs,signature};
}
function proposal(t){
  if(t.lane==='A')return {
    status:'DRAFT_REVIEW_REQUIRED',provider:'gemini',modelId:'gemini-2.5-flash-lite',
    taskId:t.taskId,commitSha:SHA,reservationId:reserveId(t),
    githubWritesPerformed:false,testsExecuted:false,mergeAllowed:false,deployAllowed:false,
    proposal:{summary:'Offline scoped proposal',changes:[{path:PATH,
      content:'export const x=1;',rationale:'Test only'}],testNotes:[],risks:[]}
  };
  return {status:'proposed',modelId:'@cf/google/gemma-4-26b-a4b-it',
    eventId:t.taskId,writesPerformed:false,mergeAllowed:false,deployAllowed:false,
    proposal:{summary:'Offline scoped proposal',files:[{path:PATH,
      replacement:'export const x=2;',reason:'Test only'}],tests:[],risk:'low'}};
}
function githubMock(){
  const branch='test/acceptance',repo=core.REPOSITORY,repoId=928;
  const runs=core.REQUIRED_CHECKS.map((name,i)=>({
    id:500+i,workflow_id:600+i,path:'.github/workflows/'+name,
    head_sha:SHA,head_branch:branch,run_attempt:2,
    repository:{id:repoId,full_name:repo},
    head_repository:{id:repoId,full_name:repo},
    status:'completed',conclusion:'success',event:'pull_request'
  }));
  const jobs=new Map(runs.map((run,i)=>[run.id,core.REQUIRED_JOBS[core.REQUIRED_CHECKS[i]].map(
    (name,j)=>({id:9000+i*10+j,run_id:run.id,run_attempt:2,
      name,status:'completed',conclusion:'success'}))]));
  const nativeRunner=async()=>({status:'passed',sha:SHA,checks:runs.map(r=>({
    workflow:r.path,runId:r.id,conclusion:r.conclusion,state:'passed',jobs:jobs.get(r.id)}))});
  const fetchImpl=async(url,options)=>{
    assert.equal(options.method,'GET');
    const u=new URL(url),path=u.pathname;
    let response;
    if(url==='https://api.github.com/repos/'+repo)
      response={full_name:repo,id:repoId};
    else if(path.endsWith('/commits/'+SHA))
      response={sha:SHA,url:'https://api.github.com/repos/'+repo+'/commits/'+SHA};
    else if(path.endsWith('/actions/runs'))
      response={workflow_runs:runs,total_count:runs.length};
    else if(/\/actions\/runs\/\d+\/jobs$/.test(path)){
      const runId=Number(path.split('/').at(-2)),list=jobs.get(runId);
      response={jobs:list,total_count:list.length};
    }else if(/\/actions\/runs\/\d+$/.test(path))
      response=runs.find(r=>r.id===Number(path.split('/').at(-1)));
    if(!response)throw Error('Unexpected synthetic API route');
    return new Response(JSON.stringify(response),{status:200});
  };
  return readback.createVerifiedTestingChecksPort({
    nativeRunner,token:'FAKE_TEST_TOKEN',fetchImpl,branch,maxRetries:0});
}
function brainPorts(t,checks,state){
  return {brain:{
    readSignedReceipt:async()=>sign(t),
    readClaim:async()=>{state.readbacks++;return claim(t);},
    readControls:async()=>({globalPaused:false,aiPaused:false})
  },checks,builder:{execute:()=>{state.providerCalls++;throw Error('No provider traffic');}},
    budget:{reserve:()=>{state.ledgerWrites++;throw Error('No ledger writes');}}};
}
test('signed Brain -> A review, B fail-closed, Testing readback, mock only',async()=>{
  const state={providerCalls:0,ledgerWrites:0,readbacks:0},checks=githubMock();
  // Gemini can produce a review-only proposal after mock signed Brain readback.
  const aTask=task(1,'A');
  const aResult=await review.reviewCanonicalTask(aTask,brainPorts(aTask,checks,state),{
    mode:'synthetic-review',signingKey:KEY,nativeOutputJSON:JSON.stringify(proposal(aTask))
  });
  assert.equal(aResult.status,'PROPOSAL_REVIEW_ONLY',JSON.stringify(aResult));
  assert.equal(aResult.centralLedgerReservationId,reserveId(aTask));
  assert.equal(aResult.centralLedgerReadback,true);
  assert.equal(aResult.financialSettlementVerified,false);
  assert.equal(aResult.draftPrCreated,false);
  assert.equal(aResult.mergeAllowed,false);

  // Current native Gemma output has NO attested commitSha. Do not invent it:
  // provenance validation must BLOCK B until its upstream owner fixes the contract.
  const bTask=task(2,'B');
  const bResult=await review.reviewCanonicalTask(bTask,brainPorts(bTask,checks,state),{
    mode:'synthetic-review',signingKey:KEY,nativeOutputJSON:JSON.stringify(proposal(bTask))
  });
  assert.equal(bResult.status,'BLOCKED',JSON.stringify(bResult));
  assert.equal(bResult.code,'GEMMA_OUTPUT_CONTRACT_MISMATCH');
  assert.equal(bResult.providerCalls,0);
  assert.equal(bResult.ledgerWrites,0);
  assert.equal(bResult.mergeAllowed,false);
  const t=task(3,undefined,'testing');
  const result=await review.reviewCanonicalTask(t,brainPorts(t,checks,state),{
    mode:'synthetic-review',signingKey:KEY
  });
  assert.equal(result.status,'TESTING_PASSED_REVIEW_ONLY',JSON.stringify(result));
  assert.equal(result.gate.passed,true);
  assert.equal(result.gate.runIds.length,8);
  assert.equal(result.mergeAllowed,false);
  assert.deepEqual(state,{providerCalls:0,ledgerWrites:0,readbacks:5});
});
