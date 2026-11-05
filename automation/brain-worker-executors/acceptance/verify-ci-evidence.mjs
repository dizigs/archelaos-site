/** No-write, no-provider-cost independent live CI attestation. */
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
export const REQUIRED=Object.freeze({
  'rebuild-check.yml':['HTML, data and JavaScript integrity','Chromium desktop and mobile','Assemble and validate future Cloudflare release'],
  'axe-accessibility.yml':['axe'],
  'lighthouse-ci.yml':['Lighthouse CI mobile audit'],
  'eslint-guard.yml':['ESLint JavaScript quality'],
  'codeql-security.yml':['CodeQL (javascript-typescript)','CodeQL (python)'],
  'javascript-syntax-guard.yml':['JavaScript syntax (all site scripts)'],
  'release-qa.yml':['Validate production build'],
  'validate-site.yml':['verify']
});
const REPO='dizigs/archelaos-site',SHA=/^[0-9a-f]{40}$/;
export function evaluateCi({sha,branch,runs,checks,jobsByRun,rulesets}){
  if(!SHA.test(sha||'')||!branch||!Array.isArray(runs)||
     !Array.isArray(checks)||!Array.isArray(rulesets))throw Error('INVALID_CI_INPUTS');
  const matrix=[],add=(scope,name,result,reason)=>matrix.push({scope,name,result,reason});
  for(const [name,required] of Object.entries(REQUIRED)){
    const path='.github/workflows/'+name;
    const matching=runs.filter(r=>r?.path===path&&r?.head_sha===sha)
      .sort((a,b)=>b.id-a.id);
    const r=matching[0];
    if(!r){add('workflow',name,'FAIL','MISSING_EXACT_SHA');continue;}
    if(!Number.isSafeInteger(r.id)||r.repository?.full_name!==REPO||
      r.head_repository?.full_name!==REPO||r.head_branch!==branch||
      !['pull_request','push','workflow_dispatch'].includes(r.event)||
      !Number.isSafeInteger(r.run_attempt)||r.run_attempt<1){
      add('workflow',name,'FAIL','INVALID_RUN_PROVENANCE');continue;
    }
    if(r.status!=='completed'||r.conclusion!=='success'){
      add('workflow',name,'FAIL','NOT_SUCCESS_'+r.status+'/'+r.conclusion);continue;
    }
    const jobs=jobsByRun?.[String(r.id)];
    if(!Array.isArray(jobs)||!jobs.length){
      add('workflow',name,'FAIL','REQUIRED_JOB_OR_ATTEMPT_MISMATCH');continue;
    }
    // Production deployment intentionally cannot run on workflow_dispatch.
    // Record that one non-required job as inapplicable, not successful.
    const notApplicable=jobs.filter(j=>name==='rebuild-check.yml' &&
      r.event==='workflow_dispatch' && j?.name==='verify-production-deployment' &&
      j.status==='completed' && j.conclusion==='skipped');
    const applicable=jobs.filter(j=>!notApplicable.includes(j));
    if(notApplicable.length>1||!applicable.length||
       jobs.some(j=>j?.run_id!==r.id||j.run_attempt!==r.run_attempt||
         !Number.isSafeInteger(j.id))||
       applicable.some(j=>j.status!=='completed'||j.conclusion!=='success')||
       required.some(n=>applicable.filter(j=>j.name===n).length!==1)){
      add('workflow',name,'FAIL','REQUIRED_JOB_OR_ATTEMPT_MISMATCH');continue;
    }
    add('workflow',name,'PASS','run '+r.id+', attempt '+r.run_attempt+
      (notApplicable.length?' (production-only job NOT APPLICABLE)':''));
  }
  const mandated=new Map([['SonarCloud Code Analysis','sonarqubecloud'],
    ['CodeQL','github-advanced-security']]);
  for(const rs of rulesets){
    if(rs?.enforcement!=='active')continue;
    for(const rule of rs.rules||[]){
      if(rule.type==='required_status_checks')
        for(const req of rule.parameters?.required_status_checks||[])
          if(req.context)mandated.set(req.context,null);
    }
  }
  for(const [name,app] of mandated){
    const list=checks.filter(c=>c?.name===name&&c?.head_sha===sha&&
      (!app||c.app?.slug===app)).sort((a,b)=>b.id-a.id);
    const c=list[0];
    if(!c){add('check',name,'FAIL','MISSING_EXACT_SHA');continue;}
    if(c.status!=='completed'||c.conclusion!=='success'){
      add('check',name,'FAIL','NOT_SUCCESS_'+c.status+'/'+c.conclusion);continue;
    }
    add('check',name,'PASS','check '+c.id);
  }
  return {passed:matrix.length>0&&matrix.every(x=>x.result==='PASS'),
    pass:matrix.filter(x=>x.result==='PASS').length,
    fail:matrix.filter(x=>x.result==='FAIL').length,matrix};
}
/**
 * Retry only concurrently running checks. Missing workflow evidence and any
 * terminal neutral/skipped/failure always remain FAIL after every snapshot.
 */
