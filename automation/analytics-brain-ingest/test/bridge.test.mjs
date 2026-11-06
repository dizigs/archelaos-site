import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePrivateExport,deliverToBrain} from '../src/bridge.mjs';
import {validateGoogleAdsContract} from '../src/google-ads.mjs';

const now=Date.parse('2026-11-05T12:00:00.000Z');
const completedAt='2026-11-05T11:00:00.000Z';
const google=()=>({generated_utc:completedAt,
  search_console:{range:{startDate:'2026-11-01',endDate:'2026-11-02'},daily:[
    {date:'2026-11-01',clicks:7,impressions:60,ctr:7/60,position:12},
    {date:'2026-11-02',clicks:1,impressions:5,ctr:0.2,position:8}]},
  ga4:{range:{startDate:'2026-11-01',endDate:'2026-11-02'},daily:[
    {date:'20261101',activeUsers:30,sessions:41,pageViews:62},
    {date:'20261102',activeUsers:4,sessions:6,pageViews:7}]}});
const clarity=()=>({date_utc:'2026-11-05',range:'previous 24 hours',breakdown:'Device',
  metrics:[{metric:'Engagement',rows:[
    {Device:'Desktop',totalSessionCount:25,deadClickCount:3,rageClickCount:2,scrollDepth:45},
    {Device:'Mobile',totalSessionCount:5,deadClickCount:1,rageClickCount:1,scrollDepth:40}]}]});
