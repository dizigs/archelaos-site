import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {buildBrainAnalyticsEvent,digest} from '../../analytics-worker/src/aggregate.mjs';
import {deliverToBrain} from '../src/bridge.mjs';
import {verifyBrainAnalyticsAck,verifyBrainAnalyticsReadback} from '../src/brain-signed-receipts.mjs';

const KEY='synthetic-test-only-brain-receipt-key-'.padEnd(64,'x');
const now=Date.parse('2026-11-05T12:00:00.000Z');
const receiptId='12345678-1234-4123-8123-123456789012';
const signed=(fields,audience,key=KEY)=>{
  const unsigned={...fields,schemaVersion:1,audience,principal:'analytics-v1',
    keyId:'brain-capability-receipts-v1',issuedAtMs:now};
  return {...unsigned,receiptSignature:createHmac('sha256',key).update(
    audience+'\n'+JSON.stringify(unsigned)).digest('hex')};
};
async function fixture(){
  const report={schemaVersion:1,source:'ga4',reportDigest:'a'.repeat(64),
    period:{from:'2026-11-04',to:'2026-11-04'},
    metrics:[{pagePath:'/',name:'sessions',value:32,sampleSize:32}]};
  const event=await buildBrainAnalyticsEvent(report,'2026-11-05T12:00:00.000Z');
  const snapshotKey='ga4|2026-11-04|2026-11-04';
  const metricRevision=await digest(JSON.stringify(event.payload.metrics));
  const evidence={repository:'dizigs/archelaos-site',runId:41995891582,
    artifactId:13399354924,runSha:'e'.repeat(40),
    reportDigest:report.reportDigest,workflow:'Google Search and GA4 daily aggregate',
    observedAt:event.observedAt};
  const request={schemaVersion:1,event,snapshotKey,metricRevision,evidence,
    operation:'UPSERT_NOT_INCREMENT'};
  const producerEvidenceDigest=await digest(JSON.stringify(evidence));
  const ack=signed({receiptId,eventId:event.eventId,snapshotKey,metricRevision,
    status:'ACCEPTED',durable:true,producerEvidenceDigest,
    correlationId:event.correlationId},'analytics.snapshot.ack.v1');
  const stored=signed({receiptId,eventId:event.eventId,snapshotKey,metricRevision,
    reportDigest:report.reportDigest,source:'ga4',correlationId:event.correlationId,
    producerEvidenceDigest,status:'ACCEPTED',isCurrent:true,durable:true},
    'analytics.snapshot.readback.v1');
  return {request,ack,stored,prepared:{schemaVersion:1,verified:true,evidence,
    events:[{event,snapshotKey,metricRevision}]}};
}
test('cryptographic verification of #234 HMAC ACK and independently signed versioned readback',async()=>{
  const {request,ack,stored,prepared}=await fixture();
  assert.equal(await verifyBrainAnalyticsAck(ack,request,{verificationKey:KEY,now}),true);
  assert.equal(await verifyBrainAnalyticsReadback(stored,request,ack,{verificationKey:KEY,now}),true);
  const port={capabilities:async()=>({version:'analytics.aggregate.v1',
    authenticatedServiceBinding:true,durableSnapshotUpsert:true,
    receiptSignatureVerification:true,immutableReceiptReadback:true}),
    submitSnapshot:async()=>ack,
    verifyReceipt:(value,req)=>verifyBrainAnalyticsAck(value,req,{verificationKey:KEY,now}),
    readbackSnapshot:async()=>stored,
    verifyReadback:(value,req,a)=>verifyBrainAnalyticsReadback(value,req,a,
      {verificationKey:KEY,now})};
  const result=await deliverToBrain(prepared,port);
  assert.equal(result.delivered,1);
  assert.equal(result.receipts[0].readbackVerified,true);
  // Test uses locally signed synthetic objects and injected ports; NOT Cloudflare E2E.
});
test('tampered, expired, cross-principal or forged ACK never verifies',async()=>{
  const {request,ack}=await fixture();
  const checks=[
    {...ack,metricRevision:'b'.repeat(64)},
    {...ack,receiptSignature:'0'.repeat(64)},
    {...ack,principal:'apps-script-v1'},
    {...ack,keyId:'untrusted-key'},
    {...ack,audience:'analytics.snapshot.readback.v1'},
    {...ack,issuedAtMs:now-400000},
    {...ack,producerEvidenceDigest:'0'.repeat(64)},
    {...ack,query:'someone@example.test'}
  ];
  for(const bad of checks)
    assert.equal(await verifyBrainAnalyticsAck(bad,request,{verificationKey:KEY,now}),false);
  assert.equal(await verifyBrainAnalyticsAck(ack,request,{verificationKey:null,now}),false);
});
test('readback must be independently signed, exact, current and durable',async()=>{
  const {request,ack,stored}=await fixture();
  const modifications=[
    {...stored,receiptSignature:'0'.repeat(64)},
    {...stored,source:'clarity'},
    {...stored,reportDigest:'b'.repeat(64)},
    {...stored,isCurrent:false},
    {...stored,durable:false},
    {...stored,eventId:'0'.repeat(64)},
    {...stored,audience:'analytics.snapshot.ack.v1'}
  ];
  for(const bad of modifications)
    assert.equal(await verifyBrainAnalyticsReadback(bad,request,ack,
      {verificationKey:KEY,now}),false);
});
