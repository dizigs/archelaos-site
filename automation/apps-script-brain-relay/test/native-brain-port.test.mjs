import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,createHash} from 'node:crypto';
import {createNativeAppsScriptBrainPort} from '../src/native-brain-port.mjs';
import {buildVerifiedAppsScriptEvent,relayAppsScriptReceipt} from '../src/relay.mjs';
const NOW=Date.parse('2026-11-07T12:00:00Z'),SHA='a'.repeat(40);
const KEY='synthetic-source-example-'.repeat(3),VERIFIER='synthetic-receipt-example-'.repeat(3);
const OP='11111111-1111-4111-8111-111111111111';
const RID='22222222-2222-4222-8222-222222222222';
const receipt=()=>({operationId:OP,phase:'BACKUP_VERIFIED',
  sourceFingerprint:'b'.repeat(64),sourceRevision:'c'.repeat(64),
  evidenceDigest:'d'.repeat(64),observedAt:'2026-11-07T12:00:00Z',status:'PROVIDER_VERIFIED'});
const environment=service=>({BRIDGE_BRAIN_RELAY_ENABLED:'true',BRAIN_PRIVATE:service,
  BRAIN_APPS_SCRIPT_INTAKE_KEY:KEY,BRAIN_CAPABILITY_RECEIPT_KEY:VERIFIER});
const adapter=(service,options={})=>createNativeAppsScriptBrainPort({
  env:environment(service),expectedBrainCommit:SHA,enabled:true,clock:()=>NOW,...options});
