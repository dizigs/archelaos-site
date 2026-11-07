import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {FLAGS,FIELDS,guard,record,sign,verify,digest} from '../qa/selfheal/protocol.mjs';

const KEY='synthetic-local-qa-hmac-'.repeat(4);
const RUNNER='synthetic-local-qa-operator-'.repeat(4);
const SHA='a'.repeat(40);
const ids={brain:'204965a6ba624184bfdfccb94794aff8',healer:'ac43359770de4a058fd77bd4d5257226'};
const env=(role,runId)=>({QA_ENABLED:'true',QA_ROLE:role,QA_RUN_ID:runId,
  QA_PREVIEW_ID:ids[role],QA_PEER_PREVIEW_ID:ids[role==='brain'?'healer':'brain'],
  QA_SOURCE_SHA:SHA,QA_EXPIRES_AT:new Date(Date.now()+20*60000).toISOString(),
  HEALER_EVENT_HMAC_KEY:KEY,QA_RUNNER_KEY:RUNNER,...Object.fromEntries(FLAGS.map(f=>[f,'false']))});
const signed=async(e,scope='qa.start.v1',patch={})=>sign({v:1,scope,runId:e.QA_RUN_ID,sourceSha:SHA,
  issuedAtMs:Date.now(),nonce:randomUUID().replaceAll('-',''),...patch},FIELDS.start,RUNNER);

test('QA requires exact isolated preview identities, finite expiry and every production permission OFF',()=>{
  const e=env('brain',randomUUID());guard(e);
  for(const patch of [{QA_ENABLED:'false'},{QA_PREVIEW_ID:ids.healer},
    {QA_PEER_PREVIEW_ID:'production'},{QA_SOURCE_SHA:'0'.repeat(40)},
    {QA_EXPIRES_AT:'1970-01-01T00:00:00Z'},{QA_EXPIRES_AT:new Date(Date.now()+60*60000).toISOString()},
    {QA_RUNNER_KEY:KEY},{QA_RUN_ID:'not-a-run'},
    ...FLAGS.map(f=>({[f]:'true'})),
    ...['BRAIN','HEALER_MEMORY','HEALER','BRAIN_RECOVERY','AI','BRAIN_GITHUB_READ_TOKEN'].map(f=>({[f]:{}}))])
    assert.throws(()=>guard({...e,...patch}));
});
test('HMAC domain, fresh run/SHA and exact records reject stale, forged, cross-run and extra metadata',async()=>{
  const e=env('brain',randomUUID()),r=await signed(e);
  assert.equal((await verify(r,'start','qa.start.v1',e,RUNNER)).runId,e.QA_RUN_ID);
  for(const bad of [{...r,scope:'selfheal.command.v1'},{...r,sourceSha:'b'.repeat(40)},
    {...r,runId:randomUUID()},{...r,unexpected:true},{...r,signature:'f'.repeat(64)},
    await signed(e,'qa.start.v1',{issuedAtMs:Date.now()-61000})])
    await assert.rejects(()=>verify(bad,'start','qa.start.v1',e,RUNNER));
});
test('RPC lifetime normalization never invokes getters or exports a capability',async()=>{
  const r=await signed(env('brain',randomUUID()));let calls=0;
  Object.defineProperty(r,Symbol.dispose,{value:()=>calls++});
  assert.equal(record(r,FIELDS.start).scope,'qa.start.v1');assert.equal(calls,0);
  const getter={...r};Object.defineProperty(getter,'scope',{get(){calls++;return 'qa.start.v1';},enumerable:true});
  assert.throws(()=>record(getter,FIELDS.start));assert.equal(calls,0);
  assert.throws(()=>record({...r,[Symbol('capability')]:()=>{}},FIELDS.start));
});
const runner=`export default {async fetch(r,env){const x=await r.json();try {
 const peer=x.role==='healer'?env.HEALER:env.BRAIN;
 if(x.op==='probe'){const out=[];for(const k of ['env','ctx','memory','storage']){try{out.push((await peer[k])==null)}catch{out.push(true)}}return Response.json({probe:out});}
 return Response.json(await peer[x.op](x.request));
 }catch{return Response.json({denied:true});}}}`;
