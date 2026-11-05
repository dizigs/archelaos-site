import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createBrainWorkerAdapter, IntegrationBlocked } from './client.mjs';
import './binding-plan.test.mjs'; // Include binding eligibility negatives in existing PR CI without workflow ownership change.
const KEY = 'example-staging-not-a-secret-'.repeat(3);
const sha = x => x.repeat(64);
const event = () => ({ schemaVersion: 1, eventId: randomUUID(), correlationId: randomUUID(),
  sourceType:'drive', sourceId:sha('a'), sourceRevision:sha('b'), eventType:'source.file.created',
  receivedAt:new Date().toISOString(), payload: { blobSha256:sha('c'), mimeType:'application/pdf', sizeBytes:120 } });
const verified = e => ({ verified:true, worker:'archelaos-librarian-staging', sourceType:e.sourceType,
  sourceId:e.sourceId, sourceRevision:e.sourceRevision, blobSha256:e.payload.blobSha256 });
function setup(fetch, overrides={}) { const logs=[]; const a=createBrainWorkerAdapter({workerName:'archelaos-librarian-staging',
  sourceType:'drive', brainService:{fetch}, intakeKey:KEY, enabled:true, clock:Date.now,
  verifyProvenance:async e=>verified(e), auditSink: async r=>(logs.push(r),true), ...overrides}); return {a,logs}; }
const reply = (e, status=202) => Response.json({receiptId:randomUUID(), correlationId:e.correlationId, eventId:e.eventId,
  durable:true, duplicate:status===200, status:'QUEUED'}, {status});
const reject = (p, code) => assert.rejects(p, x => x instanceof IntegrationBlocked && x.code === code);
test('no source spoofing; other Workers blocked', () => {
  assert.throws(()=>createBrainWorkerAdapter({workerName:'archelaos-raisely-bridge',sourceType:'drive'}), /SOURCE_NOT_APPROVED/);
  assert.throws(()=>createBrainWorkerAdapter({workerName:'archelaos-librarian-staging',sourceType:'github'}), /SOURCE_NOT_APPROVED/);
});
test('disabled by default, even when a binding exists', async()=>{
  const {a}=setup(async()=>Response.json({}),{enabled:false});await reject(a.submitEvent(event()),'INTEGRATION_DISABLED');
});
test('missing service binding and credentials fail closed', async()=>{
  const {a}=setup(async()=>Response.json({}),{brainService:null});await reject(a.submitEvent(event()),'SERVICE_BINDING_MISSING');
  const {a:b}=setup(async()=>Response.json({}),{intakeKey:null});await reject(b.submitEvent(event()),'BRAIN_INTAKE_KEY_MISSING');
});
test('real Brain raw body HMAC signature is verifiable; receipt retained', async()=>{
  const e=event();const {a,logs}=setup(async req=>{
    assert.equal(new URL(req.url).host,'brain.internal');assert.equal(new URL(req.url).pathname,'/v1/events');
    const body=await req.text();assert.deepEqual(JSON.parse(body),e);
    const msg=`POST\n/v1/events\n${req.headers.get('x-archelaos-timestamp')}\n${body}`;
    assert.equal(req.headers.get('x-archelaos-signature'), createHmac('sha256',KEY).update(msg).digest('hex'));
    assert.equal(req.headers.get('x-archelaos-key-id'),'staging-v1');return reply(e);
  });const r=await a.submitEvent(e);assert.equal(r.durable,true);assert.equal(logs[0].correlationId,e.correlationId);
});
test('duplicate ack 200 accepted but wrong duplicate rejected',async()=>{
  const e=event();let {a}=setup(async()=>reply(e,200));assert.equal((await a.submitEvent(e)).duplicate,true);
  ({a}=setup(async()=>Response.json({...await reply(e,202).json(),duplicate:true},{status:202})));
  await reject(a.submitEvent(e),'RECEIPT_UNVERIFIED');
});
test('forged correlation ID and forged durable ack rejected',async()=>{
  const e=event();for(const change of [{correlationId:randomUUID()},{durable:false}]){
    const {a}=setup(async()=>Response.json({...await reply(e).json(),...change},{status:202}));
    await reject(a.submitEvent(e),'RECEIPT_UNVERIFIED');
  }
});
test('unverified provenance blocks all remote fetches', async()=>{
  const e=event();let called=0;const {a}=setup(async()=>{called++;return reply(e);},{verifyProvenance:async()=>({verified:true})});
  await reject(a.submitEvent(e),'PROVENANCE_UNVERIFIED');assert.equal(called,0);
});
test('Brain non-2xx rejects and records status',async()=>{
  const e=event();const {a,logs}=setup(async()=>new Response('',{status:401}));
  await reject(a.submitEvent(e),'BRAIN_REJECTED');assert.equal(logs[0].status,401);
});
test('unknown delivery does not retry and produces UNKNOWN audit',async()=>{
  const e=event();let n=0;const {a,logs}=setup(async()=>{n++;throw Error('network');});
  await reject(a.submitEvent(e),'DELIVERY_OUTCOME_UNKNOWN');assert.equal(n,1);assert.equal(logs[0].result,'UNKNOWN');
});
test('audit outage cannot report success',async()=>{
  const e=event();const {a}=setup(async()=>reply(e),{auditSink:async()=>false});
  await reject(a.submitEvent(e),'AUDIT_UNAVAILABLE');
});
test('receipt readback must match UUID and can verify status',async()=>{
  const id=randomUUID(), correlationId=randomUUID();const {a}=setup(async req=>{
    assert.equal(new URL(req.url).pathname,`/v1/tasks/${id}`);
    assert.equal(req.headers.get('x-archelaos-key-id'),'staging-v1');
    return Response.json({receiptId:id,correlationId,status:'DONE',attempts:1,code:'DETERMINISTIC_ROUTE_COMPLETE'});
  });assert.equal((await a.readReceipt(id,correlationId)).status,'DONE');await reject(a.readReceipt('oops',correlationId),'INVALID_RECEIPT_ID');
});
test('health verifies exact service identity but never certifies readiness',async()=>{
  const {a}=setup(async()=>Response.json({service:'archelaos-brain',environment:'staging',commit:'a'.repeat(40),aiExecutionEnabled:false}));
  assert.deepEqual(await a.probeHealth(),{reachable:true,code:'STAGING_HEALTH_ONLY',ready:false,commit:'a'.repeat(40)});
  const {a:b}=setup(async()=>Response.json({service:'fake',environment:'staging',commit:'a'.repeat(40),aiExecutionEnabled:false}));
  assert.equal((await b.probeHealth()).reachable,false);
});
test('oversized or invalid source envelope rejected before signing',async()=>{
  const e=event();e.sourceRevision='not-a-hash';const {a}=setup(async()=>{throw Error('fetch should not run');});
  await assert.rejects(a.submitEvent(e),/OPAQUE_SOURCE_IDS_REQUIRED/);
});
test('unapproved event type cannot enter the shared Brain source scope',async()=>{
  const e=event();e.eventType='news.search.completed';const {a}=setup(async()=>{throw Error('unexpected fetch');});
  await reject(a.submitEvent(e),'EVENT_TYPE_NOT_APPROVED');
});

