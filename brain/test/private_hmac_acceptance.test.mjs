import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdtemp,rm,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {Miniflare} from 'miniflare';
import {acceptanceConfig,createAcceptanceChallenge,verifyAcceptanceChallenge,
  answerAcceptanceChallenge,verifyAcceptanceResponse} from '../src/private_hmac_protocol.mjs';

const KEY='synthetic-private-hmac-proof-only-'.repeat(3);
const OTHER='different-synthetic-private-hmac-'.repeat(3);
const SHA='b'.repeat(40);
function bindings(role,session=randomUUID()) {
  return {PRIVATE_HMAC_ACCEPTANCE_ISOLATED:'true',PRIVATE_HMAC_ACCEPTANCE_ROLE:role,
    PRIVATE_HMAC_ACCEPTANCE_SESSION:session,PRIVATE_HMAC_ACCEPTANCE_APPROVED_SHA:SHA,DEPLOY_SHA:SHA,
    PRIVATE_HMAC_ACCEPTANCE_STARTED_AT:new Date(Date.now()-1000).toISOString(),
    PRIVATE_HMAC_ACCEPTANCE_EXPIRES_AT:new Date(Date.now()+180000).toISOString(),
    BRAIN_SELFHEAL_RECOVERY_ENABLED:'false',BRAIN_SELFHEAL_BINDING_ATTESTED:'false',
    BRAIN_SELFHEAL_DISPATCH_ENABLED:'false',BRAIN_SELFHEAL_DURABLE_ACK_ENABLED:'false',
    HEALER_DURABLE_ACK_ENABLED:'false',STAGING_EXPIRES_AT:'1970-01-01T00:00:00Z',HEALER_EVENT_HMAC_KEY:KEY};
}
test('private HMAC domains bind session, revision, nonce, peers and deadline; hostile records never invoke getters',async()=>{
  const env=bindings('brain'),brain=acceptanceConfig(env,'brain'),healer=acceptanceConfig({...env,PRIVATE_HMAC_ACCEPTANCE_ROLE:'healer'},'healer');
  const request=await createAcceptanceChallenge(brain,KEY),response=await answerAcceptanceChallenge(request,healer,KEY);
  assert.match(request.nonce,/^[a-f0-9]{64}$/);
  await verifyAcceptanceResponse(response,request,brain,KEY);
  await assert.rejects(verifyAcceptanceChallenge(request,healer,OTHER));
  await assert.rejects(verifyAcceptanceResponse(response,request,brain,OTHER));
  await assert.rejects(verifyAcceptanceChallenge({...request,scope:'selfheal.command.v1'},healer,KEY));
  await assert.rejects(verifyAcceptanceChallenge({...request,sessionId:randomUUID()},healer,KEY));
  await assert.rejects(verifyAcceptanceResponse({...response,nonce:'0'.repeat(64)},request,brain,KEY));
  await assert.rejects(verifyAcceptanceResponse(response,request,brain,KEY,request.expiresAtMs));
  let getterCalls=0;
  for (const mutate of [
    r=>{r.extra='unapproved'},r=>{r[Symbol('capability')]='unapproved'},
    r=>Object.defineProperty(r,'status',{get(){getterCalls++;return 'KEY_POSSESSION_CONFIRMED'}}),
    r=>Object.defineProperty(r,Symbol.dispose,{get(){getterCalls++;return ()=>{}}}),
    r=>Object.defineProperty(r,Symbol.dispose,{value:()=>{},enumerable:true}),
    r=>Object.setPrototypeOf(r,{coordinator:'unapproved'})
  ]) {const raw={...response};mutate(raw);await assert.rejects(verifyAcceptanceResponse(raw,request,brain,KEY));}
  assert.equal(getterCalls,0);
  const raw={...response};Object.defineProperty(raw,Symbol.dispose,{value:()=>getterCalls++});
  await verifyAcceptanceResponse(raw,request,brain,KEY);assert.equal(getterCalls,0);
});
test('private permit fails closed by default, on expiry, role/pin/session mismatch or any existing activation flag',()=>{
  const env=bindings('brain');assert.throws(()=>acceptanceConfig({},'brain'));
  for (const patch of [
    {PRIVATE_HMAC_ACCEPTANCE_ISOLATED:'false'},{PRIVATE_HMAC_ACCEPTANCE_ROLE:'healer'},
    {PRIVATE_HMAC_ACCEPTANCE_SESSION:'unapproved'},{DEPLOY_SHA:'c'.repeat(40)},
    {PRIVATE_HMAC_ACCEPTANCE_APPROVED_SHA:'0'.repeat(40),DEPLOY_SHA:'0'.repeat(40)},
    {PRIVATE_HMAC_ACCEPTANCE_EXPIRES_AT:'1970-01-01T00:00:00Z'},
    {PRIVATE_HMAC_ACCEPTANCE_EXPIRES_AT:new Date(Date.now()+600000).toISOString()},
    {STAGING_EXPIRES_AT:new Date(Date.now()+60000).toISOString()},
    ...['BRAIN_SELFHEAL_RECOVERY_ENABLED','BRAIN_SELFHEAL_BINDING_ATTESTED','BRAIN_SELFHEAL_DISPATCH_ENABLED','BRAIN_SELFHEAL_DURABLE_ACK_ENABLED'].map(k=>({[k]:'true'}))
  ]) assert.throws(()=>acceptanceConfig({...env,...patch},'brain'));
  assert.throws(()=>acceptanceConfig({...bindings('healer'),HEALER_DURABLE_ACK_ENABLED:'true'},'healer'));
});
const inspector=String.raw`export default {async fetch(req,env){const x=await req.json();
 const brain=env.BRAIN_NONCES.get(env.BRAIN_NONCES.idFromName('private-hmac-acceptance-v1'));
 const healer=env.HEALER_NONCES.get(env.HEALER_NONCES.idFromName('private-hmac-acceptance-v1'));
 if(x.op==='run')return Response.json(await env.BRAIN.runChallenge());
 if(x.op==='invalid-run')return Response.json(await env.BRAIN.runChallenge({mode:'recovery'}));
 if(x.op==='answer')return Response.json(await env.HEALER.answerChallenge(x.request));
 if(x.op==='state')return Response.json({brain:await brain.__testState(),healer:await healer.__testState(),relay:await env.RELAY.inspect()});
 if(x.op==='captured')return Response.json(await env.RELAY.inspect());
 if(x.op==='reserve')return Response.json(await healer.reserve(x.value));
 if(x.op==='probe'){const denied=[];for(const port of [env.BRAIN,env.HEALER])for(const name of ['env','ctx','nonceStore','coordinator','memory','constructor','__proto__']){try{const result=await port[name];denied.push(result==null)}catch{denied.push(true)}}return Response.json(denied)}
 return new Response('Not found',{status:404});}}`;
