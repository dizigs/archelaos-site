import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dispatch, signForTestOnly} from '../src/engine.mjs';
import {makeBrainReviewHandoff} from '../src/brain-handoff.mjs';

const SECRET = 'synthetic-offline-test-secret-32-bytes';
const CORRELATION = 'ads-postmerge-handoff-01';
const CUSTOMER = '1234567890'; // synthetic fixture only, never an operator ID
const env = {ADS_BRAIN_SHARED_SECRET: SECRET};
const staged = {...env, ADS_STAGING_ENABLED:'true', ADS_ACCOUNT_KIND:'AD_GRANTS',
  ADS_CUSTOMER_ID:CUSTOMER, ADS_CUSTOMER_CURRENCY:'USD',
  ADS_API_ACCESS_VERIFIED:'true', ADS_OAUTH_SCOPE_VERIFIED:'true',
  ADS_BUDGET_AUDIT_READ_ENABLED:'true'};
const sign = async action => {
  const timestamp = new Date().toISOString();
  const nonce = '10101010101010101010101010101010';
  return {timestamp,nonce,action,
    signature:await signForTestOnly(SECRET,timestamp,nonce,action)};
};
const budgetSnapshot = () => ({
  source:'GOOGLE_ADS_API_GAQL',customerId:CUSTOMER,currency:'USD',
  observedAt:new Date().toISOString(),actualSpendObserved:true,
  budgets:[{resourceName:'customers/'+CUSTOMER+'/campaignBudgets/1',amountMicros:100000000}],
  spentTodayMicros:0,spentMonthMicros:0
});

test('mock Brain -> Ads Analytics -> Brain handoff is private and review-only',async()=>{
  const analytics = {schemaVersion:1,type:'aggregate_report_ready',
    privacyStatus:'AGGREGATED_ONLY',payload:{
      reportDigest:'a'.repeat(64),source:'ga4',
      period:{from:'2026-11-01',to:'2026-11-04'},rawVisitorDataStored:false,
      metrics:[{pagePath:'/history.html',name:'engaged_sessions',value:45,sampleSize:45}]}};
  const r=await dispatch(await sign({mode:'analytics_preview',analytics,
    correlationId:CORRELATION}),env,{
      send:()=>{throw Error('GOOGLE_WRITE_NOT_ALLOWED');},
      fetch:()=>{throw Error('OUTBOUND_NETWORK_NOT_ALLOWED');}
    });
  assert.equal(r.status,'REVIEW_ONLY');
  assert.equal(r.adsMutation,false);
  assert.equal(r.brainHandoff.capability,'google_ads');
  assert.equal(r.brainHandoff.channel,'PRIVATE_BRAIN_RPC_ONLY');
  assert.equal(r.brainHandoff.deliveryStatus,'NOT_SENT_BY_WORKER');
  assert.equal(r.brainHandoff.reviewOnly,true);
  assert.equal(r.brainHandoff.aiCostEur,0);
  assert.deepEqual(r.brainHandoff.payload.hints,[{
    pagePath:'/history.html',metric:'engaged_sessions',value:45}]);
  assert(!JSON.stringify(r.brainHandoff).includes('customerId":"' ));
});

test('budget audit fails closed before an injected mock can bypass staging',async()=>{
  let called=0;
  const action=await sign({mode:'budget_audit_read',correlationId:CORRELATION});
  await assert.rejects(()=>dispatch(action,env,{
    budgetAudit:async()=>{called++;return budgetSnapshot();}
  }),/ADS_BUDGET_AUDIT_DISABLED/);
  assert.equal(called,0);
  await assert.rejects(()=>dispatch(action,{...staged,ADS_BUDGET_AUDIT_READ_ENABLED:'false'},{
    budgetAudit:async()=>{called++;return budgetSnapshot();}
  }),/ADS_BUDGET_AUDIT_DISABLED/);
  assert.equal(called,0);
});

test('mock budget readback provides only USD aggregates with separate AI ledger',async()=>{
  const action=await sign({mode:'budget_audit_read',correlationId:CORRELATION});
  const ports={budgetAudit:async()=>budgetSnapshot(),
    send:()=>{throw Error('WRITE_NOT_ALLOWED');}};
  const r=await dispatch(action,staged,ports);
  assert.equal(r.status,'BUDGET_AUDIT_READ_ONLY');
  assert.equal(r.receipt.accountDailyBudgetUsd,'100.00');
  assert.equal(r.receipt.aiBudgetLedger,'SEPARATE_EUR_20');
  assert.equal(r.brainHandoff.payload.ledger,'AD_GRANTS_USD_NOT_AI_EUR');
  assert.equal(r.brainHandoff.payload.todaySpendUsd,'0.00');
  assert.equal(r.brainHandoff.adsMutation,false);
  assert.equal(r.brainHandoff.deliveryStatus,'NOT_SENT_BY_WORKER');
  assert(!JSON.stringify(r.brainHandoff).includes(CUSTOMER));
  await assert.rejects(()=>dispatch(action,staged,{
    budgetAudit:async()=>({...budgetSnapshot(),customerId:'9999999999'})
  }),/ADS_BUDGET_CUSTOMER_MISMATCH/);
});

test('mock Keyword Planner read is BLOCKED at Explorer even if mock port succeeds',async()=>{
  let called=0;
  const seed={landing:'https://archelaos.club/history.html',
    keywords:['ιστορία συλλόγου Κατερίνης'],geoIds:['2300']};
  const action=await sign({mode:'keyword_ideas_read',correlationId:CORRELATION,
    plannerSeed:seed});
  await assert.rejects(()=>dispatch(action,{
    ...staged,ADS_KEYWORD_PLANNER_READ_ENABLED:'true',ADS_API_ACCESS_LEVEL:'EXPLORER'
  },{planner:async()=>{called++;return {ok:true};}}),
  /KEYWORD_PLANNER_REQUIRES_BASIC_OR_STANDARD_API_ACCESS/);
  assert.equal(called,0);
});

test('handoff never passes raw records, customer identity or invalid receipt data',()=>{
  assert.throws(()=>makeBrainReviewHandoff('budget_audit_read',CORRELATION,{
    source:'GOOGLE_ADS_API_GAQL',currency:'USD',actualSpendObserved:true,
    aiBudgetLedger:'SEPARATE_EUR_20',accountDailyBudgetUsd:'1234abc'
  }),/ADS_HANDOFF_BUDGET_UNVERIFIED/);
  assert.throws(()=>makeBrainReviewHandoff('apply',CORRELATION,{}),
    /ADS_HANDOFF_MODE_NOT_ALLOWED/);
  const report=makeBrainReviewHandoff('analytics_preview',CORRELATION,{
    source:'ga4',artifactDigest:'b'.repeat(64),autoChange:false,
    hints:[{page:'/history.html',metric:'clicks',count:10,
      action:'REVIEW_ONLY_NO_CAUSAL_INFERENCE',email:'somebody@example.invalid'}]
  });
  assert(!JSON.stringify(report).includes('email'));
});

test('committed Wrangler config disables all live mutations, planning and staging',()=>{
  const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
  assert.equal(config.workers_dev,false);
  assert.equal(config.preview_urls,false);
  assert.equal(config.vars.ADS_LIVE_ENABLED,'false');
  assert.equal(config.vars.ADS_STAGING_ENABLED,'false');
  assert.equal(config.vars.ADS_KILL_SWITCH,'on');
  assert.equal(config.vars.ADS_OAUTH_MODE,'UNCONFIGURED');
  assert.equal(config.vars.ADS_KEYWORD_PLANNER_READ_ENABLED,'false');
});