test('malformed success acknowledgements are UNKNOWN and never silently untracked', async () => {
  const e=event();
  for (const response of [
    () => new Response('{broken', {status:202,headers:{'content-type':'application/json'}}),
    () => Response.json({...{receiptId:randomUUID(),correlationId:e.correlationId,
      eventId:e.eventId,durable:false,duplicate:false,status:'QUEUED'}},{status:202})
  ]) {
    const {a,logs}=setup(async()=>response());
    await reject(a.submitEvent(e),'RECEIPT_UNVERIFIED');
    assert.equal(logs.length,1);
    assert.equal(logs[0].result,'UNKNOWN');
    assert.equal(logs[0].eventId,e.eventId);
    assert.equal(logs[0].correlationId,e.correlationId);
  }
});
test('Brain WAITING_REVIEW receipt state is part of the live canonical task lifecycle',async()=>{
  const e=event();
  const {a}=setup(async()=>Response.json({...await reply(e).json(),status:'WAITING_REVIEW'},{status:202}));
  assert.equal((await a.submitEvent(e)).status,'WAITING_REVIEW');
});
test('readback fails closed on mismatched correlation, forged state and negative attempts',async()=>{
  const id=randomUUID(),correlationId=randomUUID();
  const {a}=setup(async()=>Response.json({receiptId:id,correlationId,status:'WAITING_REVIEW',attempts:0}));
  assert.equal((await a.readReceipt(id,correlationId)).correlationId,correlationId);
  await reject(a.readReceipt(id,randomUUID()),'READBACK_UNVERIFIED');
  await reject(a.readReceipt(id),'INVALID_CORRELATION_ID');
  const {a:bad}=setup(async()=>Response.json({receiptId:id,correlationId,status:'GHOST',attempts:-1}));
  await reject(bad.readReceipt(id,correlationId),'READBACK_UNVERIFIED');
});
test('staging health can pin the known commit and rejects a mismatched release',async()=>{
  const commit='a'.repeat(40);
  const health=async()=>Response.json({service:'archelaos-brain',environment:'staging',commit,aiExecutionEnabled:false});
  const {a}=setup(health,{expectedBrainCommit:commit});
  assert.equal((await a.probeHealth()).reachable,true);
  const {a:other}=setup(health,{expectedBrainCommit:'b'.repeat(40)});
  assert.equal((await other.probeHealth()).code,'HEALTH_IDENTITY_MISMATCH');
});

