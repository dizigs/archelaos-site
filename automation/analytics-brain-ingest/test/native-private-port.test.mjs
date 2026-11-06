import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createNativeAnalyticsBrainPort} from '../src/native-private-port.mjs';
import {buildBrainAnalyticsEvent,digest} from '../../analytics-worker/src/aggregate.mjs';
import {deliverToBrain} from '../src/bridge.mjs';

const NOW=Date.parse('2026-11-07T12:00:00.000Z');
const COMMIT='c'.repeat(40);
const KEY='synthetic-source-HMAC-do-not-deploy-'.padEnd(64,'s');
const RECEIPT_KEY='synthetic-independent-verifier-do-not-deploy-'.padEnd(64,'v');
const RECEIPT_ID='12345678-1234-4123-8123-123456789012';
const env=service=>({
  ANALYTICS_ENABLED:'true',BRAIN_PRIVATE:service,
  BRAIN_ANALYTICS_INTAKE_KEY:KEY,
  BRAIN_CAPABILITY_RECEIPT_KEY:RECEIPT_KEY
});
const makePort=(service,opts={})=>createNativeAnalyticsBrainPort({
  env:env(service),expectedBrainCommit:COMMIT,clock:()=>NOW,...opts
});
function signed(fields,audience,verifier=RECEIPT_KEY){
  // Re-sign a changed payload from scratch, without carrying a prior MAC.
  // This ensures the negative test exercises a VALID signature on wrong data.
  const cleanFields={...fields};
  delete cleanFields.receiptSignature;
  const unsigned={...cleanFields,schemaVersion:1,audience,principal:'analytics-v1',
    keyId:'brain-capability-receipts-v1',issuedAtMs:NOW};
  const receiptSignature=createHmac('sha256',verifier)
    .update(audience+'\n'+JSON.stringify(unsigned)).digest('hex');
  return {...unsigned,receiptSignature};
}
async function fixture(){
  const report={schemaVersion:1,source:'ga4',reportDigest:'a'.repeat(64),
    period:{from:'2026-11-06',to:'2026-11-06'},
    metrics:[{pagePath:'/',name:'sessions',value:48,sampleSize:48}]};
  const event=await buildBrainAnalyticsEvent(report,new Date(NOW).toISOString());
  const snapshotKey='ga4|2026-11-06|2026-11-06';
  const metricRevision=await digest(JSON.stringify(event.payload.metrics));
  const evidence={repository:'dizigs/archelaos-site',runId:12345,artifactId:67890,
    runSha:COMMIT,reportDigest:report.reportDigest,
    workflow:'Google Search and GA4 daily aggregate',observedAt:event.observedAt};
  const prepared={schemaVersion:1,verified:true,evidence,
    events:[{event,snapshotKey,metricRevision}]};
  const request={schemaVersion:1,event,snapshotKey,metricRevision,evidence,
    operation:'UPSERT_NOT_INCREMENT'};
  const producerEvidenceDigest=await digest(JSON.stringify(evidence));
  const ack=signed({receiptId:RECEIPT_ID,eventId:event.eventId,
    snapshotKey,metricRevision,status:'ACCEPTED',durable:true,
    producerEvidenceDigest,correlationId:event.correlationId},
    'analytics.snapshot.ack.v1');
  const readback=signed({receiptId:RECEIPT_ID,eventId:event.eventId,
    snapshotKey,metricRevision,reportDigest:report.reportDigest,
    source:'ga4',correlationId:event.correlationId,
    producerEvidenceDigest,status:'ACCEPTED',isCurrent:true,durable:true},
    'analytics.snapshot.readback.v1');
  return {prepared,request,ack,readback};
}

function syntheticNativeBinding({ack,readback,identitySha=COMMIT,failPost=false}={}){
  const calls=[];
  const service={
    async fetch(req) {
      const path=new URL(req.url).pathname;
      assert.equal(new URL(req.url).host,'brain.internal');
      calls.push(path);
      if (path==='/healthz') {
        assert.equal(req.method,'GET');
        assert.equal(req.headers.get('x-archelaos-signature'),null);
        return Response.json({service:'archelaos-brain',environment:'staging',
          commit:identitySha,aiExecutionEnabled:false});
      }
      const raw=req.method==='POST'?await req.text():'';
      const seconds=req.headers.get('x-archelaos-timestamp');
      assert.match(seconds,/^\d{10}$/);
      assert.equal(req.headers.get('x-archelaos-key-id'),'analytics-v1');
      assert.equal(seconds,String(Math.floor(NOW/1000)));
      assert.equal(req.headers.get('x-archelaos-signature'),
        createHmac('sha256',KEY).update(
          req.method+'\n'+path+'\n'+seconds+'\n'+raw).digest('hex'));
      if (path==='/v1/capabilities/analytics'){
        assert.equal(req.method,'GET');
        return Response.json({version:'analytics.aggregate.v1',
          authenticatedServiceBinding:true,durableSnapshotUpsert:true,
          receiptSignatureVerification:true,immutableReceiptReadback:true});
      }
      if (path==='/v1/intake/analytics'){
        assert.equal(req.method,'POST');
        assert.equal(req.headers.get('content-type'),'application/json');
        assert.equal(JSON.parse(raw).operation,'UPSERT_NOT_INCREMENT');
        if(failPost)throw Error('synthetic-network-timeout');
        return Response.json(ack);
      }
      if(path==='/v1/analytics/readback'){
        assert.equal(req.method,'POST');
        const query=JSON.parse(raw);
        assert.deepEqual(query,{receiptId:RECEIPT_ID,eventId:ack.eventId,
          snapshotKey:ack.snapshotKey});
        return Response.json(readback);
      }
      return new Response('Not found',{status:404});
    }
  };
  return {service,calls};
}

