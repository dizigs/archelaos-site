import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const ID='v1_ChdLU192YW8zTERxYWV6N0lQLV9LMHNRcxIXS1NfdmFvM0xEcWFlejdJUC1fSzBzUXM';
const base='https://generativelanguage.googleapis.com/v1beta/interactions/'+encodeURIComponent(ID);
const key=process.env.GEMINI_API_KEY;
const dir=path.join(process.env.RUNNER_TEMP||'/tmp','antigravity-cancel-evidence');
fs.mkdirSync(dir,{recursive:true});
const summary=process.env.GITHUB_STEP_SUMMARY;
const state={id:ID, githubRunOriginal:42379581016, operation:'ONE_INTERACTION_CANCEL_AND_INSPECT', deletePerformed:false,newInteractionCreated:false};
function save(){fs.writeFileSync(path.join(dir,'evidence.json'),JSON.stringify(state,null,2)+'\n');}
function log(s){console.log(s);if(summary)fs.appendFileSync(summary,s+'\n');}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
async function req(url,method='GET'){
  const r=await fetch(url,{method,headers:{'x-goog-api-key':key,'Api-Revision':'2026-05-20'},
    redirect:'error',signal:AbortSignal.timeout(45000)});
  const obj=await r.json().catch(()=>({}));
  if(!r.ok)throw Error('GOOGLE_API_'+method+'_HTTP_'+r.status+'_'+String(obj.error?.status||'UNKNOWN'));
  return obj;
}
function minimal(o){
  const steps=Array.isArray(o.steps)?o.steps:[];
  return {status:o.status||'UNKNOWN',environmentId:o.environment_id||o.environment?.id||null,
    updated:o.updated||null,created:o.created||null,
    stepsTotal:steps.length,stepTypeCounts:Object.fromEntries([...new Set(steps.map(s=>s.type||'unknown'))].sort().map(t=>[t,steps.filter(s=>(s.type||'unknown')===t).length])),
    modelOutputs:steps.filter(s=>s.type==='model_output').length,
    functionCalls:steps.filter(s=>/tool|function|shell|command|terminal/.test(s.type||'')).length,
    usage:o.usage&&typeof o.usage==='object'?{total_tokens:o.usage.total_tokens||null}:null,
    outputBlocks:Array.isArray(o.output)?o.output.length:(typeof o.output_text==='string'?(o.output_text.length?1:0):0)
  };
}
async function download(envId,file){
  if(!/^[A-Za-z0-9_-]{5,128}$/.test(envId))return {status:'INVALID_ENVIRONMENT_ID'};
  const url='https://generativelanguage.googleapis.com/v1beta/environments/'+encodeURIComponent(envId)+
    '/files/workspace/'+encodeURIComponent(file)+'?alt=media';
  try{
    const r=await fetch(url,{headers:{'x-goog-api-key':key},redirect:'follow',signal:AbortSignal.timeout(35000)});
    if(!r.ok)return {status:'HTTP_'+r.status};
    const body=Buffer.from(await r.arrayBuffer());
    if(body.length>1000000)return {status:'OVERSIZED'};
    const t=body.toString('utf8');
    if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:sk-proj-|github_pat_|ghp_|gho_|AIza[0-9A-Za-z_-]{15,})/i.test(t))
      return {status:'BLOCKED_POSSIBLE_CREDENTIAL'};
    fs.writeFileSync(path.join(dir,file),body);
    return {status:'DOWNLOADED',bytes:body.length,sha256:crypto.createHash('sha256').update(body).digest('hex')};
  }catch(e){return {status:'TRANSPORT_ERROR'};}
}
try{
  if(!key||key.length<16)throw Error('NO_GEMINI_API_KEY_CONFIGURED');
  log('Inspection and cancellation of EXACT interaction ID (no new agent): '+ID);
  const before=await req(base);
  if(before.id!==ID)throw Error('INTERACTION_ID_MISMATCH');
  state.before=minimal(before);state.beforeRetrievedAt=new Date().toISOString();
  log('BEFORE_STATUS '+state.before.status+' STEPS '+state.before.stepsTotal+' MODEL_OUTPUTS '+state.before.modelOutputs);
  if(['in_progress','queued','pending','running','created'].includes(String(before.status||'').toLowerCase())){
    state.cancelRequestedAt=new Date().toISOString();
    try{
      const x=await req(base+'/cancel','POST');
      state.cancelResponseStatus=x.status||'UNKNOWN';
      log('CANCEL_RESPONSE_STATUS '+state.cancelResponseStatus);
    }catch(e){state.cancelError=String(e).slice(0,220);log('CANCEL_REQUEST_ERROR '+state.cancelError);}
  }else log('CANCEL_SKIPPED_TERMINAL_STATE '+before.status);
  let last=before;
  for(let i=0;i<8;i++){
    await sleep(i===0?1000:3000);
    try{last=await req(base);if(last.id!==ID)throw Error('READBACK_ID_MISMATCH');}
    catch(e){log('READBACK_ERROR_'+i+' '+String(e).slice(0,110));continue;}
    state.after=minimal(last);state.readbackAt=new Date().toISOString();
    log('AFTER_STATUS '+state.after.status+' STEPS '+state.after.stepsTotal+
       ' MODEL_OUTPUTS '+state.after.modelOutputs+' FUNCTION_CALLS '+state.after.functionCalls);
    if(!['in_progress','queued','pending','running','created'].includes(String(last.status||'').toLowerCase()))break;
  }
  if(!state.after)state.after=minimal(last);
  const envId=state.after.environmentId||state.before.environmentId;
  state.environmentIdAvailable=!!envId;
  state.fileReadbacks={};
  if(envId)for(const file of ['antigravity-report.md','antigravity-hmac.patch']){
    state.fileReadbacks[file]=await download(envId,file);
    log('FILE '+file+' '+state.fileReadbacks[file].status+' '+(state.fileReadbacks[file].bytes||0));
  }
  state.stopVerified=state.after.status==='cancelled'||state.after.status==='completed'||state.after.status==='failed';
  state.resumability='NOT_ASSUMED: cancelled interaction cannot be presumed resumable; inspect files first';
  save();
  log('STOP_VERIFIED '+state.stopVerified+' FINAL '+state.after.status);
  if(!state.stopVerified)process.exitCode=2;
}catch(e){state.error=String(e).slice(0,500);save();log('CONTROL_FAILED '+state.error);process.exitCode=1;}
