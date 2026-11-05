import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
if(!process.env.ACCEPTANCE_SOURCE_DIR)throw Error('Missing pinned source');
const m=await import(pathToFileURL(resolve(process.env.ACCEPTANCE_SOURCE_DIR,
  'integration','automation/brain-worker-executors/integration/index.mjs')).href);
const sha='a'.repeat(40),now=Date.now();
const id=n=>'88888888-8888-4888-8888-'+String(n).padStart(12,'0');
const task=(n,lane='A',paths=['automation/scope-'+n+'.mjs'])=>m.normalizeIntent({
  taskId:id(n),receiptId:id(n+100),type:'build',lane,commitSha:sha,paths});
class Store{
  constructor(){this.rows=new Map();this.sql={exec:(q,...a)=>{
    if(q.startsWith('CREATE TABLE'))return [];
    if(q.startsWith('SELECT fingerprint,state')||q.startsWith('SELECT state FROM')){
      const r=this.rows.get(a[0]);return r?[r]:[];
    }
    if(q.startsWith('SELECT type,scopes'))return [...this.rows.values()]
      .filter(r=>['CLAIMED','UNKNOWN'].includes(r.state));
    if(q.startsWith('INSERT INTO')){const [task_id,fingerprint,type,state,scopes,created,updated]=a;
      this.rows.set(task_id,{task_id,fingerprint,type,state,scopes,created,updated});return [];}
    if(q.startsWith('UPDATE')){const [state,updated,key]=a;
      Object.assign(this.rows.get(key),{state,updated});return [];}
    throw Error('Unexpected SQL');
  }};}
  transactionSync(f){return f();}
}
test('restart preserves UNKNOWN reservation and locks: no lost-ack retry',()=>{
  const store=new Store(),a=new m.SqlCoordinator(store),first=task(1,'A',['automation/locks/']);
  assert.equal(a.claim(first).status,'CLAIMED');
  a.finish(first.taskId,'UNKNOWN');
  const restarted=new m.SqlCoordinator(store);
  assert.equal(restarted.claim(first).status,'REPLAY_BLOCKED');
  assert.throws(()=>restarted.finish(first.taskId,'COMPLETE'),/RECONCILIATION_REQUIRED/);
  assert.throws(()=>restarted.claim(task(2,'B',['automation/locks/a.mjs'])),/FILE_SCOPE_BUSY/);
});
test('two builder ceiling survives coordinator restart and retains immutable idempotency',()=>{
  const store=new Store(),a=new m.SqlCoordinator(store),
    t1=task(3),t2=task(4,'B');
  assert.equal(a.claim(t1).status,'CLAIMED');
  assert.equal(a.claim(t2).status,'CLAIMED');
  const b=new m.SqlCoordinator(store);
  assert.throws(()=>b.claim(task(5)),/TWO_BUILD_LIMIT_REACHED/);
  assert.throws(()=>b.claim({...t1,paths:['automation/mutated.mjs']}),/IDEMPOTENCY_PAYLOAD_CONFLICT/);
  b.finish(t1.taskId,'COMPLETE');
  assert.equal(b.claim(t1).status,'REPLAY_COMPLETE');
  assert.equal(b.claim(task(5)).status,'CLAIMED');
});
test('tampered signed receipt, invalid signature or expired timestamp are denied',async()=>{
  const t=task(6),raw=JSON.stringify({taskId:t.taskId,approved:true}),
    key='synthetic-no-real-key-material-more-than-forty-three-bytes',
    enc=new TextEncoder();
  const k=await crypto.subtle.importKey('raw',enc.encode(key),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',k,enc.encode(now+'\n'+raw)));
  const signature=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
  const signed={raw,timestampMs:now,signature};
  assert.equal((await m.verifySignedBrainEnvelope(signed,key,now)).taskId,t.taskId);
  await assert.rejects(m.verifySignedBrainEnvelope({...signed,raw:raw+' '},key,now),/BRAIN_SIGNATURE_INVALID/);
  await assert.rejects(m.verifySignedBrainEnvelope({...signed,signature:'0'.repeat(64)},key,now),/BRAIN_SIGNATURE_INVALID/);
  await assert.rejects(m.verifySignedBrainEnvelope(signed,key,now+600000),/BRAIN_SIGNATURE_INVALID/);
});
test('Brain/Builder mock lost acknowledgement retains UNKNOWN with zero automatic second provider call',async()=>{
  const store=new Store(),t=task(7),state={provider:0,reserve:0,settle:0};
  const coordinator=new m.SqlCoordinator(store);
  const ports={coordinator,checks:{readVerified:async()=>[]},
    brain:{verifyTaskReceipt:async()=>({verified:true,issuer:'central-brain',
      audience:m.AUDIENCE,repository:m.REPOSITORY,approved:true,taskId:t.taskId,
      receiptId:t.receiptId,commitSha:t.commitSha,type:t.type,lane:t.lane,
      expiresAtMs:now+60000,allowedPaths:t.paths,
      permissions:{draftOnly:true,merge:false,deploy:false}}),
      readControls:async()=>({globalPaused:false,aiPaused:false}),
      ledger:{reserve:async()=>{state.reserve++;return {accepted:true,shared:true,
        reservationId:'SYNTHETIC_ONLY',amountMicroEur:1000};},
        claim:async()=>({authorized:true}),
        settle:async()=>{state.settle++;throw Error('LOST_ACK');}}},
    builders:{A:{verified:true,billingContract:'central-preclaimed-v1',
      reservesInternally:false,settlesInternally:false,
      quote:async()=>({verified:true,modelId:'SYNTHETIC_NO_PROVIDER',maxMicroEur:1000}),
      execute:async()=>{state.provider++;return {verified:true,commitSha:sha,
        draftOnly:true,mergeAllowed:false,deployAllowed:false,changedFiles:t.paths,
        draftRef:'#100',actualMicroEur:100};}}}};
  const policy={enabled:true,executionMode:'staging-approved',
    providersAttested:true,centralLedgerConfirmed:true};
  assert.equal((await m.runIntegration(t,ports,policy,now)).code,'PORT_FAILURE_OR_OUTCOME_UNKNOWN');
  ports.coordinator=new m.SqlCoordinator(store);
  assert.equal((await m.runIntegration(t,ports,policy,now)).code,'IDEMPOTENT_REPLAY_BLOCKED');
  assert.deepEqual(state,{provider:1,reserve:1,settle:1});
});
