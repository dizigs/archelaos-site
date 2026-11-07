import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const key=process.env.GEMINI_API_KEY;
const sha=process.env.TARGET_PR_SHA;
const root=path.join(process.env.RUNNER_TEMP||'/tmp','archelaos-antigravity');
fs.mkdirSync(root,{recursive:true});
const summary=process.env.GITHUB_STEP_SUMMARY||path.join(root,'summary.md');
const metadata={repository:'dizigs/archelaos-site',pr:288,sha,agent:'antigravity-preview-09-2026',
  githubRun:process.env.GITHUB_RUN_URL||null,mode:'GOOGLE_REMOTE_SANDBOX_FULL_PUBLIC_GIT_REPOSITORY',
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
'MISSION — ARCHELAOS BRAIN ↔ SELF-HEAL, REPAIR THE REAL PRIVATE HMAC STAGING FAILURE USING THE FULL REPOSITORY.',
'You are the actual Google Antigravity agent in a Linux sandbox. FULL Git repository is mounted at /workspace/archelaos-site (not ZIP or excerpts). You have shell, filesystem and test tools. DO NOT delegate to hypothetical agents or merely propose future research.',
'FIRST: cd /workspace/archelaos-site; git fetch origin refs/heads/assistant/selfheal-dormant-private-ports-20261107; git checkout --detach '+sha+'; git rev-parse HEAD MUST equal '+sha+'. If fetch or exact pin fails, STOP with BLOCKED and do not edit code. No other branch or SHA is evidence.',
'Scope: read EVERY relevant tracked file in the repository (architecture, tests, code, actions, implementation, historical contracts, archived advisory docs, PR #288-related changes), follow dependencies and test expectations. Ignore node_modules, binary/media and .git internals. Do not claim to access the user desktop; this is your own isolated full Git working tree.',
'ACTUAL LIVE EVIDENCE, do not misstate: PR #288 earlier failed native GitHub run 42378626973; both temporary Cloudflare scripts archelaos-brain-qa-isolated and archelaos-healer-qa-isolated were deployed and verified, private named bindings passed, the loopback local runner started, unauthorized request returned 404, authorized RPC returned LIVE_HMAC_GENERIC_UNKNOWN; cleanup/revoke/delete of temporary scripts all VERIFIED. No REAL_CLOUDFLARE_HMAC_PASS yet. Earlier run 42378268809 also returned UNKNOWN. Existing permanent workers unchanged with recovery disabled. Offline workerd unit tests passed 165/165 before recent additions. Current SHA may include new isolated stage diagnostic changes. Inspect the REAL source first.',
'Top targets: brain/qa/cloudflare_isolated_acceptance.py; brain/qa/private_hmac_operator_runner.mjs; brain/qa/wrangler.operator-local.toml; brain/src/private_hmac_candidate.mjs; brain/src/private_hmac_protocol.mjs; brain/src/worker.mjs; automation/self-heal-worker/src/worker.mjs; both wrangler.toml; .github/workflows/brain-core.yml; brain/test/ and automation/self-heal-worker/test/ and Issue #71 safety requirements.',
'Find root cause of live UNKNOWN using exact source analysis, native workerd/Miniflare reproductions, real RPC serialization and service-binding semantics, staging timestamps, nonce SQL, WorkerEntrypoint lifecycle, RPC response shape, local runner error filtering. Distinguish proven cause from hypotheses. Be skeptical that rewriting exception handlers alone fixes anything; add failing regression test BEFORE changing code.',
'Implement the minimum SAFE local patch in the sandbox (not just high-level advice). You may edit only brain/src/private_hmac_candidate.mjs, brain/src/private_hmac_protocol.mjs, brain/qa/cloudflare_isolated_acceptance.py, brain/qa/private_hmac_operator_runner.mjs, brain/qa/wrangler.operator-local.toml, brain/test/ files and automation/self-heal-worker/test/ files. Never modify production integration flags, other Workers, permissions, external accounts, GitHub workflows or credentials. If a change outside this scope is required, describe it as BLOCKED with exact rationale instead.',
'Run actual offline commands where applicable: npm ci --prefix brain --ignore-scripts --no-audit --no-fund; npm test --prefix brain; python -m unittest discover -s brain/test -p "*_test.py"; cd brain && node --test --test-concurrency=1 test/selfheal_ack.test.mjs; node --experimental-sqlite --test automation/self-heal-worker/test/*.test.mjs; npm run syntax --prefix brain; wrangler --dry-run if configured. Avoid any Cloudflare/GitHub production mutations. If tests fail, debug and rerun before reporting. Do NOT run the live QA deploy from the sandbox.',
'Security nonnegotiables: no merge, no push, no PR creation, no Cloudflare deployment, no worker script write/delete, no secret/token reads, no HMAC key disclosures, no public routes/cron, no automatic recovery, no bypass of fail-closed checks. The agent has no GitHub or Cloudflare write token by design. Do not disable security gates, change allowlists, overwrite canonical Durable Objects, or downgrade authentication. Never print .env files or private credentials. Do not read workspace or checkout files outside the cloned repository.',
'Output is a HANDOFF, not live certification. After changes execute git diff --check, git status --short, and generate a textual unified patch at /workspace/antigravity-hmac.patch using git diff --binary from only allowed tracked source paths (if new tests are needed, git add -N only those tests, no git commits). Write /workspace/antigravity-report.md as clear Greek report with: actual checkout SHA, exact root cause and source lines, changes made, regression test before/after, commands and outcomes, remaining blockers and offline-vs-live caveat, next manual review steps. If no correct fix can be verified, create report marking BLOCKED and leave patch empty. End with a short nonempty final model reply that references these files.',
'No arbitrary monetary budget was requested; work substantially within your agent budget and use tools to completion rather than returning a plan. A future separate reviewed Cloudflare acceptance run is required to prove real connectivity.'
].join('\n\n');
async function main(){
  if(!key||key.length<16)throw Error('GEMINI_API_KEY secret not configured; no request sent');
  if(!/^[0-9a-f]{40}$/.test(sha))throw Error('Invalid pinned SHA');
  const input={agent:'antigravity-preview-09-2026',input:prompt,
    environment:{type:'remote',sources:[{type:'repository',source:'https://github.com/dizigs/archelaos-site',target:'/workspace/archelaos-site'}]},
    agent_config:{type:'antigravity',max_total_tokens:3000000},background:true,store:true};
  const base='https://generativelanguage.googleapis.com/v1beta/interactions';
  note('## Antigravity — full repository local sandbox HMAC repair');
  note('Github live run: '+(process.env.GITHUB_RUN_URL||'N/A'));
  note('Pinned PR #288 source SHA: '+sha);
  note('Repo source: REAL Git clone /workspace/archelaos-site (not ZIP).');
  const initial=await api(base,'POST',input);
  if(typeof initial.id!=='string'||!/^[A-Za-z0-9_-]{5,160}$/.test(initial.id))throw Error('Interaction returned no valid ID');
  metadata.interactionId=initial.id;
  if(typeof initial.environment_id==='string')metadata.environmentId=initial.environment_id;
  metadata.startedAt=new Date().toISOString();metadata.status=initial.status;
  write();
  note('INTERACTION_ID '+initial.id);
  note('CREATED_STATUS '+initial.status);
  const pending=new Set(['in_progress','queued','pending','running','created']);
  let result=initial,polls=0,errors=0;
  const deadline=Date.now()+220*60*1000;
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
      note('POLL '+polls+' STATUS '+result.status);
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
  if(metadata.status!=='completed'||!fs.existsSync(path.join(root,'antigravity-report.md'))){
    note('BLOCKED: no verified completed downloadable report; do not create a second interaction automatically.');
    process.exitCode=2;
  }
}
try{await main();}catch(e){metadata.status='BLOCKED';metadata.failure=String(e).slice(0,900);write();note('BLOCKED '+metadata.failure);process.exitCode=1;}
