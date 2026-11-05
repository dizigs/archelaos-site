import {validateDraft,validateAnalytics,descriptor} from './contract.mjs';
import {stagingReady,liveReady,sendAdsOperation,keywordIdeaRequest,readKeywordIdeas} from './google-ads-api.mjs';

const exact=(object,keys)=>object&&typeof object==='object'&&!Array.isArray(object)&&
  Object.keys(object).every(key=>keys.includes(key));
const raise=(ok,msg)=>{if(!ok)throw Error(msg);};
const hex=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),
    x=>x.toString(16).padStart(2,'0')).join('');
export async function signForTestOnly(secret, timestamp, nonce, action) {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const data=new TextEncoder().encode(timestamp+'\n'+nonce+'\n'+JSON.stringify(action));
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,data)),
    x=>x.toString(16).padStart(2,'0')).join('');
}
export async function authenticate(envelope,env,now=Date.now()){
  raise(exact(envelope,['timestamp','nonce','signature','action']) &&
    typeof envelope.timestamp==='string' && /^\d{4}-\d{2}-\d{2}T/.test(envelope.timestamp) &&
    typeof envelope.nonce==='string' && /^[a-f0-9]{32}$/.test(envelope.nonce) &&
    typeof envelope.signature==='string' && /^[a-f0-9]{64}$/.test(envelope.signature) &&
    typeof env?.ADS_BRAIN_SHARED_SECRET==='string' && env.ADS_BRAIN_SHARED_SECRET.length>=32,
  'BRAIN_AUTH_MISSING');
  const t=Date.parse(envelope.timestamp);
  raise(Number.isFinite(t) && Math.abs(now-t)<=5*60*1000,'BRAIN_SIGNATURE_EXPIRED');
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.ADS_BRAIN_SHARED_SECRET),
    {name:'HMAC',hash:'SHA-256'},false,['verify']);
  const signature=new Uint8Array(envelope.signature.match(/../g).map(b=>Number.parseInt(b,16)));
  const data=new TextEncoder().encode(envelope.timestamp+'\n'+envelope.nonce+'\n'+JSON.stringify(envelope.action));
  raise(await crypto.subtle.verify('HMAC',key,signature,data),'BRAIN_SIGNATURE_INVALID');
  raise(exact(envelope.action,['mode','draft','evidence','month','analytics','operation','idempotencyKey',
      'approvalId','approvalExpiresAt','plannerSeed','correlationId']) &&
    typeof envelope.action.mode==='string' && typeof envelope.action.correlationId==='string' &&
    /^[a-zA-Z0-9_-]{8,64}$/.test(envelope.action.correlationId),'INVALID_BRAIN_INTENT');
  return envelope.action;
}

function operationShape(action,env){
  const op=action.operation;
  raise(exact(op,['kind','action','input']) && typeof op.kind==='string','UNSAFE_OPERATION');
  return descriptor(op.kind,op.action,op.input,env.ADS_CUSTOMER_ID);
}
async function durableClaim(env,action,spec,now){
  raise(env.ADS_D1 && typeof env.ADS_D1.prepare==='function','ADS_AUDIT_DB_MISSING');
  raise(/^[a-zA-Z0-9:_-]{16,96}$/.test(action.idempotencyKey||''),'INVALID_IDEMPOTENCY_KEY');
  const hash=await hex(JSON.stringify({spec,approvalId:action.approvalId}));
  const db=env.ADS_D1;
  const existing=await db.prepare('SELECT intent_hash,status,resource_name,request_id FROM ads_receipts WHERE idempotency_key=?')
    .bind(action.idempotencyKey).first();
  if(existing){
    raise(existing.intent_hash===hash,'IDEMPOTENCY_CONFLICT');
    return {claimed:false,receipt:{idempotencyKey:action.idempotencyKey,status:existing.status,
      resourceName:existing.resource_name||null,requestId:existing.request_id||null,
      replayed:true,applied:existing.status==='APPLIED'}};
  }
  const inserted=await db.prepare('INSERT OR IGNORE INTO ads_receipts (idempotency_key,intent_hash,kind,action,status,correlation_id,created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(action.idempotencyKey,hash,spec.kind,spec.action,'IN_FLIGHT',action.correlationId,
      new Date(now).toISOString()).run();
  if(inserted.meta?.changes!==1) return {claimed:false,receipt:{
    idempotencyKey:action.idempotencyKey,status:'UNKNOWN_CONCURRENT_CLAIM',replayed:true,applied:false}};
  return {claimed:true,hash};
}
async function durableFinish(env,action,result,status){
  await env.ADS_D1.prepare('UPDATE ads_receipts SET status=?,resource_name=?,request_id=? WHERE idempotency_key=? AND status=?')
    .bind(status,result.resourceNames?.[0]||null,result.requestId||null,
      action.idempotencyKey,'IN_FLIGHT').run();
}