test('disabled by default and no native binding cannot send a public HTTP fallback',()=>{
  const service={fetch:async()=>{throw Error('must not call');}};
  assert.throws(()=>createNativeAnalyticsBrainPort({
    env:{...env(service),ANALYTICS_ENABLED:'false'},
    expectedBrainCommit:COMMIT}),/ANALYTICS_PRIVATE_DELIVERY_DISABLED/);
  assert.throws(()=>createNativeAnalyticsBrainPort({
    env:{...env(service),BRAIN_PRIVATE:null},
    expectedBrainCommit:COMMIT}),/NATIVE_PRIVATE_BRAIN_BINDING_REQUIRED/);
  assert.throws(()=>createNativeAnalyticsBrainPort({
    env:{...env(service),BRAIN_ANALYTICS_INTAKE_KEY:null},
    expectedBrainCommit:COMMIT}),/ANALYTICS_INTAKE_KEY_MISSING/);
  assert.throws(()=>createNativeAnalyticsBrainPort({
    env:{...env(service),BRAIN_CAPABILITY_RECEIPT_KEY:null},
    expectedBrainCommit:COMMIT}),/BRAIN_RECEIPT_VERIFIER_MISSING/);
  assert.throws(()=>createNativeAnalyticsBrainPort({
    env:{...env(service),BRAIN_CAPABILITY_RECEIPT_KEY:KEY},
    expectedBrainCommit:COMMIT}),/HMAC_TRUST_DOMAINS_COLLIDE/);
  assert.throws(()=>createNativeAnalyticsBrainPort({
    env:env(service),expectedBrainCommit:'main'}),/BRAIN_EXACT_COMMIT_NOT_PINNED/);
});
test('signed private capability → snapshot → independently signed immutable readback',async()=>{
  const {prepared,ack,readback}=await fixture();
  const {service,calls}=syntheticNativeBinding({ack,readback});
  const result=await deliverToBrain(prepared,makePort(service));
  assert.equal(result.delivered,1);
  assert.equal(result.receipts[0].receiptId,RECEIPT_ID);
  assert.equal(result.receipts[0].readbackVerified,true);
  assert.deepEqual(calls,[
    '/healthz','/v1/capabilities/analytics','/healthz',
    '/v1/intake/analytics','/healthz','/v1/analytics/readback'
  ]);
});
test('stale/mismatched staging identity is denied before any capability or write',async()=>{
  const f=await fixture();
  const {service,calls}=syntheticNativeBinding({
    ack:f.ack,readback:f.readback,identitySha:'d'.repeat(40)
  });
  // deliverToBrain deliberately maps capability probing errors to its
  // stable public fail-closed error; it must never attempt a write.
  await assert.rejects(deliverToBrain(f.prepared,makePort(service)),
    /BRAIN_CAPABILITY_UNAVAILABLE/);
  assert.deepEqual(calls,['/healthz']);
});
test('tampered Brain HMAC ACK is rejected, not called durable success',async()=>{
  const f=await fixture();
  const tampered={...f.ack,receiptSignature:'0'.repeat(64)};
  const {service,calls}=syntheticNativeBinding({ack:tampered,readback:f.readback});
  await assert.rejects(deliverToBrain(f.prepared,makePort(service)),
    /UNVERIFIED_BRAIN_RECEIPT/);
  assert.equal(calls.filter(x=>x==='/v1/intake/analytics').length,1);
  assert.equal(calls.includes('/v1/analytics/readback'),false);
});
test('network-uncertain submission is never retried',async()=>{
  const f=await fixture();
  const {service,calls}=syntheticNativeBinding({
    ack:f.ack,readback:f.readback,failPost:true
  });
  await assert.rejects(deliverToBrain(f.prepared,makePort(service)),
    /BRAIN_DELIVERY_UNCERTAIN_RECONCILE_REQUIRED/);
  assert.equal(calls.filter(x=>x==='/v1/intake/analytics').length,1);
  assert.equal(calls.includes('/v1/analytics/readback'),false);
});
test('signed-but-wrong immutable readback fails closed',async()=>{
  const f=await fixture();
  const wrong=signed({...f.readback,reportDigest:'d'.repeat(64)},
    'analytics.snapshot.readback.v1');
  const {service,calls}=syntheticNativeBinding({ack:f.ack,readback:wrong});
  await assert.rejects(deliverToBrain(f.prepared,makePort(service)),
    /UNVERIFIED_BRAIN_READBACK/);
  assert.equal(calls.filter(x=>x==='/v1/analytics/readback').length,1);
});
test('private RPC allows only bounded immutable analytics shape',async()=>{
  const f=await fixture();
  const {service,calls}=syntheticNativeBinding({ack:f.ack,readback:f.readback});
  const port=makePort(service);
  await assert.rejects(port.submitSnapshot({...f.request,operation:'ADD_ONE'}),
    /BRAIN_ANALYTICS_REQUEST_INVALID/);
  await assert.rejects(port.readbackSnapshot({receiptId:'bad',eventId:f.ack.eventId,
    snapshotKey:f.ack.snapshotKey}),/BRAIN_ANALYTICS_READBACK_QUERY_INVALID/);
  await assert.rejects(port.submitSnapshot({...f.request,
    longUntrustedText:'x'.repeat(5000)}),/BRAIN_RPC_INVALID_PAYLOAD/);
  assert.equal(calls.filter(x=>x==='/v1/intake/analytics').length,0);
  assert.equal(calls.filter(x=>x==='/v1/analytics/readback').length,0);
});
