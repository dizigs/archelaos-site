import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCi,REQUIRED } from './verify-ci-evidence.mjs';
const sha='a'.repeat(40),branch='test/acceptance',repo='dizigs/archelaos-site';
function fixture(){
  const runs=[],jobsByRun={},checks=[];
  let i=0;
  for(const [name,jobNames] of Object.entries(REQUIRED)){
    const id=100+i++;
    runs.push({id,path:'.github/workflows/'+name,head_sha:sha,head_branch:branch,
      event:'pull_request',run_attempt:2,status:'completed',conclusion:'success',
      repository:{full_name:repo},head_repository:{full_name:repo}});
    jobsByRun[id]=jobNames.map((n,k)=>({id:id*10+k,run_id:id,run_attempt:2,
      name:n,status:'completed',conclusion:'success'}));
  }
  for(const [name,app] of [['SonarCloud Code Analysis','sonarqubecloud'],
    ['CodeQL','github-advanced-security'],['ESLint JavaScript quality','github-actions'],
    ['JavaScript syntax (all site scripts)','github-actions']])
    checks.push({id:1000+checks.length,name,head_sha:sha,
      app:{slug:app},status:'completed',conclusion:'success'});
  const rulesets=[{enforcement:'active',rules:[{type:'required_status_checks',
    parameters:{required_status_checks:[{context:'ESLint JavaScript quality'},
      {context:'JavaScript syntax (all site scripts)'}]}}]}];
  return {sha,branch,runs,checks,jobsByRun,rulesets};
}
test('strict synthetic CI sample only passes with every workflow, job, check and SHA',()=>{
  assert.equal(evaluateCi(fixture()).passed,true);
});
test('missing, skipped, failed, pending, wrong SHA and newer failed run block',()=>{
  for(const mode of ['missing','skipped','failed','pending','stale','newer']){
    const f=fixture();
    if(mode==='missing')f.runs.shift();
    if(mode==='skipped')f.runs[0].conclusion='skipped';
    if(mode==='failed')f.runs[0].conclusion='failure';
    if(mode==='pending')f.runs[0].status='in_progress';
    if(mode==='stale')f.runs[0].head_sha='b'.repeat(40);
    if(mode==='newer')f.runs.push({...f.runs[0],id:999,conclusion:'failure'});
    assert.equal(evaluateCi(f).passed,false,mode);
  }
});
test('wrong attempt, lost jobs, foreign repo, wrong branch block',()=>{
  for(const mode of ['attempt','missingjob','foreign','branch']){
    const f=fixture();
    if(mode==='attempt')f.jobsByRun[100][0].run_attempt=1;
    if(mode==='missingjob')f.jobsByRun[100]=[];
    if(mode==='foreign')f.runs[0].head_repository.full_name='foreign/repo';
    if(mode==='branch')f.runs[0].head_branch='different';
    assert.equal(evaluateCi(f).passed,false,mode);
  }
});
test('SonarCloud, CodeQL and newly required main ruleset context block',()=>{
  for(const mode of ['sonar','codeql','newrule','oldcheck']){
    const f=fixture();
    if(mode==='sonar')f.checks[0].conclusion='failure';
    if(mode==='codeql')f.checks[1].status='queued';
    if(mode==='newrule')f.rulesets[0].rules[0].parameters.required_status_checks.push({context:'new-context'});
    if(mode==='oldcheck')f.checks[2].head_sha='b'.repeat(40);
    assert.equal(evaluateCi(f).passed,false,mode);
  }
});
