import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReport,buildBrainAnalyticsEvent } from '../src/aggregate.mjs';
const d='a'.repeat(64);
const make=(over={})=>({schemaVersion:1,source:'clarity',reportDigest:d,
  period:{from:'2026-11-01',to:'2026-11-02'},
  metrics:[{pagePath:'/news.html',name:'sessions',value:30,sampleSize:30}],...over});
test('normalizes only safe aggregate fields',()=>{
  const result=normalizeReport(make());
  assert.equal(result.metrics.length,1);
  assert.equal(result.externalAiCalls,0);
  assert.equal(result.rawVisitorDataStored,false);
});
test('suppresses small cohorts completely',()=>{
  const result=normalizeReport(make({metrics:[{pagePath:'/news.html',name:'sessions',value:2,sampleSize:2}]}));
  assert.deepEqual(result.metrics,[]);
  assert.equal(result.suppressedRows,1);
  assert(!JSON.stringify(result).includes('"value":2'));
});
test('forbids PII, visitor ID and raw URLs',()=>{
  assert.throws(()=>normalizeReport(make({visitorId:'123'})),/UNTRUSTED_REPORT_FIELDS/);
  assert.throws(()=>normalizeReport(make({metrics:[{pagePath:'/news.html?ref=test',name:'sessions',value:20,sampleSize:20}]})),/INVALID_PAGE_PATH/);
  assert.throws(()=>normalizeReport(make({metrics:[{pagePath:'/news.html',name:'sessions',value:20,sampleSize:20,cookie:'secret'}]})),/UNTRUSTED_REPORT_FIELDS/);
});
test('rejects unknown metrics, duplicate entries and impossible periods',()=>{
  assert.throws(()=>normalizeReport(make({metrics:[{pagePath:'/',name:'recording_url',value:1,sampleSize:30}]})),/UNAPPROVED_METRIC/);
  assert.throws(()=>normalizeReport(make({metrics:[{pagePath:'/',name:'sessions',value:10,sampleSize:30},{pagePath:'/',name:'sessions',value:20,sampleSize:30}]})),/DUPLICATE_MEASUREMENT/);
  assert.throws(()=>normalizeReport(make({period:{from:'2026-02-30',to:'2026-03-01'}})),/INVALID_PERIOD/);
});
test('stable idempotency key for same report; no AI invoked',async()=>{
  const a=await buildBrainAnalyticsEvent(make(),'2026-11-05T11:35:00.000Z');
  const b=await buildBrainAnalyticsEvent(make(),'2026-11-05T11:36:00.000Z');
  assert.equal(a.eventId,b.eventId);
  assert.equal(a.payload.externalAiCalls,0);
  assert.equal(a.aiRouting,'CENTRAL_BRAIN_ONLY');
  assert.equal(a.publish,false);
});