export function hasTransientCiEvidence(report,dispatched=false){
  return report.matrix.some(row => row.result==='FAIL' && (
    (row.scope==='check' && row.reason==='MISSING_EXACT_SHA') ||
    (dispatched && row.scope==='workflow' && row.reason==='MISSING_EXACT_SHA' &&
      ['rebuild-check.yml','axe-accessibility.yml'].includes(row.name)) ||
    /^NOT_SUCCESS_(queued|in_progress|requested|waiting|pending)\//.test(row.reason)
  ));
}
async function main(){
  const token=process.env.GITHUB_TOKEN,sha=process.env.ACCEPTANCE_SHA,
    branch=process.env.ACCEPTANCE_BRANCH;
  if(!token||!SHA.test(sha||'')||!branch)throw Error('Missing CI token/SHA/branch');
  const base='https://api.github.com/repos/'+REPO;
  async function get(path){
    const r=await fetch(base+path,{method:'GET',redirect:'error',
      headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,
      'X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(12000)});
    if(!r.ok)throw Error('Read-only GitHub evidence unavailable: '+r.status);
    return r.json();
  }
  async function pages(path,key){
    const result=[];
    for(let n=1;n<=5;n++){
      const body=await get(path+(path.includes('?')?'&':'?')+'per_page=100&page='+n);
      if(!Number.isSafeInteger(body?.total_count)||!Array.isArray(body[key])||
         body[key].length>100)throw Error('UNVERIFIED_PAGINATION');
      result.push(...body[key]);
      if(result.length===body.total_count)return result;
      if(result.length>body.total_count||!body[key].length)throw Error('INCOMPLETE_PAGINATION');
    }
    throw Error('PAGINATION_CAP');
  }
  const ruleIndex=await get('/rulesets');
  if(!Array.isArray(ruleIndex))throw Error('MISSING_RULESET_INVENTORY');
  const rulesets=[];
  for(const r of ruleIndex.filter(x=>x.enforcement==='active'&&x.target==='branch')){
    const full=await get('/rulesets/'+r.id);
    if(full.id!==r.id||full.enforcement!=='active')throw Error('RULESET_CHANGED');
    rulesets.push(full);
  }
  async function snapshot(){
    const [runs,checks]=await Promise.all([
      pages('/actions/runs?head_sha='+sha,'workflow_runs'),
      pages('/commits/'+sha+'/check-runs','check_runs')]);
    const jobsByRun={};
    for(const name of Object.keys(REQUIRED)){
      const r=runs.filter(x=>x.path==='.github/workflows/'+name&&x.head_sha===sha)
        .sort((a,b)=>b.id-a.id)[0];
      if(r?.id)jobsByRun[r.id]=await pages('/actions/runs/'+r.id+'/jobs?filter=latest','jobs');
    }
    return evaluateCi({sha,branch,runs,checks,jobsByRun,rulesets});
  }
  // An accepted workflow_dispatch is NOT evidence of success. Allow a bounded
  // wait for runs/jobs to materialize and finish; on expiry everything stays FAIL.
  const dispatched=process.env.ACCEPTANCE_DISPATCH_RESULT==='success';
  const MAX_ATTEMPTS=dispatched?78:13,POLL_MS=20_000;
  let result,attempts=0;
  do {
    attempts++;
    result=await snapshot();
    if(result.passed||!hasTransientCiEvidence(result,dispatched)||attempts===MAX_ATTEMPTS)break;
    await new Promise(resolve=>setTimeout(resolve,POLL_MS));
  } while(true);

  const rows=['## Independent CI: '+(result.passed?'PASS':'BLOCKED'),'',
    'SHA: `'+sha+'` — '+result.pass+' PASS / '+result.fail+' FAIL',
    'Audit snapshots: '+attempts+' (bounded retries; no gate waivers)',
    'Dispatch result: '+(dispatched?'accepted request only':'not verified'),'',
    '| Gate | Name | Result | Evidence/blocker |','|---|---|---|---|',
    ...result.matrix.map(x=>'| '+x.scope+' | '+x.name+' | '+x.result+' | '+x.reason+' |'),
    '', 'Mock CI is not a live Brain/provider E2E. No paid calls.'];
  const msg=rows.join('\n')+'\n';process.stdout.write(msg);
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,msg);
  if(!result.passed)process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(e=>{console.error('CI_ATTESTATION_BLOCKED: '+e.message);process.exitCode=1;});