/** Private, authenticated RPC. Every external mutation stays disabled by default. */
export async function dispatch(envelope,env,ports={},now=Date.now()){
  const action=await authenticate(envelope,env,now);
  if(action.mode==='dry_run') return {status:'OFFLINE_DRY_RUN',correlationId:action.correlationId,
    receipt:validateDraft(action.draft,action.evidence||{},action.month||'2026-11'),
    adsMutation:false,aiCostEur:0};
  if(action.mode==='analytics_preview') return {status:'REVIEW_ONLY',correlationId:action.correlationId,
    receipt:validateAnalytics(action.analytics),adsMutation:false,aiCostEur:0};
  if(action.mode==='keyword_ideas_preview') {
    raise(stagingReady(env),'ADS_STAGING_DISABLED');
    return {status:'REQUEST_PREVIEW_ONLY',request:keywordIdeaRequest(env.ADS_CUSTOMER_ID,action.plannerSeed),
      adsMutation:false,aiCostEur:0};
  }
  if(action.mode==='keyword_ideas_read') return {status:'KEYWORD_PLANNER_READ_ONLY',correlationId:action.correlationId,
    receipt:await (ports.planner||readKeywordIdeas)(env,action.plannerSeed,{fetcher:ports.fetch}),
    adsMutation:false,aiCostEur:0};
  raise(['validate_only','apply','rollback_preview'].includes(action.mode),'UNKNOWN_MODE');
  raise(stagingReady(env),'ADS_STAGING_DISABLED');
  const spec=operationShape(action,env);
  if(action.mode==='rollback_preview') {
    raise(action.operation.action==='create','ROLLBACK_REQUIRES_STORED_PREIMAGE');
    return {status:'MANUAL_ROLLBACK_REVIEW_REQUIRED',correlationId:action.correlationId,
      possibleInverse:{kind:spec.kind,resourceName:'VERIFY_FROM_SUCCESSFUL_ADS_RECEIPT',
        action:'REMOVE_ONLY_IF_STILL_PAUSED'},
      adsMutation:false,aiCostEur:0};
  }
  if(action.mode==='validate_only'){
    const outcome=await (ports.send||sendAdsOperation)(env,action.operation,{validateOnly:true,fetcher:ports.fetch});
    return {status:outcome.ok?'GOOGLE_VALIDATE_ONLY_OK':'GOOGLE_VALIDATE_ONLY_REJECTED',
      correlationId:action.correlationId,receipt:outcome,adsMutation:false,aiCostEur:0};
  }
  raise(liveReady(env),'ADS_LIVE_DISABLED');
  raise(typeof action.approvalId==='string'&&/^[A-Za-z0-9_-]{12,96}$/.test(action.approvalId) &&
    typeof action.approvalExpiresAt==='string'&&Number.isFinite(Date.parse(action.approvalExpiresAt)) &&
    Date.parse(action.approvalExpiresAt)>=now && Date.parse(action.approvalExpiresAt)<=now+86400000,
  'CHANGE_APPROVAL_INVALID');
  // New/adapted entities are PAUSED; this adapter never enables serving campaigns.
  const claimed=await durableClaim(env,action,spec,now);
  if(!claimed.claimed)return {status:claimed.receipt.status,correlationId:action.correlationId,
    receipt:claimed.receipt,adsMutation:false,aiCostEur:0};
  let result,status='NEEDS_RECONCILIATION';
  try{
    result=await (ports.send||sendAdsOperation)(env,action.operation,{validateOnly:false,fetcher:ports.fetch});
    status=result.ok?'APPLIED':(result.status>=400&&result.status<500?'REJECTED':'NEEDS_RECONCILIATION');
  }catch{
    result={ok:false,requestId:null,resourceNames:[],applied:false};
  }
  await durableFinish(env,action,result,status);
  return {status,correlationId:action.correlationId,receipt:{idempotencyKey:action.idempotencyKey,
      requestId:result.requestId||null,resourceNames:result.resourceNames||[],applied:status==='APPLIED'},
    adsMutation:status==='APPLIED',aiCostEur:0};
}