const relay=`import {WorkerEntrypoint} from 'cloudflare:workers';
export default class extends WorkerEntrypoint {
 async accept(r){const a=await this.env.REMOTE.accept(r);
  if(this.env.MODE==='lost_ack')throw Error('SYNTHETIC_LOST_ACK');
  if(this.env.MODE==='timeout')await new Promise(resolve=>setTimeout(resolve,2500));
  if(this.env.MODE==='forged_ack')return {...a,challengeDigest:'0'.repeat(64)};
  return a;}
 async read(r){if(this.env.MODE==='failed_readback')throw Error('SYNTHETIC_READ_FAILURE');
 const a=await this.env.REMOTE.read(r);
 if(this.env.MODE==='forged_readback')return {...a,nonce:'0'.repeat(32)};
 return a;}
}`;
async function fixture(mode='normal',wrongKey=false){
  const {Miniflare}=await import('miniflare');
  const dir=await mkdtemp(join(tmpdir(),'isolated-selfheal-qa-'));
  const runId=randomUUID(),brain=env('brain',runId),healer=env('healer',runId);
  if(wrongKey)healer.HEALER_EVENT_HMAC_KEY='synthetic-wrong-key-'.repeat(4);
  const script=fileURLToPath(new URL('../qa/selfheal/worker.mjs',import.meta.url));
  const root=fileURLToPath(new URL('../qa/selfheal/',import.meta.url));
  let outbound=0,mf;
  const make=()=>new Miniflare({workers:[
    {name:'qa-brain',modules:true,scriptPath:script,modulesRoot:root,compatibilityDate:'2026-11-01',
      bindings:brain,durableObjects:{QA_MEMORY:{className:'IsolatedSelfhealQaMemory',useSQLite:true}},
      serviceBindings:{QA_PEER:{name:mode==='normal'?'qa-healer':'qa-relay'}}},
    {name:'qa-healer',modules:true,scriptPath:script,modulesRoot:root,compatibilityDate:'2026-11-01',
      bindings:healer,durableObjects:{QA_MEMORY:{className:'IsolatedSelfhealQaMemory',useSQLite:true}}},
    {name:'qa-relay',modules:true,script:relay,compatibilityDate:'2026-11-01',bindings:{MODE:mode},
      serviceBindings:{REMOTE:{name:'qa-healer'}}},
    {name:'test-runner',modules:true,script:runner,compatibilityDate:'2026-11-01',
      serviceBindings:{BRAIN:{name:'qa-brain'},HEALER:{name:'qa-healer'}}}
  ],durableObjectsPersist:dir,outboundService:async()=>{outbound++;return new Response('EXTERNAL_EGRESS_FORBIDDEN',{status:503});}});
  mf=make();
  return {brain,healer,
    async call(op,request,role='brain'){const w=await mf.getWorker('test-runner');return (await w.fetch('https://synthetic.invalid/',{method:'POST',body:JSON.stringify({op,request,role})})).json();},
    async status(role='brain'){return this.call('status',await signed(role==='brain'?brain:healer,'qa.status.v1'),role);},
    async restart(){await mf.dispose();mf=make();},
    async close(){await mf.dispose();await rm(dir,{recursive:true,force:true});assert.equal(outbound,0);},
    async http(){return (await (await mf.getWorker('qa-brain')).fetch('https://synthetic.invalid/')).status;}
  };
}
test('native two-private-Worker QA stores ACK/readback, survives restart and never redelivers',async()=>{
  const f=await fixture();try{
    assert.equal(await f.http(),404);
    const request=await signed(f.brain);
    const out=await f.call('start',request);
    assert.equal(out.status,'ACKNOWLEDGED');assert.equal(out.productionAuthenticated,false);
    assert.equal(out.recoveryExecuted,false);assert.equal(out.deliveryAttempts,1);
    assert.equal((await f.call('start',request)).denied,true);
    assert.equal((await f.call('start',await signed(f.brain))).denied,true);
    await f.restart();
    assert.equal((await f.call('reconcile',await signed(f.brain,'qa.reconcile.v1'))).status,'ACKNOWLEDGED');
    assert.equal((await f.status()).deliveryAttempts,1);
    assert.equal((await f.status('healer')).receipts,1);
    assert.equal((await f.call('start',await signed(f.brain),'healer')).denied,true);
    assert.ok((await f.call('probe')).probe.every(Boolean));
  }finally{await f.close();}
});
test('native mismatched peer HMAC produces UNKNOWN and no stored receiver receipt',async()=>{
  const f=await fixture('normal',true);try{
    assert.equal((await f.call('start',await signed(f.brain))).status,'UNKNOWN');
    assert.equal((await f.status('healer')).receipts,0);
    assert.equal((await f.call('reconcile',await signed(f.brain,'qa.reconcile.v1'))).status,'UNKNOWN');
    assert.equal((await f.status()).deliveryAttempts,1);
  }finally{await f.close();}
});
for(const mode of ['lost_ack','forged_ack','failed_readback','forged_readback','timeout']){
 test('native '+mode+' quarantines UNKNOWN; reconciliation never dispatches twice',async()=>{
  const f=await fixture(mode);try{
    const out=await f.call('start',await signed(f.brain));assert.equal(out.status,'UNKNOWN');
    await f.restart();
    const read=await f.call('reconcile',await signed(f.brain,'qa.reconcile.v1'));
    assert.equal(read.status,['lost_ack','forged_ack','timeout'].includes(mode)?'ACKNOWLEDGED':'UNKNOWN');
    assert.equal((await f.status()).deliveryAttempts,1);
    assert.equal((await f.status('healer')).receipts,1);
  }finally{await f.close();}
 });
}
test('native unauthenticated runner and scope replay are rejected before delivery',async()=>{
 const f=await fixture();try{
  const bad=await signed(f.brain);bad.signature='0'.repeat(64);
  assert.equal((await f.call('start',bad)).denied,true);
  assert.equal((await f.call('start',await signed(f.brain,'qa.status.v1'))).denied,true);
  assert.equal((await f.status()).deliveryAttempts,0);
  assert.equal((await f.status('healer')).receipts,0);
 }finally{await f.close();}
});

test('native receiver challenge and readback replay are rejected with one durable receipt',async()=>{
 const f=await fixture();try{
  const challenge=await sign({v:1,scope:'qa.challenge.v1',runId:f.brain.QA_RUN_ID,
    sourceSha:SHA,issuedAtMs:Date.now(),nonce:randomUUID().replaceAll('-','')},FIELDS.challenge,KEY);
  assert.equal((await f.call('accept',challenge,'healer')).status,'QA_RECEIVED_NO_ACTION');
  assert.equal((await f.call('accept',challenge,'healer')).denied,true);
  const read=await sign({v:1,scope:'qa.read.v1',runId:f.brain.QA_RUN_ID,sourceSha:SHA,
    challengeDigest:await digest(challenge),deliveryNonce:challenge.nonce,
    issuedAtMs:Date.now(),nonce:randomUUID().replaceAll('-','')},FIELDS.read,KEY);
  assert.equal((await f.call('read',read,'healer')).status,'FOUND');
  assert.equal((await f.call('read',read,'healer')).denied,true);
  assert.equal((await f.status('healer')).receipts,1);
 }finally{await f.close();}
});
