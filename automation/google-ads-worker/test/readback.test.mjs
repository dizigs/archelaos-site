import test from 'node:test';
import assert from 'node:assert/strict';
import {readBackMutation} from '../src/readback.mjs';
const env={ADS_STAGING_ENABLED:'true',ADS_ACCOUNT_KIND:'AD_GRANTS',
  ADS_CUSTOMER_ID:'1234567890',ADS_API_ACCESS_VERIFIED:'true',
  ADS_OAUTH_SCOPE_VERIFIED:'true',ADS_CUSTOMER_CURRENCY:'USD',
  ADS_OAUTH_CLIENT_ID:'fake-id',ADS_OAUTH_CLIENT_SECRET:'fake-secret',
  ADS_OAUTH_REFRESH_TOKEN:'fake-refresh'};
test('actual paused campaign readback requires one exact resource',async()=>{
  const resourceName='customers/1234567890/campaigns/23';
  const seen=[];
  const fetcher=async(url,options)=>{
    if(url==='https://oauth2.googleapis.com/token')return {ok:true,json:async()=>({access_token:'token'})};
    const query=JSON.parse(options.body).query;
    seen.push(query);
    return {ok:true,json:async()=>({results:[{campaign:{resourceName,status:'PAUSED'}}]})};
  };
  const receipt=await readBackMutation(env,{kind:'campaign',action:'create',
    input:{name:'Archelaos'}},{ok:true,resourceNames:[resourceName]},{fetcher});
  assert.equal(receipt.verified,true);
  assert.equal(receipt.state,'PAUSED_VERIFIED');
  assert(seen[0].includes("campaign.resource_name = 'customers/1234567890/campaigns/23'"));
});
test('budget amount mismatches never produce APPLIED',async()=>{
  const resourceName='customers/1234567890/campaignBudgets/99';
  const fetcher=async(url)=>{
    if(url==='https://oauth2.googleapis.com/token')return {ok:true,json:async()=>({access_token:'token'})};
    return {ok:true,json:async()=>({results:[{campaignBudget:{
      resourceName,status:'ENABLED',amountMicros:'75000000'}}]})};
  };
  await assert.rejects(()=>readBackMutation(env,{kind:'budget',action:'create',
    input:{amountMicros:100000000}},{ok:true,resourceNames:[resourceName]},{fetcher}),
    /READBACK_BUDGET_MISMATCH/);
});
test('readback rejects foreign IDs and absent responses before accepting receipt',async()=>{
  await assert.rejects(()=>readBackMutation(env,{kind:'campaign',action:'create',input:{}},
    {ok:true,resourceNames:['customers/9999999999/campaigns/1']}),
  /FOREIGN_RESOURCE/);
  await assert.rejects(()=>readBackMutation(env,{kind:'campaign',action:'create',input:{}},
    {ok:true,resourceNames:[]}),/FOREIGN_RESOURCE/);
});
