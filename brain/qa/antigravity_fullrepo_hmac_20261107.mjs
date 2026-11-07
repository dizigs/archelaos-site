import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const key=process.env.GEMINI_API_KEY;
const sha=process.env.TARGET_PR_SHA;
const root=path.join(process.env.RUNNER_TEMP||'/tmp','archelaos-antigravity');
fs.mkdirSync(root,{recursive:true});
const summary=process.env.GITHUB_STEP_SUMMARY||path.join(root,'summary.md');
const metadata={repository:'dizigs/archelaos-site',pr:288,sha,agent:'antigravity-preview-09-2026',
  githubRun:process.env.GITHUB_RUN_URL||null,mode:'REUSE_RETAINED_GOOGLE_ENVIRONMENT_NO_RECLONE',
  noGitHubWrite:true,noCloudflareWrite:true,noProductionDeploy:true,sourcePinned:true};
function write(){fs.writeFileSync(path.join(root,'interaction.json'),JSON.stringify(metadata,null,2)+'\n');}
function note(s){console.log(s);fs.appendFileSync(summary,s+'\n');}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function report(result){
  const texts=[];
  if(typeof result.output_text==='string')texts.push(result.output_text);
  if(typeof result.output==='string')texts.push(result.output);
  if(Array.isArray(result.output))for(const x of result.output){
    if(typeof x.text==='string')texts.push(x.text);
    if(Array.isArray(x.content))for(const y of x.content)if(typeof y.text==='string')texts.push(y.text);
  }
  for(const s of (result.steps||[]))if(s.type==='model_output'){
    if(typeof s.text==='string')texts.push(s.text);
    if(typeof s.content==='string')texts.push(s.content);
    if(Array.isArray(s.content))for(const y of s.content)if(typeof y.text==='string')texts.push(y.text);
  }
  return [...new Set(texts.filter(Boolean))].join('\n\n');
}
async function api(url,method='GET',body){
  const opts={method,headers:{'x-goog-api-key':key,'Api-Revision':'2026-05-20',
    ...(body?{'Content-Type':'application/json'}:{})},redirect:'error',
    signal:AbortSignal.timeout(method==='POST'?75000:50000)};
  if(body)opts.body=JSON.stringify(body);
  const r=await fetch(url,opts);
  const o=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error('ANTIGRAVITY_API_HTTP_'+r.status+' '+JSON.stringify(o.error||{}).slice(0,450));
  return o;
}
async function download(envId,file){
  if(!/^[a-zA-Z0-9_-]{5,128}$/.test(envId))throw new Error('INVALID_ENVIRONMENT_ID');
  const url='https://generativelanguage.googleapis.com/v1beta/environments/'+encodeURIComponent(envId)+
     '/files/workspace/'+encodeURIComponent(file)+'?alt=media';
  const r=await fetch(url,{headers:{'x-goog-api-key':key},redirect:'follow',signal:AbortSignal.timeout(120000)});
  if(!r.ok){note('FILE_READBACK '+file+' HTTP_'+r.status);return false;}
  const data=Buffer.from(await r.arrayBuffer());
  if(data.byteLength>1000000)throw new Error('FILE_TOO_LARGE_'+file);
  fs.writeFileSync(path.join(root,file),data);
  note('FILE_READBACK '+file+' SIZE '+data.byteLength+' SHA256 '+crypto.createHash('sha256').update(data).digest('hex'));
  return true;
}
const prompt=[
  'CONTINUE the PREVIOUS Antigravity Brain ↔ Self-Heal HMAC investigation in this SAME existing Google workspace; do not restart a broad survey. Previously cancelled interaction v1_ChdLU192YW8zTERxYWV6N0lQLV9LMHNRcxIXS1NfdmFvM0xEcWFlejdJUC1fSzBzUXM performed 241 steps. Read its context when available. An independently recovered 348MB environment snapshot confirmed the complete repository and NO changed relevant tracked code, no patch/report. Do not claim previous code changes.',
  'FIRST 6 TOOL STEPS: inspect /workspace/archelaos-site; report git HEAD, git status, related HMAC source files, and recent errors. REQUIRED immediate visible checkpoint in your reply/tool output: CHECKPOINT_1 (confirmed findings, not speculation). Use the existing repository; do NOT reclone or reset/discard any workspace modifications.',
  'Your exact task: isolate the root cause for LIVE_HMAC_GENERIC_UNKNOWN in real GitHub Cloudflare QA runs 42378268809 and 42378626973; read brain/qa/cloudflare_isolated_acceptance.py, private_hmac_operator_runner.mjs, private_hmac_candidate.mjs, private_hmac_protocol.mjs, tests, wrangler.toml, WorkerEntrypoint and service binding semantics. Two temporary QA Workers were genuinely deployed with valid service bindings; loopback runner got an UNKNOWN HMAC result. Security cleanup succeeded. Avoid redoing whole-project architecture research.',
  'MANDATORY WORK PRODUCT: within first 15 tool calls write /workspace/antigravity-progress.md containing evidence and the exact suspected failing code path. Then implement a minimum local security-preserving fix PLUS a targeted regression test; run it. Create /workspace/antigravity-hmac.patch using git diff --binary after checking only allowed source paths. Then write /workspace/antigravity-report.md with root cause, exact changed files, tests performed, remaining unknowns.',
  'Allowed edits strictly: brain/src/private_hmac_candidate.mjs, brain/src/private_hmac_protocol.mjs, brain/qa/cloudflare_isolated_acceptance.py, brain/qa/private_hmac_operator_runner.mjs, brain/qa/wrangler.operator-local.toml, brain/test/* and automation/self-heal-worker/test/*. Read other public repository files as needed; do not edit outside this scope. No GitHub tokens supplied to you.',
  'Run native offline workerd tests and Python unit tests, syntax/lint; verify failure before/after if possible. Do not claim real Cloudflare HMAC success from offline tests. If still BLOCKED after <=30 tool calls, produce a useful partial Greek report and stop instead of looping through repeated research.',
  'ABSOLUTE RESTRICTIONS: no push, merge, GitHub PR creation, Cloudflare mutation/deployment, key/secret disclosure, public routes, cron, recovery activation or disabling HMAC/replay/security guards. No tool call requiring account credentials. Do not alter production Workers. Final reply must provide substantive Greek root-cause findings and refer to actual files, NEVER merely a plan.'
].join('\n\n');
async function main(){
  if(!key||key.length<16)throw Error('GEMINI_API_KEY secret not configured; no request sent');
  if(!/^[0-9a-f]{40}$/.test(sha))throw Error('Invalid pinned SHA');
  const input={agent:'antigravity-preview-09-2026',input:prompt,
    environment:'5c2c34e172bbf5022b4d155ec9c5d29f',
    previous_interaction_id:'v1_ChdLU192YW8zTERxYWV6N0lQLV9LMHNRcxIXS1NfdmFvM0xEcWFlejdJUC1fSzBzUXM',
    agent_config:{type:'antigravity',max_total_tokens:1200000},background:true,store:true};
  const base='https://generativelanguage.googleapis.com/v1beta/interactions';
  note('## Antigravity — full repository local sandbox HMAC repair');
  note('Github live run: '+(process.env.GITHUB_RUN_URL||'N/A'));
  note('Pinned PR #288 source SHA: '+sha);
  note('Repo source: REAL Git clone /workspace/archelaos-site (not ZIP).');
  let initial;
  try { initial=await api(base,'POST',input); }
  catch(e) {
    if(!/HTTP 400|HTTP 409|HTTP 412|HTTP 422/.test(String(e))) throw e;
    note('CANCELLED_CONTEXT_RESUME_UNSUPPORTED: preserving previous environment, retry once without conversation pointer');
    delete input.previous_interaction_id;
    initial=await api(base,'POST',input);
  }
  if(initial.environment_id !== '5c2c34e172bbf5022b4d155ec9c5d29f') throw Error('RETAINED_ENVIRONMENT_ID_MISMATCH');
  if(typeof initial.id!=='string'||!/^[A-Za-z0-9_-]{5,160}$/.test(initial.id))throw Error('Interaction returned no valid ID');
  metadata.interactionId=initial.id;
  if(typeof initial.environment_id==='string')metadata.environmentId=initial.environment_id;
  metadata.startedAt=new Date().toISOString();metadata.status=initial.status;
  write();
  note('INTERACTION_ID '+initial.id);
  note('CREATED_STATUS '+initial.status);
  const pending=new Set(['in_progress','queued','pending','running','created']);
  let result=initial,polls=0,errors=0;
  const deadline=Date.now()+95*60*1000;
  while(pending.has(String(result.status||'').toLowerCase())&&Date.now()<deadline){
    await wait(25000);
    try{result=await api(base+'/'+encodeURIComponent(initial.id));errors=0;}
    catch(e){
      errors++;note('READBACK_RETRY '+errors+' '+String(e).slice(0,150));
      if(errors>=12)break;continue;
    }
    polls++;
    if(result.environment_id)metadata.environmentId=result.environment_id;
    metadata.status=result.status;metadata.lastReadback=new Date().toISOString();write();
    if(polls===1||polls%4===0||!pending.has(String(result.status||'').toLowerCase()))
      note('POLL '+polls+' STATUS '+result.status+' STEPS '+(Array.isArray(result.steps)?result.steps.length:'UNKNOWN'));
    if(polls%4===0) write();
  }
  metadata.status=result.status||'UNKNOWN';
  metadata.usage=result.usage||null;
  metadata.finishedAt=new Date().toISOString();write();
  note('FINAL_STATUS '+metadata.status);
  note('USAGE '+JSON.stringify(metadata.usage||{}).slice(0,850));
  const text=report(result);
  fs.writeFileSync(path.join(root,'antigravity-output.md'),text);
  note('REPORT_TEXT_LENGTH '+text.length);
  const envId=metadata.environmentId;
  if(envId&&/^[A-Za-z0-9_-]{5,128}$/.test(envId)){
    for(const file of ['antigravity-report.md','antigravity-hmac.patch']){
      try{await download(envId,file);}catch(e){note('DOWNLOAD_PROBLEM '+file+' '+String(e).slice(0,200));}
    }
  }else note('ENVIRONMENT_ID_MISSING: files not downloaded');
  if(text)note('### Last model response\n'+text.slice(0,16000));
  if(metadata.status!=='completed'||!text){
    note('BLOCKED: no verified completed downloadable report; do not create a second interaction automatically.');
    process.exitCode=2;
  }
}
try{await main();}catch(e){metadata.status='BLOCKED';metadata.failure=String(e).slice(0,900);write();note('BLOCKED '+metadata.failure);process.exitCode=1;}
