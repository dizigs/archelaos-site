import test from 'node:test';
import assert from 'node:assert/strict';
import {readAccountBudget,assertGrantBudget} from '../src/budget-guard.mjs';

const now=Date.now();
const customer='1234567890';
const base=()=>({source:'GOOGLE_ADS_API_GAQL',customerId:customer,currency:'USD',
  observedAt:new Date().toISOString(),actualSpendObserved:true,
  budgets:[{resourceName:'customers/'+customer+'/campaignBudgets/1',amountMicros:100000000}],
  spentTodayMicros:5000000,spentMonthMicros:400000000});
const budget=(amount,resource='1')=>({resourceName:'customers/'+customer+'/campaignBudgets/'+resource,
  amountMicros:amount});
test('real-account guard combines every daily budget and actual USD spend',()=>{
  const snapshot=base();
  const r=assertGrantBudget(snapshot,{kind:'budget',action:'create',
    input:{amountMicros:50000000}},Date.now());
  assert.equal(r.accountDailyBudgetUsd,'150.00');
  assert.equal(r.todaySpendUsd,'5.00');
  assert.equal(r.thisMonthSpendUsd,'400.00');
  assert.equal(r.aiBudgetLedger,'SEPARATE_EUR_20');
});
test('new or updated budgets cannot exceed conservative account-wide cap',()=>{
  const snap={...base(),budgets:[budget(200000000),budget(100000000,'2')]};
  assert.throws(()=>assertGrantBudget(snap,{kind:'budget',action:'create',
    input:{amountMicros:40000000}}),/ACCOUNT_WIDE_BUDGET_EXCEEDED/);
  assert.throws(()=>assertGrantBudget(snap,{kind:'budget',action:'updateBudget',
    input:{resourceName:budget(1,'2').resourceName,amountMicros:200000000}}),
  /ACCOUNT_WIDE_BUDGET_EXCEEDED/);
  assert.equal(assertGrantBudget(snap,{kind:'budget',action:'updateBudget',
    input:{resourceName:budget(1,'2').resourceName,amountMicros:50000000}})
    .accountDailyBudgetUsd,'250.00');
});
test('must observe real spend: previews, stale receipts, foreign budgets fail closed',()=>{
  const a=base();
  assert.throws(()=>assertGrantBudget({...a,actualSpendObserved:false},
    {kind:'keyword',action:'create'}),/UNVERIFIED/);
  assert.throws(()=>assertGrantBudget({...a,observedAt:new Date(now-180000).toISOString()},
    {kind:'keyword',action:'create'},now),/STALE/);
  assert.throws(()=>assertGrantBudget({...a,spentMonthMicros:10000000001},
    {kind:'keyword',action:'create'}),/LIMIT_BREACHED/);
  assert.throws(()=>assertGrantBudget({...a,budgets:[budget(1000000),budget(1000000)]},
    {kind:'keyword',action:'create'}),/INVENTORY_INVALID/);
  assert.throws(()=>assertGrantBudget(a,{kind:'campaign',action:'create',
    input:{campaignBudget:'customers/1234567890/campaignBudgets/99'}}),
    /BUDGET_NOT_IN_ACCOUNT/);
});
test('reader queries customer, budget inventory, channels and 2 actual cost windows',async()=>{
  const env={ADS_STAGING_ENABLED:'true',ADS_ACCOUNT_KIND:'AD_GRANTS',
    ADS_CUSTOMER_ID:customer,ADS_API_ACCESS_VERIFIED:'true',
    ADS_OAUTH_SCOPE_VERIFIED:'true',ADS_CUSTOMER_CURRENCY:'USD',
    ADS_OAUTH_MODE:'USER_REFRESH_TOKEN',
    ADS_BUDGET_AUDIT_READ_ENABLED:'true',ADS_OAUTH_CLIENT_ID:'fake-id',
    ADS_OAUTH_CLIENT_SECRET:'fake-secret',ADS_OAUTH_REFRESH_TOKEN:'fake-refresh'};
  const calls=[];
  const responses=[
    [{customer:{id:customer,currencyCode:'USD',status:'ENABLED',testAccount:false,manager:false}}],
    [{campaignBudget:{resourceName:budget(100000000).resourceName,
      status:'ENABLED',period:'DAILY',amountMicros:'100000000'}}],
    [{campaign:{status:'PAUSED',advertisingChannelType:'SEARCH'}}],
    [{metrics:{costMicros:'400000000'}}],
    [{metrics:{costMicros:'5000000'}}]
  ];
  const fetcher=async (url,opts)=>{
    if(url==='https://oauth2.googleapis.com/token')return {
      ok:true,json:async()=>({access_token:'mock-token'})};
    assert(url.includes('/googleAds:searchStream'));
    const query=JSON.parse(opts.body).query;
    calls.push(query);
    const index=calls.length-1;
    return {ok:true,json:async()=>[{results:responses[index]}]};
  };
  const snapshot=await readAccountBudget(env,{fetcher});
  assert.equal(calls.length,5);
  assert(calls[3].includes('THIS_MONTH'));
  assert(calls[4].includes('TODAY'));
  assert.equal(snapshot.budgets.length,1);
  assert.equal(snapshot.spentMonthMicros,400000000);
  assert.equal(snapshot.actualSpendObserved,true);
});
test('no API budget read if staging or audit opt-in is missing',async()=>{
  await assert.rejects(()=>readAccountBudget({ADS_STAGING_ENABLED:'false'},
    {fetcher(){throw Error('MUST_NOT_CALL')}}),/AUDIT_DISABLED/);
});
