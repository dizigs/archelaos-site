import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createBrainWorkerAdapter, IntegrationBlocked } from './client.mjs';
import './binding-plan.test.mjs'; // Include binding eligibility negatives in existing PR CI without workflow ownership change.
const KEY = 'example-staging-not-a-secret-'.repeat(3);
const RECEIPT_KEY = 'example-receipt-verifier-not-a-secret-'.repeat(3);
const sha = x => x.repeat(64);
const event = () => ({ schemaVersion: 1, eventId: randomUUID(), correlationId: randomUUID(),
  sourceType:'drive', sourceId:sha('a'), sourceRevision:sha('b'), eventType:'source.file.created',
  receivedAt:new Date().toISOString(), payload: { blobSha256:sha('c'), mimeType:'application/pdf', sizeBytes:120 } });
const verified = e => ({ verified:true, worker:'archelaos-librarian-staging', sourceType:e.sourceType,
  sourceId:e.sourceId, sourceRevision:e.sourceRevision, blobSha256:e.payload.blobSha256 });
function setup(fetch, overrides={}) { const logs=[]; const a=createBrainWorkerAdapter({workerName:'archelaos-librarian-staging',
  sourceType:'drive', brainService:{fetch}, intakeKey:KEY, receiptVerificationKey:RECEIPT_KEY, enabled:true, clock:Date.now,
  verifyProvenance:async e=>verified(e), auditSink: async r=>(logs.push(r),true), ...overrides}); return {a,logs}; }
const signed = (payload, audience='source.receipt.ack.v1', principal='drive-v1', issuedAtMs=Date.now()) => {
  const envelope={...payload,schemaVersion:1,audience,principal,keyId:'brain-capability-receipts-v1',issuedAtMs};
  const receiptSignature=createHmac('sha256',RECEIPT_KEY).update(audience+'\\n'+JSON.stringify(envelope)).digest('hex');
  return {...envelope,receiptSignature};
};
const reply = (e, status=202) => Response.json(signed({receiptId:randomUUID(), correlationId:e.correlationId,
  eventId:e.eventId,durable:true,duplicate:status===200,status:'QUEUED'}), {status});
