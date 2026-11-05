import {descriptor} from './contract.mjs';
const ok=(value,code)=>{if(!value)throw Error(code);};
export function stagingReady(env) {
  return env?.ADS_STAGING_ENABLED==='true' && env?.ADS_ACCOUNT_KIND==='AD_GRANTS' &&
    /^\d{10}$/.test(env?.ADS_CUSTOMER_ID||'') && env?.ADS_API_ACCESS_VERIFIED==='true' &&
    env?.ADS_OAUTH_SCOPE_VERIFIED==='true' && env?.ADS_CUSTOMER_CURRENCY==='USD';
}
export function liveReady(env) {
  return stagingReady(env) && env?.ADS_LIVE_ENABLED==='true' &&
    env?.ADS_STAGING_TEST_RECEIPT_VERIFIED==='true' &&
    env?.ADS_POLICY_REVIEW_VERIFIED==='true' && env?.ADS_KILL_SWITCH==='off' &&
    env?.ADS_APPROVED_CHANGE_CONTROL==='true' && env?.ADS_D1;
}
/** Tokens are fetched only after all staging entitlement gates; never logged. */
export async function adsAccessToken(env, fetcher=fetch) {
  ok(typeof env?.ADS_OAUTH_CLIENT_ID==='string' && typeof env?.ADS_OAUTH_CLIENT_SECRET==='string' &&
    typeof env?.ADS_OAUTH_REFRESH_TOKEN==='string','ADS_CREDENTIALS_MISSING');
  const payload=new URLSearchParams({client_id:env.ADS_OAUTH_CLIENT_ID,
    client_secret:env.ADS_OAUTH_CLIENT_SECRET,refresh_token:env.ADS_OAUTH_REFRESH_TOKEN,
    grant_type:'refresh_token'});
  const response=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded'},body:payload});
  if(!response.ok)throw Error('ADS_OAUTH_FAILURE_'+response.status);
  const token=await response.json();
  ok(typeof token.access_token==='string'&&token.access_token.length>0,'ADS_ACCESS_TOKEN_MISSING');
  return token.access_token;
}
/** Never retry an ambiguous mutation -- server might have committed the first request. */
export async function sendAdsOperation(env, spec, {fetcher=fetch,validateOnly=true}={}) {
  ok(stagingReady(env),'ADS_STAGING_DISABLED');
  ok(spec?.customer===env.ADS_CUSTOMER_ID,'ADS_CUSTOMER_MISMATCH');
  const safe=descriptor(spec.kind,spec.action,spec.input,env.ADS_CUSTOMER_ID);
  ok(validateOnly || liveReady(env),'ADS_LIVE_DISABLED');
  safe.body.validateOnly=validateOnly;
  const token=await adsAccessToken(env,fetcher);
  const response=await fetcher(safe.endpoint,{method:'POST',
    headers:{'content-type':'application/json',authorization:'Bearer '+token,
      ...(env.ADS_LOGIN_CUSTOMER_ID?{'login-customer-id':env.ADS_LOGIN_CUSTOMER_ID}:{})},
    body:JSON.stringify(safe.body)});
  const requestId=response.headers.get('request-id') || null;
  if(!response.ok) return {ok:false,status:response.status,requestId,
    code:'GOOGLE_ADS_REJECTED',retryable:false,applied:false,validateOnly};
  const body=await response.json();
  return {ok:true,status:response.status,requestId,
    resourceNames:Array.isArray(body.results)?body.results.map(x=>x.resourceName).filter(Boolean):[],
    applied:!validateOnly,validateOnly};
}
export function keywordIdeaRequest(customer,{landing,keywords=[],geoIds=[],languageId='1032'}) {
  ok(/^\d{10}$/.test(customer),'INVALID_CUSTOMER');
  ok(typeof landing==='string'&&/^https:\/\/(?:www\.)?archelaos\.club\/[a-z0-9-]+\.html$/.test(landing),
    'INVALID_LANDING');
  ok(Array.isArray(keywords)&&keywords.length>=1&&keywords.length<=20&&
    keywords.every(s=>typeof s==='string'&&s.trim().split(/\s+/).length>=2),'INVALID_SEEDS');
  ok(Array.isArray(geoIds)&&geoIds.length>=1&&geoIds.length<=10&&
    geoIds.every(x=>/^\d+$/.test(String(x))),'UNVERIFIED_GEO_IDS');
  ok(/^\d+$/.test(String(languageId)),'INVALID_LANGUAGE');
  return {endpoint:'https://googleads.googleapis.com/v26/customers/'+customer+':generateKeywordIdeas',
    body:{keywordAndUrlSeed:{keywords,url:landing},language:'languageConstants/'+languageId,
      geoTargetConstants:geoIds.map(id=>'geoTargetConstants/'+id),
      keywordPlanNetwork:'GOOGLE_SEARCH',includeAdultKeywords:false,pageSize:50}};
}

/** Bounded, read-only Keyword Planner call; always gated, never a mutation. */
export async function readKeywordIdeas(env,seed,{fetcher=fetch}={}) {
  ok(stagingReady(env) && env?.ADS_KEYWORD_PLANNER_READ_ENABLED==='true',
    'KEYWORD_PLANNER_DISABLED');
  const request=keywordIdeaRequest(env.ADS_CUSTOMER_ID,seed);
  const token=await adsAccessToken(env,fetcher);
  const response=await fetcher(request.endpoint,{method:'POST',
    headers:{'content-type':'application/json',authorization:'Bearer '+token,
      ...(env.ADS_LOGIN_CUSTOMER_ID?{'login-customer-id':env.ADS_LOGIN_CUSTOMER_ID}:{})},
    body:JSON.stringify(request.body)});
  const requestId=response.headers?.get('request-id')||null;
  if(!response.ok) return {ok:false,code:'KEYWORD_PLANNER_REJECTED',status:response.status,
    requestId,ideas:[],observed:false};
  const data=await response.json();
  ok(Array.isArray(data.results)&&data.results.length<=50,'UNSAFE_KEYWORD_RESPONSE');
  const ideas=data.results.map(item=>{
    ok(typeof item.text==='string' && item.text.length<=80 &&
      item.text.trim().split(/\s+/).length>=2,'UNSAFE_KEYWORD_IDEA');
    const monthly=Number(item.keywordIdeaMetrics?.avgMonthlySearches);
    ok(Number.isSafeInteger(monthly)&&monthly>=0,'UNSAFE_KEYWORD_METRICS');
    return {text:item.text,monthlySearches:monthly,
      competition:['LOW','MEDIUM','HIGH'].includes(item.keywordIdeaMetrics?.competition)?
        item.keywordIdeaMetrics.competition:'UNKNOWN'};
  });
  return {ok:true,source:'GOOGLE_ADS_API_KEYWORD_PLANNER',requestId,
    customerVerifiedAgainstEnv:true,observed:true,ideas,
    usedForAutonomousMutations:false};
}
