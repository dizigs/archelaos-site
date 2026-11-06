import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  REPOSITORY, AUDIENCE, REQUIRED_CHECKS, REQUIRED_JOBS,
  IntegrationBlocked, normalizeIntent, confirmBrainReceipt,
  verifySignedBrainEnvelope, evaluateTestingGate, runIntegration, safePath, overlaps
} from './index.mjs';

const sha='a'.repeat(40);
const uuid=n=>'11111111-1111-4111-8111-'+String(n).padStart(12,'0');
const pathA='automation/alpha.js', pathB='automation/beta.js';
const task=(n=1,paths=[pathA],lane='A')=>({
  taskId:uuid(n),receiptId:uuid(100+n),commitSha:sha,type:'build',lane,paths
});
const approval=t=>({
  verified:true,issuer:'central-brain',audience:AUDIENCE,repository:REPOSITORY,
  approved:true,taskId:t.taskId,receiptId:t.receiptId,
  commitSha:t.commitSha,type:t.type,lane:t.lane,
  expiresAtMs:Date.now()+60_000,allowedPaths:t.paths,
  permissions:{draftOnly:true,merge:false,deploy:false}
});
const checks=()=>REQUIRED_CHECKS.map((workflow,i)=>({
  workflow,repository:REPOSITORY,headSha:sha,provenanceVerified:true,
  runId:i+100,runAttempt:1,status:'completed',conclusion:'success',
  jobs:REQUIRED_JOBS[workflow].map(name=>({name,status:'completed',conclusion:'success'}))
}));

test('only canonical Brain may dispatch; old double-budget entrypoint is inert',()=>{
  const calls={reserve:0,claim:0,execute:0};
  const ports={
    ledger:{reserve:()=>calls.reserve++},
    coordinator:{claim:()=>calls.claim++},
    builders:{A:{execute:()=>calls.execute++}}
  };
  for(let i=0;i<3;i++){
    const response=runIntegration(task(1),ports,{
      enabled:true,executionMode:'staging-approved',
      providersAttested:true,centralLedgerConfirmed:true
    });
    assert.equal(response.code,'CANONICAL_BRAIN_ONLY');
    assert.equal(response.providerCalls,0);
    assert.equal(response.mergeAllowed,false);
  }
  assert.deepEqual(calls,{reserve:0,claim:0,execute:0});
});

test('only safe, immutable repository paths and non-overlapping scope',()=>{
  assert.equal(safePath(pathA),true);
  assert.equal(safePath('brain/src/worker.mjs'),false);
  assert.equal(safePath('automation/../brain/src/worker.mjs'),false);
  assert.equal(safePath('automation/brain-worker-executors/integration/index.mjs'),false);
  assert.equal(safePath('automation/allowed/',true),true);
  assert.equal(overlaps('automation/allowed/','automation/allowed/a.js'),true);
  assert.equal(overlaps('automation/a.js','automation/b.js'),false);
  assert.throws(()=>normalizeIntent(task(2,['automation/../bad.js'])),IntegrationBlocked);
});

test('task identifiers, paths and flags are strict',()=>{
  const t=task();
  assert.equal(normalizeIntent(t).lane,'A');
  assert.throws(()=>normalizeIntent({...t,paths:[]}),IntegrationBlocked);
  assert.throws(()=>normalizeIntent({...t,paths:[pathA,pathA]}),IntegrationBlocked);
  assert.throws(()=>normalizeIntent({...t,commitSha:'wrong'}),IntegrationBlocked);
  assert.throws(()=>normalizeIntent({...t,production:true}),IntegrationBlocked);
  assert.throws(()=>normalizeIntent({...t,autoMerge:true}),IntegrationBlocked);
  assert.throws(()=>normalizeIntent({...t,lane:'C'}),IntegrationBlocked);
});

test('Brain authorization must match exact task, time, scope and review-only permissions',()=>{
  const t=normalizeIntent(task());
  assert.equal(confirmBrainReceipt(t,approval(t)),true);
  assert.throws(()=>confirmBrainReceipt(t,{...approval(t),approved:false}),IntegrationBlocked);
  assert.throws(()=>confirmBrainReceipt(t,{...approval(t),allowedPaths:[pathB]}),IntegrationBlocked);
  assert.throws(()=>confirmBrainReceipt(t,{...approval(t),expiresAtMs:Date.now()-1}),IntegrationBlocked);
  assert.throws(()=>confirmBrainReceipt(t,{...approval(t),permissions:{
    draftOnly:true,merge:true,deploy:false
  }}),IntegrationBlocked);
});

test('verified GitHub workflow set must match exact SHA, run attempt and each job',()=>{
  assert.equal(evaluateTestingGate(sha,checks()).passed,true);
  assert.equal(evaluateTestingGate(sha,checks().slice(1)).passed,false);
  assert.equal(evaluateTestingGate(sha,[...checks(),checks()[0]]).passed,false);
  assert.equal(evaluateTestingGate('b'.repeat(40),checks()).passed,false);
  assert.equal(evaluateTestingGate(sha,checks().map((x,i)=>i===0?{...x,
    conclusion:'skipped'}:x)).passed,false);
  assert.equal(evaluateTestingGate(sha,checks().map((x,i)=>i===0?{...x,
    runAttempt:null}:x)).passed,false);
  assert.equal(evaluateTestingGate(sha,checks().map((x,i)=>i===0?{...x,
    jobs:x.jobs.map(j=>({...j,conclusion:'failure'}))}:x)).passed,false);
});

test('signed receipt rejects tampering and stale timestamp',async()=>{
  const now=Date.now();
  const raw=JSON.stringify(approval(normalizeIntent(task())));
  const key='synthetic-test-only-long-key-material-with-adequate-length';
  const encoder=new TextEncoder();
  const signingKey=await webcrypto.subtle.importKey('raw',encoder.encode(key),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=await webcrypto.subtle.sign('HMAC',signingKey,
    encoder.encode(String(now)+'\n'+raw));
  const signature=[...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');
  const signed={raw,signature,timestampMs:now};
  assert.deepEqual(await verifySignedBrainEnvelope(signed,key,now),JSON.parse(raw));
  await assert.rejects(verifySignedBrainEnvelope({...signed,signature:'a'.repeat(64)},key,now));
  await assert.rejects(verifySignedBrainEnvelope({...signed,timestampMs:now-600_000},key,now));
});