test('current Brain staging-v1 identity cannot authorize a Drive source event (fail-closed contract)', async()=>{
  const { authenticate, validateEvent } = await import('../../brain/src/contract.mjs');
  const e=event();
  const {a,logs}=setup(async req=>{
    const raw=await req.text();
    const source=await authenticate(req,{STAGING_INTAKE_KEY:KEY},raw);
    assert.equal(source,'staging'); // Current Brain returns this for all staging-v1 callers.
    assert.throws(()=>validateEvent(JSON.parse(raw),source), x=>x?.code==='INVALID_IDENTITY');
    return Response.json({code:'INVALID_IDENTITY'},{status:422});
  });
  await reject(a.submitEvent(e),'BRAIN_REJECTED');
  assert.deepEqual(logs.map(x=>({result:x.result,status:x.status})),[{result:'REJECTED',status:422}]);
});


test('transport timeout aborts, records UNKNOWN and never retries the same event', async () => {
  const e=event();let calls=0,aborted=false;
  const {a,logs}=setup(req=>{
    calls++;
    return new Promise((_,reject) => {
      req.signal.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'));},{once:true});
    });
  },{timeoutMs:100});
  await reject(a.submitEvent(e),'DELIVERY_OUTCOME_UNKNOWN');
  assert.equal(calls,1);
  assert.equal(aborted,true);
  assert.deepEqual(logs.map(x=>({result:x.result,eventId:x.eventId})),[{result:'UNKNOWN',eventId:e.eventId}]);
});

test('restart-safe synthetic Brain receipt keeps one event and durable duplicate identity', async () => {
  const e=event(),stored=new Map();let admissions=0;
  const privateTransport=async req=>{
    const path=new URL(req.url).pathname;
    if(req.method==='POST' && path==='/v1/events') {
      const incoming=JSON.parse(await req.text());
      const duplicate=stored.has(incoming.eventId);
      if(!duplicate){ admissions++;stored.set(incoming.eventId,{
        receiptId:randomUUID(),correlationId:incoming.correlationId,eventId:incoming.eventId
      });}
      return Response.json({...stored.get(incoming.eventId),durable:true,duplicate,status:'WAITING_REVIEW'},
        {status:duplicate?200:202});
    }
    const match=path.startsWith('/v1/tasks/') ? [path,path.slice('/v1/tasks/'.length)] : null;
    if(req.method==='GET' && match){
      const receipt=[...stored.values()].find(x=>x.receiptId===match[1]);
      return receipt?Response.json({...receipt,status:'WAITING_REVIEW',attempts:0}):new Response('',{status:404});
    }
    return new Response('',{status:404});
  };
  const first=setup(privateTransport);
  const receipt=await first.a.submitEvent(e);
  const restarted=setup(privateTransport);
  const again=await restarted.a.submitEvent(e);
  const verified=await restarted.a.readReceipt(receipt.receiptId,e.correlationId);
  assert.equal(admissions,1);
  assert.equal(stored.size,1);
  assert.equal(receipt.duplicate,false);
  assert.equal(again.duplicate,true);
  assert.equal(again.receiptId,receipt.receiptId);
  assert.equal(verified.receiptId,receipt.receiptId);
  assert.equal(verified.correlationId,e.correlationId);
});

test('synthetic Brain emergency pause rejects intake without a successful receipt', async () => {
  const e=event();let calls=0;
  const {a,logs}=setup(async()=>{calls++;return Response.json({code:'EMERGENCY_PAUSE'},{status:423});});
  await reject(a.submitEvent(e),'BRAIN_REJECTED');
  assert.equal(calls,1);
  assert.deepEqual(logs.map(x=>({result:x.result,status:x.status})),[{result:'REJECTED',status:423}]);
});
