/**
 * Private, centrally admitted Gemma 4 classifier for verified PUBLIC sports news.
 * This module has no Worker entrypoint and is never invoked automatically.
 * Controller must construct trusted ports; caller-supplied booleans are not authority.
 */
export const GEMMA_MODEL = '@cf/google/gemma-4-26b-a4b-it';
export const DEFAULT_STATE = 'OFF';
export const LABELS = Object.freeze(['GAS','MERGED','OTHER','REVIEW']);
export const SPORTS = Object.freeze([
  'handball','athletics','gymnastics','archery','shooting','wrestling',
  'volleyball','swimming','finswimming','weightlifting','unknown'
]);
const HEX = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const exact = (value, keys) => Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(k=>Object.hasOwn(value,k)));
const stop = reason=>({status:'GEMMA_HELD',reason,modelCalls:0,published:false});
const bad = ()=>{throw Error('INVALID_PUBLIC_SOURCE');};

export function preparePublicClassification(source){
  if(!exact(source,['eventId','revisionHash','sourceHash','text']) ||
      !UUID.test(source.eventId)||!HEX.test(source.revisionHash) ||
      !HEX.test(source.sourceHash)||typeof source.text!=='string' ||
      source.text.length<30||source.text.length>2000)bad();
  if(/[\\x00-\\x08\\x0e-\\x1f]/.test(source.text) ||
    /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+?30[ -]?69\d{8}|\bya29\.|\bGOCSPX-)/i.test(source.text))bad();
  return Object.freeze({...source});
}

export function decodeGemmaClassification(result, source){
  let raw = result;
  if(typeof result==='string'){
    if(result.length>3000) throw Error('INVALID_AI_RESULT');
    try{raw=JSON.parse(result);}catch{throw Error('INVALID_AI_RESULT');}
  }
  const keys=['club','sport','confidence','evidence'];
  if(!exact(raw,keys) || !LABELS.includes(raw.club) || !SPORTS.includes(raw.sport) ||
    typeof raw.confidence!=='number'||!Number.isFinite(raw.confidence) ||
    raw.confidence<0||raw.confidence>1||
    typeof raw.evidence!=='string'||raw.evidence.length>160||
    !source.text.includes(raw.evidence) || raw.evidence.length<8)
    throw Error('INVALID_AI_RESULT');
  return Object.freeze({
    classification:raw.club, sport:raw.sport, confidence:raw.confidence,
    evidence:raw.evidence, publicEvidenceUnverified:true,
    requiresHumanReview:true, published:false
  });
}

function requirePorts(ports){
  return !!ports && ['getControls','getSpendingCoverage','reserve','invoke','settle','hold'].every(
    key=>typeof ports[key]==='function');
}

/**
 * No request/response directly accesses Google, Cloudflare billing, or an AI API.
 * Production orchestrator must provide trusted ports implemented server-side:
 * controls, account-wide cost coverage, durable unique reservation, AI binding,
 * settled provider usage and reconciliation holds.
 */
export async function classifyWithCentralGemma(source, ports){
  const input=preparePublicClassification(source);
  if(!requirePorts(ports))return stop('TRUSTED_PORTS_NOT_CONFIGURED');
  const controls=await ports.getControls();
  if(!exact(controls,['globalPaused','aiEnabled','sourceEnabled'])||
    controls.globalPaused!==false||controls.aiEnabled!==true||controls.sourceEnabled!==true)
    return stop('CENTRAL_AI_DISABLED');
  const coverage=await ports.getSpendingCoverage();
  if(!exact(coverage,['verified','accountWide','dailyCapEnforced','projectBudgetEnforced','maxOutputTokens']) ||
    coverage.verified!==true||coverage.accountWide!==true||
    coverage.dailyCapEnforced!==true||coverage.projectBudgetEnforced!==true||
    !Number.isSafeInteger(coverage.maxOutputTokens)||coverage.maxOutputTokens<1||
    coverage.maxOutputTokens>200)
    return stop('ACCOUNT_BUDGET_NOT_VERIFIED');
  let reservation;
  try{reservation=await ports.reserve({
    eventId:input.eventId,revisionHash:input.revisionHash,model:GEMMA_MODEL,
    inputChars:input.text.length,maxOutputTokens:coverage.maxOutputTokens
  });}
  catch{return stop('DURABLE_BUDGET_UNAVAILABLE');}
  if(!exact(reservation,['id','status'])||!UUID.test(reservation.id)||
    reservation.status!=='AUTHORIZED')
    return stop('RESERVATION_UNVERIFIED_OR_DUPLICATE');
  let outcome;
  const classificationPrompt='Return ONLY a JSON object with keys club, sport, confidence, evidence. '+
    'club must be GAS, MERGED, OTHER, or REVIEW. GAS is exclusively G.A.S. Archelaos Katerinis; '+
    'MERGED includes S.F.K. Pierikos Archelaos basketball. Never attribute achievements of other clubs. '+
    'sport must be handball, athletics, gymnastics, archery, shooting, wrestling, volleyball, '+
    'swimming, finswimming, weightlifting, or unknown. evidence MUST be an EXACT short substring '+
    'of the supplied article. No new facts. Never publish. Article: '+input.text;
  try {
    outcome=await ports.invoke(GEMMA_MODEL,{
      messages:[{role:'user',content:classificationPrompt}],
      max_tokens:coverage.maxOutputTokens,temperature:0,response_format:{type:'json_object'},
      enable_thinking:false
    },reservation.id);
  }catch{
    try{await ports.hold(reservation.id,'PROVIDER_OUTCOME_UNCERTAIN');}catch{}
    return {status:'GEMMA_RECONCILIATION_REQUIRED',modelCalls:'UNKNOWN',published:false};
  }
  if(!exact(outcome,['raw','providerUsageVerified','chargedMicroEur']) ||
    outcome.providerUsageVerified!==true||
    !Number.isSafeInteger(outcome.chargedMicroEur)||outcome.chargedMicroEur<0){
    try{await ports.hold(reservation.id,'PROVIDER_USAGE_UNVERIFIED');}catch{}
    return {status:'GEMMA_RECONCILIATION_REQUIRED',modelCalls:1,published:false};
  }
  let decoded;
  try{decoded=decodeGemmaClassification(outcome.raw,input);}
  catch{decoded=null;}
  try{await ports.settle(reservation.id,outcome.chargedMicroEur);}
  catch{
    try{await ports.hold(reservation.id,'SETTLEMENT_UNKNOWN');}catch{}
    return {status:'GEMMA_RECONCILIATION_REQUIRED',modelCalls:1,published:false};
  }
  if(!decoded)return {status:'GEMMA_INVALID_OUTPUT_REVIEW',modelCalls:1,published:false};
  return {status:'GEMMA_RESULT_PRIVATE_REVIEW',result:decoded,modelCalls:1,published:false};
}
