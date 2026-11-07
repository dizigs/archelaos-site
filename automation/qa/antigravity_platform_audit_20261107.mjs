import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const key=process.env.GEMINI_API_KEY;
const sha=process.env.TARGET_MAIN_SHA;
const root=path.join(process.env.RUNNER_TEMP||'/tmp','archelaos-platform-audit');
fs.mkdirSync(root,{recursive:true});
const summary=process.env.GITHUB_STEP_SUMMARY||path.join(root,'summary.md');
const metadata={repository:'dizigs/archelaos-site',project:'full Worker/GAS/site platform',sha,agent:'antigravity-preview-09-2026',
  githubRun:process.env.GITHUB_RUN_URL||null,mode:'ISOLATED_NEW_FULL_GIT_CHECKOUT_NO_DEPLOY',
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
const prompt=["MISSION: ARCHELAOS CLUB — FULL CLOUD WORKERS, GOOGLE APPS SCRIPT, AND PUBLIC SITE DEADLINE AUDIT. You are Google Antigravity agent in a fresh isolated Linux sandbox with full public Git repository at /workspace/archelaos-site. Need REAL code-level audit and minimal tested fixes, not merely a planning document.","PIN HEAD: git fetch origin main; git checkout --detach d39bf3ca00efba80d92f13b951ed4e22e7a4d58e; git rev-parse HEAD must match EXACT. If can't pin, stop safely with BLOCKED. FIRST inspect the repository. Do not open unrelated private credentials. Repository source only. Write /workspace/platform-progress.md with first concrete findings within 15 tool actions.","VERIFIED LIVE CLOUDFLARE INVENTORY (read-only API observation 2026-11-07, account belonging to user's personal login): nine deployed Workers: archelaos-automation-bridge, archelaos-brain-staging, archelaos-fundraising-preview, archelaos-gitlab-controller, archelaos-gitlab-guardian, archelaos-librarian-staging, archelaos-raisely-bridge, archelaos-self-heal, archelaos-workflow-pilot. Do NOT assume other deployed workers, or pretend you can access Cloudflare credentials. Audit all their repository code and configuration where available; explicitly label missing/unmapped deployed source.","REPO CONFIG INVENTORY confirmed on current main: automation/analytics-worker/wrangler.jsonc; automation/google-ads-worker/wrangler.jsonc; automation/self-heal-worker/wrangler.toml; brain/wrangler.toml. Identify additional Worker code and integrations through code references, GitHub workflows and registration. Map each of 9 deployed Workers to actual source path, deployment/CI provenance, public exposure, bindings, secrets by NAME ONLY (never values), logs/alerts, cost and current activation switch. If source not in repository, BLOCK that row rather than fabricate.","GOOGLE APPS SCRIPT: Audit ALL repository GAS code, incl automation/apps-script/templates/ArchelaosTriggerInventory.gs and tools/museum-approved-review.gs, associated bridge/Apps Script triggers and workflow contracts. The connected admin Google Drive search returned 0 standalone script-project records; therefore external live Apps Script projects (user estimates ~20-30) ARE NOT accessible in this sandbox. Do not pretend to audit their unmounted source. Produce an explicit evidence-backed 'GAS_PROJECTS_MISSING_SOURCE' inventory and safe onboarding method via existing GAS API/OAuth bridge; do not ask for API keys nor deploy Apps Script remotely.","CANONICAL AUDIT LOG: one private LIVE Google Sheet; treat private logs as external inaccessible, and include journal correlation identifiers WITHOUT placing private Sheet data in GitHub. Issue #71 is the public-safe handoff. Avoid redundant schedules, duplicated events, missing receipts and worker/API costs.","ARCHITECTURE: Brain orchestrates, not a universal master with excess privileges. Audit HMAC/replay, Durable Objects SQLite, queues/crons, strict OFF safety switches, ACK persistence, idempotency, retry limits, locked events, logging and budget ≤20 EUR/month AI. Confirm existing permanent production Brain/Self-Heal recovery/dispatch flags remain OFF; no automatic activation.","PUBLIC SITE DEADLINE: identify actual high-priority user-visible issues (mobile navigation, Hall of Fame People popups, News/Stories/70 moments IDs/tags and source attribution, historical medal IDs ledger, image integrity, consent, responsive and WCAG). Make specific safe repair patches only for issues reproduced by static tests or actual evidence. Do NOT invent biographies, medals, photos, sources, or production deployments. Protect unique event/person/photo/achievement IDs. Avoid touching data records without evidence. Deliver prioritized P0/P1/P2 deadline plan with estimated effort as RELATIVE sequence, no false dates.","MANDATORY DELIVERABLES: /workspace/platform-progress.md first; /workspace/antigravity-report.md final Greek report including each of nine Workers, GAS source coverage/missing external sources, site P0 list, merge/deploy exact-head gates; /workspace/antigravity-hmac.patch containing ONLY minimal safe changes for reviewed code or site, with changed-file list and test evidence. If no safe changes warranted, make a clearly empty patch and explain. Include exact test commands, before/after observed outcomes, and QA blindspots. Save files early and keep them current.","TESTS: run practical static and contract tests for touched paths (node --check, ESLint where configured, node --test, npm test for brain, relevant Python checks). Do not blindly run the entire huge suite repeatedly; focus on evidence. CRITICAL: pass only genuinely verified tests; report NOT_RUN when appropriate.","HARD LIMITS: NO push/merge/PR/deployment, no Cloudflare or Google API writes, no keys or live secrets, no turning OFF gates ON, no external routes, no code signing bypass. Work only in Google isolated sandbox. User authorized ChatGPT to merge reviewed passing PRs separately; you DO NOT take that action. Stop on failed security tests. Make final substantive Greek report within limited tool budget (~50 tool calls) rather than looping indefinitely."].join('\n\n');
async function main(){
  if(!key||key.length<16)throw Error('GEMINI_API_KEY secret not configured; no request sent');
  if(!/^[0-9a-f]{40}$/.test(sha))throw Error('Invalid pinned SHA');
  const input={agent:'antigravity-preview-09-2026',input:prompt,
    environment:{type:'remote',sources:[{type:'repository',source:'https://github.com/dizigs/archelaos-site',target:'/workspace/archelaos-site'}]},
    agent_config:{type:'antigravity',max_total_tokens:950000},background:true,store:true};
  const base='https://generativelanguage.googleapis.com/v1beta/interactions';
  note('## Antigravity — full repository local sandbox HMAC repair');
  note('Github live run: '+(process.env.GITHUB_RUN_URL||'N/A'));
  note('Pinned PR #288 source SHA: '+sha);
  note('Repo source: retained existing Google filesystem /workspace/archelaos-site (not recloned).');
  note('STARTING_FRESH_ISOLATED_FULL_REPO_PLATFORM_AUDIT');
  const initial=await api(base,'POST',input);
  if(typeof initial.environment_id !== 'string') throw Error('NEW_REMOTE_ENVIRONMENT_ID_NOT_CONFIRMED');
  if(typeof initial.id!=='string'||!/^[A-Za-z0-9_-]{5,160}$/.test(initial.id))throw Error('Interaction returned no valid ID');
  metadata.interactionId=initial.id;
  if(typeof initial.environment_id==='string')metadata.environmentId=initial.environment_id;
  metadata.startedAt=new Date().toISOString();metadata.status=initial.status;
  write();
  note('INTERACTION_ID '+initial.id);
  note('CREATED_STATUS '+initial.status);
  const pending=new Set(['in_progress','queued','pending','running','created']);
  let result=initial,polls=0,errors=0;
  const deadline=Date.now()+85*60*1000;
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
