import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {allowedLanding,validateDraft,dailyBudget,validateAnalytics,descriptor,scopedName} from '../src/contract.mjs';
import {stagingReady,liveReady,sendAdsOperation,keywordIdeaRequest} from '../src/google-ads-api.mjs';
import {authenticate,dispatch,signForTestOnly} from '../src/engine.mjs';

const draft=JSON.parse(readFileSync(new URL('../../../rebuild/ads/campaigns.draft.json',import.meta.url),'utf8'));
const secret='offline-test-secret-32-characters-only';
const env={ADS_BRAIN_SHARED_SECRET:secret};
const sign=async(action,now=Date.now())=>{
  const timestamp=new Date(now).toISOString();
  const nonce='0123456789abcdef0123456789abcdef';
  return {timestamp,nonce,signature:await signForTestOnly(secret,timestamp,nonce,action),action};
};
const corr='issue216-correlation-01';
const grant={...env,ADS_STAGING_ENABLED:'true',ADS_ACCOUNT_KIND:'AD_GRANTS',
  ADS_CUSTOMER_ID:'1234567890',ADS_API_ACCESS_VERIFIED:'true',
  ADS_OAUTH_SCOPE_VERIFIED:'true',ADS_CUSTOMER_CURRENCY:'USD'};
const live={...grant,ADS_LIVE_ENABLED:'true',ADS_STAGING_TEST_RECEIPT_VERIFIED:'true',
  ADS_POLICY_REVIEW_VERIFIED:'true',ADS_KILL_SWITCH:'off',ADS_APPROVED_CHANGE_CONTROL:'true'};