const relay=String.raw`import {WorkerEntrypoint} from 'cloudflare:workers';let count=0,captured,cached;
 export default class extends WorkerEntrypoint {
  async answerChallenge(request){count++;captured=request;
   const reply=await this.env.PEER.answerChallenge(request);
   if(this.env.MODE==='timeout')await new Promise(resolve=>setTimeout(resolve,2200));
   if(this.env.MODE==='forged')return {...reply,signature:'0'.repeat(64)};
   if(this.env.MODE==='replay-response'&&cached)return cached;
   cached=reply;return reply;
  }
  async inspect(){return {count,request:captured??null}}
 }`;
async function fixture(mode='normal') {
  const dir=await mkdtemp(join(tmpdir(),'private-hmac-native-')),session=randomUUID();
  const path=resolve('src','.private-hmac-native-'+randomUUID()+'.mjs');
  const source=await readFile(resolve('src/private_hmac_candidate.mjs'),'utf8');
  await writeFile(path,source.replace('export class PrivateHmacNonceStore extends DurableObject {',
    'export class PrivateHmacNonceStore extends DurableObject { async __testState(){return {rows:[...this.#storage.sql.exec("SELECT * FROM acceptance_nonces ORDER BY nonce")],alarm:await this.#storage.getAlarm()}}'));
  const b=bindings('brain',session),h={...b,PRIVATE_HMAC_ACCEPTANCE_ROLE:'healer',HEALER_EVENT_HMAC_KEY:mode==='wrong-key'?OTHER:KEY};
  let mf,egress=0;
  const build=()=>new Miniflare({workers:[
    {name:'brain',modules:true,scriptPath:path,modulesRoot:resolve('src'),compatibilityDate:'2026-11-01',bindings:b,
      durableObjects:{HMAC_NONCES:{className:'PrivateHmacNonceStore',useSQLite:true}},
      serviceBindings:mode==='missing-binding'?{}:{HMAC_PEER:{name:'relay'}}},
    {name:'healer',modules:true,scriptPath:path,modulesRoot:resolve('src'),compatibilityDate:'2026-11-01',bindings:h,
      durableObjects:{HMAC_NONCES:{className:'PrivateHmacNonceStore',useSQLite:true}}},
    {name:'relay',modules:true,script:relay,compatibilityDate:'2026-11-01',bindings:{MODE:mode},
      serviceBindings:{PEER:{name:'healer',entrypoint:'HealerHmacAcceptancePort'}}},
    {name:'inspector',modules:true,script:inspector,compatibilityDate:'2026-11-01',
      durableObjects:{BRAIN_NONCES:{className:'PrivateHmacNonceStore',scriptName:'brain',useSQLite:true},HEALER_NONCES:{className:'PrivateHmacNonceStore',scriptName:'healer',useSQLite:true}},
      serviceBindings:{BRAIN:{name:'brain',entrypoint:'BrainHmacAcceptancePort'},HEALER:{name:'healer',entrypoint:'HealerHmacAcceptancePort'},RELAY:{name:'relay'}}}
  ],durableObjectsPersist:dir,outboundService:async()=>{egress++;return new Response('DENIED',{status:503})}});
  mf=build();
  return {env:b,
    async call(input){const w=await mf.getWorker('inspector');const r=await w.fetch('https://synthetic.invalid/',{method:'POST',body:JSON.stringify(input)});assert.equal(r.status,200);return r.json()},
    async restart(){await mf.dispose();mf=build()},
    async publicHttp(){for(const name of ['brain','healer']){const w=await mf.getWorker(name);for(const path of ['/','/private-hmac','/v1/selfheal/dispatch'])assert.equal((await w.fetch('https://synthetic.invalid'+path,{method:'POST',body:'{}'})).status,404)}},
    async close(){await mf.dispose();await unlink(path);await rm(dir,{recursive:true,force:true});assert.equal(egress,0)}
  };
}
test('native private binding proves matching synthetic keys with all recovery flags OFF, no public path or RPC internals',async()=>{
  const f=await fixture();try {
    const result=await f.call({op:'run'});assert.equal(result.status,'KEY_POSSESSION_CONFIRMED');assert.equal(result.actionsExecuted,0);
    assert.equal(result.sourceSha,SHA);assert.equal(Object.values(result).includes(KEY),false);
    const state=await f.call({op:'state'});assert.equal(state.brain.rows.length,1);assert.equal(state.brain.rows[0].state,'VERIFIED');
    assert.equal(state.healer.rows.length,1);assert.equal(state.healer.rows[0].state,'ANSWERED');assert.equal(state.relay.count,1);
    assert.equal(state.brain.alarm,null);assert.equal(state.healer.alarm,null);
    assert.ok((await f.call({op:'probe'})).every(Boolean));await f.publicHttp();
    assert.equal((await f.call({op:'invalid-run'})).status,'UNKNOWN');
    await f.restart();const persisted=await f.call({op:'state'});assert.deepEqual(persisted.brain,state.brain);assert.deepEqual(persisted.healer,state.healer);
  } finally {await f.close()}
});
test('native different synthetic keys deny before Healer persistence and keep Brain UNKNOWN',async()=>{
  const f=await fixture('wrong-key');try {
    assert.equal((await f.call({op:'run'})).status,'UNKNOWN');const state=await f.call({op:'state'});
    assert.equal(state.brain.rows[0].state,'UNKNOWN');assert.equal(state.healer.rows.length,0);assert.equal(state.relay.count,1);
    await f.restart();assert.deepEqual((await f.call({op:'state'})).brain,state.brain);
  } finally {await f.close()}
});
test('native replay is denied without state/alarm changes before and after restart; concurrent duplicate has one winner',async()=>{
  const f=await fixture();try {
    await f.call({op:'run'});const {request}=await f.call({op:'captured'});const before=await f.call({op:'state'});
    assert.equal((await f.call({op:'answer',request})).status,'UNKNOWN');assert.deepEqual((await f.call({op:'state'})).healer,before.healer);
    await f.restart();assert.ok(request.expiresAtMs>Date.now(),'restart replay must still be fresh to isolate nonce protection');
    assert.equal((await f.call({op:'answer',request})).status,'UNKNOWN');assert.deepEqual((await f.call({op:'state'})).healer,before.healer);
    const fresh=await createAcceptanceChallenge(acceptanceConfig(f.env,'brain'),KEY);
    const replies=await Promise.all([f.call({op:'answer',request:fresh}),f.call({op:'answer',request:fresh})]);
    assert.equal(replies.filter(r=>r.status==='KEY_POSSESSION_CONFIRMED').length,1);
    assert.equal(replies.filter(r=>r.status==='UNKNOWN').length,1);
  } finally {await f.close()}
});
for(const mode of ['forged','timeout','missing-binding'])test('native '+mode+' fails closed with no retry or canonical capabilities',async()=>{
  const f=await fixture(mode);try {
    assert.equal((await f.call({op:'run'})).status,'UNKNOWN');const state=await f.call({op:'state'});
    assert.equal(state.brain.rows[0].state,'UNKNOWN');assert.equal(state.relay.count,mode==='missing-binding'?0:1);
    assert.equal(state.healer.rows.length,mode==='missing-binding'?0:1);
    await f.restart();assert.deepEqual((await f.call({op:'state'})).brain,state.brain);
  } finally {await f.close()}
});
test('native stale response cannot attest a different fresh nonce',async()=>{
  const f=await fixture('replay-response');try {
    assert.equal((await f.call({op:'run'})).status,'KEY_POSSESSION_CONFIRMED');
    assert.equal((await f.call({op:'run'})).status,'UNKNOWN');const state=await f.call({op:'state'});
    assert.equal(state.brain.rows.filter(r=>r.state==='VERIFIED').length,1);assert.equal(state.brain.rows.filter(r=>r.state==='UNKNOWN').length,1);
  } finally {await f.close()}
});
test('native forged request cannot mutate replay SQLite and nonce capacity fails closed',async()=>{
  const f=await fixture();try {
    const request=await createAcceptanceChallenge(acceptanceConfig(f.env,'brain'),KEY),before=await f.call({op:'state'});
    assert.equal((await f.call({op:'answer',request:{...request,signature:'0'.repeat(64)}})).status,'UNKNOWN');
    assert.deepEqual((await f.call({op:'state'})).healer,before.healer);
    for(let i=0;i<17;i++)assert.equal(await f.call({op:'reserve',value:{sessionId:f.env.PRIVATE_HMAC_ACCEPTANCE_SESSION,nonce:i.toString(16).padStart(64,'0'),challengeDigest:'d'.repeat(64),expiresAtMs:Date.now()+10000}}),i<16);
    assert.equal((await f.call({op:'state'})).healer.rows.length,16);
  } finally {await f.close()}
});
test('candidate has no imports/wiring into existing Workers and no recovery, network, AI or existing-ledger authority',async()=>{
  const candidate=await readFile(resolve('src/private_hmac_candidate.mjs'),'utf8');
  assert.doesNotMatch(candidate,/\.fetch\s*\(|\bfetch\s*\([^)]*,|\.AI\b|attemptRecovery|settleDurableReadback|BrainCoordinator|HealerMemory|selfheal_signed_outbox/);
  assert.match(candidate,/status:404/);
  for(const file of ['src/worker.mjs','../automation/self-heal-worker/src/worker.mjs'])
    assert.doesNotMatch(await readFile(resolve(file),'utf8'),/private_hmac/);
});
