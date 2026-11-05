import {adsAccessToken,stagingReady} from './google-ads-api.mjs';
import {scopedName} from './contract.mjs';

const fields={budget:'campaign_budget',campaign:'campaign',adGroup:'ad_group',
  rsa:'ad_group_ad',keyword:'ad_group_criterion'};
const fail=(ok,code)=>{if(!ok)throw Error(code);};

/** Verified one-resource readback, never a second mutate or automatic retry. */
export async function readBackMutation(env,operation,outcome,{fetcher=fetch}={}){
  fail(stagingReady(env),'ADS_STAGING_DISABLED');
  fail(outcome?.ok===true && operation?.kind in fields,'READBACK_NOT_APPLICABLE');
  const kind=operation.kind;
  const candidate=outcome.resourceNames?.[0] ||
    (operation.action!=='create'?operation.input?.resourceName:null);
  const resourceName=scopedName(env.ADS_CUSTOMER_ID,kind,candidate);
  const field=fields[kind];
  const query=kind==='budget'
    ? 'SELECT campaign_budget.resource_name, campaign_budget.amount_micros, campaign_budget.status FROM campaign_budget'
    : 'SELECT '+field+'.resource_name, '+field+'.status FROM '+field;
  const token=await adsAccessToken(env,fetcher);
  const endpoint='https://googleads.googleapis.com/v26/customers/'+env.ADS_CUSTOMER_ID+'/googleAds:search';
  const response=await fetcher(endpoint,{method:'POST',
    headers:{'content-type':'application/json',authorization:'Bearer '+token,
      ...(env.ADS_LOGIN_CUSTOMER_ID?{'login-customer-id':env.ADS_LOGIN_CUSTOMER_ID}:{})},
    body:JSON.stringify({query:query+" WHERE "+field+".resource_name = '"+resourceName+"'"}),
    signal:AbortSignal.timeout(10000)});
  fail(response.ok,'ADS_READBACK_API_REJECTED');
  const data=await response.json();
  fail(Array.isArray(data.results)&&data.results.length===1 && !data.nextPageToken,
    'ADS_READBACK_MISSING_OR_MULTIPLE');
  const objectKey=kind==='budget'?'campaignBudget':kind==='adGroup'?'adGroup':
    kind==='rsa'?'adGroupAd':kind==='keyword'?'adGroupCriterion':'campaign';
  const observed=data.results[0]?.[objectKey];
  fail(observed?.resourceName===resourceName,'ADS_READBACK_RESOURCE_MISMATCH');
  if(kind==='budget'){
    const expected=operation.input?.amountMicros;
    fail(Number.isSafeInteger(expected)&&String(expected)===observed.amountMicros &&
      observed.status==='ENABLED','ADS_READBACK_BUDGET_MISMATCH');
  }else{
    fail(observed.status==='PAUSED','ADS_READBACK_NOT_PAUSED');
  }
  return {source:'GOOGLE_ADS_API_READBACK',verified:true,resourceName,
    state:kind==='budget'?'BUDGET_AMOUNT_MATCHES':'PAUSED_VERIFIED',
    checkedAt:new Date().toISOString(),adsMutation:false};
}