const readback = (receiptId,correlationId,status='DONE',attempts=1) =>
  Response.json(signed({receiptId,correlationId,status,attempts,code:'DETERMINISTIC_ROUTE_COMPLETE',durable:true},'source.receipt.readback.v1'));
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
  const {a:c}=setup(async()=>Response.json({}),{receiptVerificationKey:null});await reject(c.submitEvent(event()),'RECEIPT_VERIFICATION_KEY_MISSING');
});
test('real Brain raw body HMAC signature is verifiable; receipt retained', async()=>{
  const e=event();const {a,logs}=setup(async req=>{
    assert.equal(new URL(req.url).host,'brain.internal');assert.equal(new URL(req.url).pathname,'/v1/events');
    const body=await req.text();assert.deepEqual(JSON.parse(body),e);
    const msg=`POST\n/v1/events\n${req.headers.get('x-archelaos-timestamp')}\n${body}`;
    assert.equal(req.headers.get('x-archelaos-signature'), createHmac('sha256',KEY).update(msg).digest('hex'));
    assert.equal(req.headers.get('x-archelaos-key-id'),'drive-v1');return reply(e);
  });const r=await a.submitEvent(e);assert.equal(r.durable,true);assert.equal(logs[0].correlationId,e.correlationId);
});
test('duplicate ack 200 accepted but wrong duplicate rejected',async()=>{
  const e=event();let {a}=setup(async()=>reply(e,200));assert.equal((await a.submitEvent(e)).duplicate,true);
  ({a}=setup(async()=>Response.json(signed({...await reply(e,202).json(),duplicate:true}),{status:202})));
  await reject(a.submitEvent(e),'RECEIPT_UNVERIFIED');
});
test('forged correlation ID and forged durable ack rejected',async()=>{
  const e=event();for(const change of [{correlationId:randomUUID()},{durable:false}]){
    const {a}=setup(async()=>Response.json(signed({...await reply(e).json(),...change}),{status:202}));
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
    assert.equal(new URL(req.url).pathname,`/v1/source-receipts/${id}`);
    assert.equal(req.headers.get('x-archelaos-key-id'),'drive-v1');
    return readback(id,correlationId);
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
    () => Response.json(signed({receiptId:randomUUID(),correlationId:e.correlationId,
      eventId:e.eventId,durable:false,duplicate:false,status:'QUEUED'}),{status:202})
  ]) {
    const {a,logs}=setup(async()=>response());
    await assert.rejects(a.submitEvent(e), x => x?.code==='RECEIPT_UNVERIFIED' || x?.code==='RECEIPT_SIGNATURE_INVALID');
    assert.equal(logs.length,1);
    assert.equal(logs[0].result,'UNKNOWN');
    assert.equal(logs[0].eventId,e.eventId);
    assert.equal(logs[0].correlationId,e.correlationId);
  }
});
test('Brain WAITING_REVIEW receipt state is part of the live canonical task lifecycle',async()=>{
  const e=event();
  const {a}=setup(async()=>Response.json(signed({...await reply(e).json(),status:'WAITING_REVIEW'}),{status:202}));
  assert.equal((await a.submitEvent(e)).status,'WAITING_REVIEW');
});
test('readback fails closed on mismatched correlation, forged state and negative attempts',async()=>{
  const id=randomUUID(),correlationId=randomUUID();
  const {a}=setup(async()=>readback(id,correlationId,'WAITING_REVIEW',0));
  assert.equal((await a.readReceipt(id,correlationId)).correlationId,correlationId);
  await reject(a.readReceipt(id,randomUUID()),'READBACK_UNVERIFIED');
  await reject(a.readReceipt(id),'INVALID_CORRELATION_ID');
  const {a:bad}=setup(async()=>readback(id,correlationId,'GHOST',-1));
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

test('main Brain rejects source-v1 before the reviewed #234 contract is merged (fail-closed)', async()=>{
  const { authenticate } = await import('../../brain/src/contract.mjs');
  const e=event();
  const {a,logs}=setup(async req=>{
    const raw=await req.text();
    assert.equal(req.headers.get('x-archelaos-key-id'),'drive-v1');
    await assert.rejects(authenticate(req,{STAGING_INTAKE_KEY:KEY},raw),
      x=>x?.code==='UNAUTHORIZED' && x?.status===401);
    return Response.json({code:'UNAUTHORIZED'},{status:401});
  });
  await reject(a.submitEvent(e),'BRAIN_REJECTED');
  assert.deepEqual(logs.map(x=>({result:x.result,status:x.status})),[{result:'REJECTED',status:401}]);
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
      return Response.json(signed({...stored.get(incoming.eventId),durable:true,duplicate,status:'WAITING_REVIEW'}),
        {status:duplicate?200:202});
    }
    const match=path.startsWith('/v1/source-receipts/') ? [path,path.slice('/v1/source-receipts/'.length)] : null;
    if(req.method==='GET' && match){
      const receipt=[...stored.values()].find(x=>x.receiptId===match[1]);
      return receipt?readback(receipt.receiptId,receipt.correlationId,'WAITING_REVIEW',0):new Response('',{status:404});
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


test('canonical Brain HMAC rejects payload forgery, wrong route, wrong identity and stale replay', async()=>{
  const {authenticate}=await import('../../brain/src/contract.mjs');
  const e=event(),raw=JSON.stringify(e);
  const ts=String(Math.floor(Date.now()/1000)),old=String(Number(ts)-3600);
  const sign=(path,time,body)=>createHmac('sha256',KEY).update('POST\n'+path+'\n'+time+'\n'+body).digest('hex');
  const valid=sign('/v1/events',ts,raw);
  const mk=(path,body,time,sig,keyId='staging-v1')=>new Request('https://brain.internal'+path,{
    method:'POST',
    headers:{'x-archelaos-key-id':keyId,'x-archelaos-timestamp':time,'x-archelaos-signature':sig},
    body
  });
  const tampered=raw.replace('source.file.created','source.file.updated');
  const failures=[
    [mk('/v1/events',tampered,ts,valid),tampered],
    [mk('/v1/task-intents',raw,ts,valid),raw],
    [mk('/v1/events',raw,ts,valid,'operator-v1'),raw],
    [mk('/v1/events',raw,old,sign('/v1/events',old,raw)),raw]
  ];
  for(const [request,body] of failures) {
    await assert.rejects(authenticate(request,{STAGING_INTAKE_KEY:KEY},body),
      x=>x?.code==='UNAUTHORIZED' && x?.status===401);
  }
});
test('changing an approved Drive event into another identity never calls the private binding', async()=>{
  const e=event();e.sourceType='news';let calls=0;
  const {a}=setup(async()=>{calls++;return reply(e);});
  await assert.rejects(a.submitEvent(e),x=>x?.code==='INVALID_IDENTITY');
  assert.equal(calls,0);
});

test('unsigned forged successful receipt cannot cause success',async()=>{
  const e=event(),{a,logs}=setup(async()=>Response.json({
    receiptId:randomUUID(),correlationId:e.correlationId,eventId:e.eventId,durable:true,duplicate:false,status:'QUEUED'
  },{status:202}));
  await reject(a.submitEvent(e),'RECEIPT_SIGNATURE_INVALID');
  assert.equal(logs[0].result,'UNKNOWN');
});
test('signed receipt rejects wrong principal, audience, expired issuance and tampering',async()=>{
  const e=event(),payload={receiptId:randomUUID(),correlationId:e.correlationId,
    eventId:e.eventId,durable:true,duplicate:false,status:'QUEUED'};
  for(const signedBody of [
    signed(payload,'source.receipt.ack.v1','news-v1'),
    signed(payload,'source.receipt.readback.v1','drive-v1'),
    signed(payload,'source.receipt.ack.v1','drive-v1',Date.now()-600000),
    {...signed(payload),eventId:randomUUID()}
  ]) {
    const {a}=setup(async()=>Response.json(signedBody,{status:202}));
    await reject(a.submitEvent(e),'RECEIPT_SIGNATURE_INVALID');
  }
});
test('readback refuses valid signature for a different source receipt audience',async()=>{
  const id=randomUUID(),corr=randomUUID();
  const {a}=setup(async()=>Response.json(signed({receiptId:id,correlationId:corr,durable:true,
    status:'DONE',attempts:1}),{status:200}));
  await reject(a.readReceipt(id,corr),'READBACK_UNVERIFIED');
});