const reject=(promise,code)=>assert.rejects(promise,e=>e?.code===code);
function sign(event,changes={},key=VERIFIER){
  const body={receiptId:RID,eventId:event.eventId,correlationId:event.correlationId,
    source:'apps_script',sourceRevision:event.sourceRevision,transport:'PRIVATE_SERVICE_BINDING',
    phase:event.type,evidenceDigest:event.metadata.evidenceDigest,status:'WAITING_REVIEW',
    durable:true,schemaVersion:1,audience:'apps-script.receipt.readback.v1',
    principal:'apps-script-v1',keyId:'brain-capability-receipts-v1',issuedAtMs:NOW,...changes};
  return {...body,receiptSignature:createHmac('sha256',key)
    .update(body.audience+'\n'+JSON.stringify(body)).digest('hex')};
}
function mock(event,settings={}){
  const calls=[];
  const service={async fetch(request){
    const path=new URL(request.url).pathname;
    assert.equal(new URL(request.url).host,'brain.internal');
    calls.push(path);
    if(path==='/healthz')return Response.json({service:'archelaos-brain',
      environment:'staging',commit:settings.commit||SHA,aiExecutionEnabled:false});
    assert.equal(request.headers.get('x-archelaos-key-id'),'apps-script-v1');
    const ts=request.headers.get('x-archelaos-timestamp');
    assert.equal(ts,String(Math.floor(NOW/1000)));
    const body=request.method==='POST'?await request.text():'';
    assert.equal(request.headers.get('x-archelaos-signature'),
      createHmac('sha256',KEY)
        .update(request.method+'\n'+path+'\n'+ts+'\n'+body).digest('hex'));
    if(path==='/v1/capabilities/apps-script')
      return Response.json({schemaVersion:1,source:'apps_script',
        transport:'PRIVATE_SERVICE_BINDING',status:'ACCEPTING',
        deploymentDigest:createHash('sha256').update(SHA).digest('hex')});
    if(path==='/v1/intake/apps-script'){
      assert.deepEqual(JSON.parse(body),event);
      if(settings.uncertain)throw Error('Synthetic lost ACK');
      return Response.json({receiptId:RID,correlationId:event.correlationId,
        status:'WAITING_REVIEW',durable:true,duplicate:false,...(settings.ack||{})});
    }
    if(path==='/v1/apps-script/readback'){
      assert.deepEqual(JSON.parse(body),{receiptId:RID,eventId:event.eventId,operationId:OP});
      return Response.json(settings.malformed?{arbitrary:true}:sign(event,settings.proof||{},
        settings.signingKey||VERIFIER));
    }
    throw Error('UNKNOWN_PRIVATE_ROUTE');
  }};
  return {service,calls};
}
test('OFF, missing native binding or secret collision: no remote calls',()=>{
  const b={fetch:()=>{throw Error('called unexpectedly');}};
  assert.throws(()=>createNativeAppsScriptBrainPort({env:environment(b),
    expectedBrainCommit:SHA}),e=>e.code==='APPS_SCRIPT_BRAIN_RELAY_DISABLED');
  assert.throws(()=>createNativeAppsScriptBrainPort({env:{...environment(b),BRIDGE_BRAIN_RELAY_ENABLED:'false'},
    expectedBrainCommit:SHA,enabled:true}),e=>e.code==='APPS_SCRIPT_BRAIN_RELAY_DISABLED');
  assert.throws(()=>createNativeAppsScriptBrainPort({env:{...environment(b),BRAIN_PRIVATE:null},
    expectedBrainCommit:SHA,enabled:true}),e=>e.code==='NATIVE_SERVICE_BINDING_REQUIRED');
  assert.throws(()=>createNativeAppsScriptBrainPort({env:{...environment(b),
    BRAIN_CAPABILITY_RECEIPT_KEY:KEY},expectedBrainCommit:SHA,enabled:true}),
    e=>e.code==='HMAC_TRUST_DOMAINS_COLLIDE');
});
test('real relay composition: verified opaque metadata, HMAC, signed durable readback',async()=>{
  const event=await buildVerifiedAppsScriptEvent(receipt(),NOW);
  const {service,calls}=mock(event),p=adapter(service),audits=[];
  const result=await relayAppsScriptReceipt({operationId:OP},{
    readControls:async()=>({paused:false,bridgeEnabled:true}),
    readTrustedReceipt:async()=>receipt(),
    readBrainCapabilities:p.readBrainCapabilities,
    claimDelivery:async()=>({status:'CLAIMED'}),
    submitToBrain:p.submitToBrain,
    finalizeDelivery:async(id,record)=>{audits.push({id,record});}
  },NOW);
  assert.equal(result.sent,true);
  assert.equal(result.status,'DURABLE_BRAIN_RECEIPT');
  assert.equal(audits[0].record.brainReceiptId,RID);
  assert.deepEqual(calls,['/healthz','/v1/capabilities/apps-script',
    '/healthz','/v1/intake/apps-script','/healthz','/v1/apps-script/readback']);
});
test('signed readback returns exact private eight-field proof, not raw signature',async()=>{
  const e=await buildVerifiedAppsScriptEvent(receipt(),NOW);
  const p=adapter(mock(e).service);
  const proof=await p.readBrainReceipt({eventId:e.eventId,operationId:OP,receiptId:RID});
  assert.deepEqual(Object.keys(proof),['eventId','correlationId','receiptId',
    'source','sourceRevision','transport','status','durable']);
});
test('different staged SHA rejects before any signed call or submission',async()=>{
  const e=await buildVerifiedAppsScriptEvent(receipt(),NOW);
  const {service,calls}=mock(e,{commit:'e'.repeat(40)});
  await reject(adapter(service).readBrainCapabilities(),'BRAIN_RELEASE_MISMATCH');
  assert.deepEqual(calls,['/healthz']);
});
test('signed forged receipts, wrong keys, stale time and cross-principal are blocked',async()=>{
  const e=await buildVerifiedAppsScriptEvent(receipt(),NOW);
  for(const configuration of [
    {signingKey:'synthetic-wrong-receipt-key-'.repeat(3)},
    {proof:{principal:'drive-v1'}},{proof:{issuedAtMs:NOW-400000}},
    {proof:{eventId:'33333333-3333-4333-8333-333333333333'}},
    {proof:{evidenceDigest:'f'.repeat(64)}},
    {proof:{phase:'apps_script.source.read'}},
    {proof:{transport:'PUBLIC_HTTP'}},{malformed:true}
  ])await assert.rejects(adapter(mock(e,configuration).service).submitToBrain(e));
});
test('unknown transport never performs a second submit',async()=>{
  const e=await buildVerifiedAppsScriptEvent(receipt(),NOW);
  const {service,calls}=mock(e,{uncertain:true});
  await assert.rejects(adapter(service).submitToBrain(e));
  assert.equal(calls.filter(x=>x==='/v1/intake/apps-script').length,1);
});
test('source code and unexpected metadata rejected before private transport',async()=>{
  const e=await buildVerifiedAppsScriptEvent(receipt(),NOW);
  const {service,calls}=mock(e);
  await assert.rejects(adapter(service).submitToBrain({...e,sourceCode:'private script'}));
  assert.deepEqual(calls,[]);
});
test('arbitrary readback request cannot choose project or public RPC',async()=>{
  const e=await buildVerifiedAppsScriptEvent(receipt(),NOW);
  const {service,calls}=mock(e);
  await reject(adapter(service).readBrainReceipt({
    eventId:e.eventId,operationId:OP,projectId:'secret'}),'BRAIN_READBACK_REQUEST_INVALID');
  assert.deepEqual(calls,[]);
});