function mockD1(){
  const rows=new Map();
  return {rows,prepare(sql){
    let args=[];
    return {bind(...a){args=a;return this;},async first(){
      const row=rows.get(args[0]);return row||null;
    },async run(){
      if(sql.startsWith('INSERT')){
        if(rows.has(args[0]))return {meta:{changes:0}};
        rows.set(args[0],{intent_hash:args[1],kind:args[2],action:args[3],
          status:args[4],correlation_id:args[5],resource_name:null,request_id:null});
      }else if(sql.startsWith('UPDATE')){
        const r=rows.get(args[3]);
        if(!r||r.status!==args[4])return {meta:{changes:0}};
        r.status=args[0];r.resource_name=args[1];r.request_id=args[2];
      }
      return {meta:{changes:1}};
    }};
  }};
}
test('existing PR70 editorial draft is never importable and has no budget',()=>{
  assert.equal(draft.mode,'dry-run');assert.equal(draft.budgets,null);
  const result=validateDraft(draft,{},'2026-11');
  assert.equal(result.readyForLive,false);
  assert(result.blockers.includes('LANDING_NOT_VERIFIED'));
  assert.equal(result.campaigns.length,2);
  assert.equal(result.campaigns[0].adGroups[0].keywords[0].plannerVerified,false);
});
test('calendar-aware allocations never cross $329 daily or $10k monthly',()=>{
  for(let m=1;m<=12;m++){
    const b=dailyBudget(draft,'2026-'+String(m).padStart(2,'0'));
    assert(Number(b.plannedDailyUsd)<=329);assert(Number(b.monthMaxUsd)<=10000);
    assert.equal(b.allocations.reduce((s,c)=>s+Math.round(Number(c.dailyUsd)*100),0),
      Math.round(Number(b.plannedDailyUsd)*100));
    assert.equal(b.nonImportable,true);
  }
});
test('exact URL allowlist rejects external, URL params and deceptive subdomains',()=>{
  assert(allowedLanding('https://www.archelaos.club/history.html'));
  for(const url of ['https://archelaos.club.evil.tld/history.html',
    'http://archelaos.club/history.html','https://www.archelaos.club/history.html?x=1',
    'https://www.archelaos.club/expired-event.html'])
    assert.equal(allowedLanding(url),false);
});
test('only paused Search campaigns, ads and structured keywords can be created',()=>{
  const campaign=descriptor('campaign','create',{name:'Αρχέλαος αθλητισμός',
    campaignBudget:'customers/1234567890/campaignBudgets/42'},'1234567890');
  assert.equal(campaign.body.operations[0].create.status,'PAUSED');
  assert.equal(campaign.body.operations[0].create.advertisingChannelType,'SEARCH');
  assert.equal(campaign.body.operations[0].create.networkSettings.targetPartnerSearchNetwork,false);
  assert.equal(campaign.body.operations[0].create.networkSettings.targetContentNetwork,false);
  assert.equal(campaign.body.validateOnly,true);
  assert.equal('language' in campaign.body.operations[0].create,false);
  assert.throws(()=>scopedName('1234567890','campaign','customers/9999999999/campaigns/99'),/FOREIGN_RESOURCE/);
  assert.throws(()=>descriptor('keyword','create',{adGroup:'customers/1234567890/adGroups/9',
    text:'football',matchType:'PHRASE'},'1234567890'),/UNSAFE_KEYWORD/);
  assert.throws(()=>descriptor('campaign','enable',{resourceName:'customers/1234567890/campaigns/2'},
    '1234567890'),/UNKNOWN_ACTION/);
});
test('RSA headline limits, source URL and status fail closed',()=>{
  const input={adGroup:'customers/1234567890/adGroups/9',
    finalUrl:'https://archelaos.club/history.html',
    headlines:['Αρχέλαος Κατερίνης','Η ιστορία του συλλόγου','Ψηφιακό αρχείο'],
    descriptions:['Μάθετε για τον σύλλογο.','Δείτε τα δημόσια στοιχεία.']};
  assert.equal(descriptor('rsa','create',input,'1234567890').body.operations[0].create.status,'PAUSED');
  assert.throws(()=>descriptor('rsa','create',{...input,headlines:['a','a','b']},'1234567890'),/UNSAFE_RSA/);
  assert.throws(()=>descriptor('rsa','create',{...input,finalUrl:'https://example.com'},'1234567890'),/UNTRUSTED_LANDING/);
});
test('planner template is limited to Google Search with explicit geo ids',()=>{
  const x=keywordIdeaRequest('1234567890',{landing:'https://archelaos.club/history.html',
    keywords:['αθλητική ιστορία κατερίνης'],geoIds:['2300']});
  assert.equal(x.body.keywordPlanNetwork,'GOOGLE_SEARCH');
  assert.equal(x.body.language,'languageConstants/1032');
  assert.throws(()=>keywordIdeaRequest('1234567890',{landing:'https://archelaos.club/history.html',
    keywords:['Αρχέλαος Κατερίνης'],geoIds:[]}),/UNVERIFIED_GEO_IDS/);
});
test('analytics adapter rejects unaggregated or personal inputs',()=>{
  const a={schemaVersion:1,type:'aggregate_report_ready',privacyStatus:'AGGREGATED_ONLY',
    payload:{reportDigest:'a'.repeat(64),rawVisitorDataStored:false,source:'ga4',
      period:{from:'2026-10-01',to:'2026-10-31'},
      metrics:[{pagePath:'/history.html',name:'engaged_sessions',value:50,sampleSize:32}]}};
  assert.equal(validateAnalytics(a).autoChange,false);
  assert.throws(()=>validateAnalytics({...a,payload:{...a.payload,
    metrics:[{...a.payload.metrics[0],sampleSize:1}]} }),/RAW_OR_UNAPPROVED_ANALYTICS/);
  assert.throws(()=>validateAnalytics({...a,payload:{...a.payload,
    metrics:[{...a.payload.metrics[0],email:'private@example.com'}]} }),/RAW_OR_UNAPPROVED_ANALYTICS|UNTRUSTED/);
});
test('unsigned, tampered and stale Brain intentions never reach worker',async()=>{
  const a={mode:'dry_run',draft,correlationId:corr};
  const signed=await sign(a);
  assert.deepEqual(await authenticate(signed,env),a);
  await assert.rejects(()=>dispatch({...signed,signature:'a'.repeat(64)},env),/BRAIN_SIGNATURE_INVALID/);
  await assert.rejects(()=>dispatch({...signed,action:{...a,mode:'apply'}},env),/BRAIN_SIGNATURE_INVALID/);
  const old=await sign(a,Date.now()-3600000);
  await assert.rejects(()=>dispatch(old,env),/BRAIN_SIGNATURE_EXPIRED/);
});
test('private dry run never calls Google APIs or spends AI budget',async()=>{
  const action={mode:'dry_run',draft,correlationId:corr};
  const r=await dispatch(await sign(action),env,{send(){throw Error('MUST_NOT_CALL_ADS')}});
  assert.equal(r.adsMutation,false);assert.equal(r.aiCostEur,0);
  assert.equal(r.status,'OFFLINE_DRY_RUN');
});
test('live and staging gates default to disabled even with OAuth tokens',()=>{
  assert.equal(stagingReady(env),false);
  assert.equal(liveReady({...live}),false);
});
test('validating an Ads mutation calls OAuth once and Google validateOnly once',async()=>{
  const seen=[];
  const fetcher=async (url,options)=>{
    seen.push({url,options});
    if(url.startsWith('https://oauth2.googleapis.com/'))
      return {ok:true,json:async()=>({access_token:'mock-access-token'})};
    return {ok:true,status:200,headers:{get:()=> 'mock-google-request-id'},
      json:async()=>({results:[]})};
  };
  const e={...grant,ADS_OAUTH_CLIENT_ID:'mock',ADS_OAUTH_CLIENT_SECRET:'mock',
    ADS_OAUTH_REFRESH_TOKEN:'mock'};
  const result=await sendAdsOperation(e,{kind:'campaign',action:'create',
    input:{name:'Αρχέλαος Κατερίνης',campaignBudget:'customers/1234567890/campaignBudgets/2'}},
    {fetcher,validateOnly:true});
  assert.equal(result.applied,false);assert.equal(result.requestId,'mock-google-request-id');
  assert.equal(seen.length,2);
  assert(JSON.parse(seen[1].options.body).validateOnly);
  assert.equal(seen[1].options.headers.authorization,'Bearer mock-access-token');
  assert.equal('developer-token' in seen[1].options.headers,false);
});
test('failed or unknown outcome is not auto retried; claim is durable',async()=>{
  const db=mockD1();
  const action={mode:'apply',correlationId:corr,
    operation:{kind:'campaign',action:'create',input:{
      name:'Αρχέλαος Κατερίνης',campaignBudget:'customers/1234567890/campaignBudgets/2'}},
    idempotencyKey:'issue216-idempotency-001',approvalId:'approved-change-216',
    approvalExpiresAt:new Date(Date.now()+60000).toISOString()};
  const e={...live,ADS_D1:db};
  let calls=0;
  const ports={send:async()=>{calls++;throw Error('network maybe committed')}};
  const signed=await sign(action);
  const first=await dispatch(signed,e,ports);
  assert.equal(first.status,'NEEDS_RECONCILIATION');
  const second=await dispatch(signed,e,ports);
  assert.equal(second.status,'NEEDS_RECONCILIATION');
  assert.equal(calls,1);
  assert.equal(db.rows.size,1);
});
test('idempotency conflict cannot overwrite earlier claimed mutation',async()=>{
  const db=mockD1(),e={...live,ADS_D1:db};
  const base={mode:'apply',correlationId:corr,
    operation:{kind:'campaign',action:'pause',
      input:{resourceName:'customers/1234567890/campaigns/44'}},
    idempotencyKey:'issue216-idempotency-002',approvalId:'approved-change-216',
    approvalExpiresAt:new Date(Date.now()+60000).toISOString()};
  const ports={send:async()=>({ok:true,requestId:'mock',resourceNames:[],
    applied:true})};
  assert.equal((await dispatch(await sign(base),e,ports)).status,'APPLIED');
  assert.equal((await dispatch(await sign(base),e,ports)).receipt.replayed,true);
  await assert.rejects(()=>dispatch(await sign({...base,operation:{...base.operation,
    input:{resourceName:'customers/1234567890/campaigns/45'}}}),e,ports),/IDEMPOTENCY_CONFLICT/);
});