async function proof(bytes,source='google_bundle',over={}){
  const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const isGoogle=source==='google_bundle';
  return {run:{id:111,repository:'dizigs/archelaos-site',
    workflow:isGoogle?'Google Search and GA4 daily aggregate':'Clarity daily private aggregate report',
    workflowPath:isGoogle?'.github/workflows/google-analytics-aggregate.yml':'.github/workflows/clarity-daily-export.yml',
    headBranch:'main',headSha:'a'.repeat(40),event:'schedule',
    status:'completed',conclusion:'success',completedAt},
    artifact:{id:222,runId:111,expired:false,name:isGoogle?'google-search-ga4-private-report':'clarity-private-aggregate-report'},
    verifiedContentSha256:sha,...over};
}
async function prepare(value=google(),source='google_bundle',custom={}) {
  const artifactBytes=new TextEncoder().encode(JSON.stringify(value));
  const evidence=await proof(artifactBytes,source);
  return preparePrivateExport({source,artifactBytes,runId:111,artifactId:222,now,
    trustedLookup:async()=>evidence,...custom});
}
test('GA4/GSC maps only site-wide daily aggregates; correct digest/provenance',async()=>{
  const prepared=await prepare();
  assert.equal(prepared.verified,true);
  assert.equal(prepared.events.length,4);
  assert.equal(prepared.events[0].event.payload.source,'ga4');
  assert.equal(prepared.events[2].event.payload.source,'search_console');
  assert.equal(prepared.events[0].event.payload.metrics.find(x=>x.name==='sessions').value,41);
  assert.equal(prepared.events[2].event.payload.metrics.find(x=>x.name==='ctr_pct').value,7/60*100);
  assert.equal(prepared.events[1].event.payload.metrics.length,0); // <20 active users
  assert.equal(prepared.events[3].event.payload.metrics.length,0); // <20 impressions
  assert(!JSON.stringify(prepared).includes('20261101'));
  assert(!JSON.stringify(prepared).includes('pageViews'));
});
test('idempotent event and deterministic snapshot keys for same bytes',async()=>{
  const a=await prepare(),b=await prepare();
  assert.deepEqual(a,b);
  assert.deepEqual([...new Set(a.events.map(x=>x.snapshotKey))].length,4);
});
test('Clarity rolls up eligible device sessions, suppressing small device cohorts',async()=>{
  const a=await prepare(clarity(),'clarity');
  assert.equal(a.events.length,1);
  const metrics=a.events[0].event.payload.metrics;
  assert.deepEqual(metrics.map(m=>m.name),['sessions','dead_clicks','rage_clicks','scroll_depth_pct']);
  assert.equal(metrics.find(x=>x.name==='sessions').value,25);
  assert.equal(metrics.find(x=>x.name==='dead_clicks').value,3);
  assert.equal(metrics.find(x=>x.name==='scroll_depth_pct').value,45);
  assert(!JSON.stringify(a).includes('Mobile'));
});
test('Clarity unavailable denominator does not reveal small cohorts',async()=>{
  const x=clarity();
  x.metrics[0].rows=[{Device:'Mobile',totalSessionCount:3,deadClickCount:1}];
  await assert.rejects(prepare(x,'clarity'),/NO_VERIFIABLE_AGGREGATE_ROWS/);
});
test('unexpected personal or raw URL fields fail rather than leak',async()=>{
  const x=google();x.visitorId='abc';
  await assert.rejects(prepare(x),/UNEXPECTED_FIELDS/);
  const y=google();y.ga4.daily[0].userEmail='private@example.org';
  await assert.rejects(prepare(y),/UNEXPECTED_FIELDS/);
});
test('API absence fails closed with no synthesized success',async()=>{
  await assert.rejects(prepare(google(),'google_bundle',{trustedLookup:async()=>{throw Error('API 403');}}),/PROVENANCE_LOOKUP_UNAVAILABLE/);
});
test('run, artifact and extracted-byte identity all require independent evidence',async()=>{
  const data=google(),bytes=new TextEncoder().encode(JSON.stringify(data));
  const e=await proof(bytes);
  for(const modified of [
    {...e,verifiedContentSha256:'0'.repeat(64)},
    {...e,run:{...e.run,conclusion:'failure'}},
    {...e,run:{...e.run,repository:'other/site'}},
    {...e,artifact:{...e.artifact,name:'wrong'}},
    {...e,run:{...e.run,event:'pull_request'}},
    {...e,run:{...e.run,headSha:'not-a-commit'}}
  ]) {
    await assert.rejects(prepare(data,'google_bundle',{trustedLookup:async()=>modified}),
      /UNVERIFIED_ARTIFACT_PROVENANCE/);
  }
});
test('missing and invalid provider rows fail closed',async()=>{
  const x=google();delete x.ga4.daily[0].activeUsers;
  await assert.rejects(prepare(x),/INVALID_COUNT/);
  const y=google();y.ga4.daily.push({...y.ga4.daily[0]});
  await assert.rejects(prepare(y),/DUPLICATE_DAILY_ROW/);
  const z=google();z.search_console.daily[0].ctr=2;
  await assert.rejects(prepare(z),/INVALID_VALUE/);
});
test('Clarity duplicated device values are not accidentally summed twice',async()=>{
  const x=clarity();x.metrics.push({metric:'Other',rows:[{Device:'Desktop',totalSessionCount:30}]});
  await assert.rejects(prepare(x,'clarity'),/AMBIGUOUS_CLARITY_BREAKDOWN/);
});
test('Brain must advertise verified private durable analytics capability',async()=>{
  const prepared=await prepare();
  await assert.rejects(deliverToBrain(prepared,{}),/BRAIN_ANALYTICS_NOT_CONFIGURED/);
  let called=0;
  const port={capabilities:async()=>({version:'old',authenticatedServiceBinding:true,durableSnapshotUpsert:true,receiptSignatureVerification:true}),
    submitSnapshot:async()=>{called++;},verifyReceipt:async()=>true};
  await assert.rejects(deliverToBrain(prepared,port),/BRAIN_ANALYTICS_CAPABILITY_UNVERIFIED/);
  assert.equal(called,0);
});
test('verified durable receipts only; snapshot UPSERT, never cumulative addition',async()=>{
  const prepared=await prepare();
  const calls=[];
  const port={capabilities:async()=>({version:'analytics.aggregate.v1',
     authenticatedServiceBinding:true,durableSnapshotUpsert:true,receiptSignatureVerification:true}),
    submitSnapshot:async(req)=>{
      calls.push(req);
      return {eventId:req.event.eventId,snapshotKey:req.snapshotKey,metricRevision:req.metricRevision,
        status:'ACCEPTED',durable:true,receiptId:'receipt-123456789'};
    },
    verifyReceipt:async()=>true};
  const result=await deliverToBrain(prepared,port);
  assert.equal(result.delivered,4);
  assert(calls.every(x=>x.operation==='UPSERT_NOT_INCREMENT'));
  assert(calls.every(x=>!JSON.stringify(x).includes('private@example.org')));
  const fake={...port,verifyReceipt:async()=>false};
  await assert.rejects(deliverToBrain(prepared,fake),/UNVERIFIED_BRAIN_RECEIPT/);
});
test('uncertain Brain delivery needs reconciliation rather than blind retry',async()=>{
  const port={capabilities:async()=>({version:'analytics.aggregate.v1',
     authenticatedServiceBinding:true,durableSnapshotUpsert:true,receiptSignatureVerification:true}),
    submitSnapshot:async()=>{throw Error('timeout');},verifyReceipt:async()=>true};
  await assert.rejects(deliverToBrain(await prepare(),port),/RECONCILE_REQUIRED/);
});
test('Google Ads is disabled pending approved reader and actual campaign reporting',()=>{
  assert.throws(()=>validateGoogleAdsContract({}),/GOOGLE_ADS_DISABLED/);
});
