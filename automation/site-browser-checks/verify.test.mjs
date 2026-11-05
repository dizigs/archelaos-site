import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateChecks, evaluateSnapshot } from './verify.mjs';

const sha='a'.repeat(40);
const checkNames=[
  ['JavaScript syntax (all site scripts)',null],
  ['ESLint JavaScript quality',null],
  ['Validate production build',null],
  ['CodeQL','github-advanced-security'],
  ['SonarCloud Code Analysis','sonarqubecloud']
];
const sampleChecks=()=>checkNames.map(([name,app],i)=>({
  id:i+1,name,head_sha:sha,status:'completed',conclusion:'success',
  app:{slug:app}
}));
const sampleSnapshot=()=>({
  success:true,meta:{status:200,finalUrl:'https://www.archelaos.club/'},
  result:{
    content:'<html lang="el"><header></header><nav></nav><main></main><footer></footer></html>',
    screenshot:'Z'.repeat(200),accessibilityTree:{role:'RootWebArea'}
  }
});
test('exact SHA, signed-source check names and successful terminal statuses pass',()=>{
  assert.equal(evaluateChecks(sampleChecks(),sha).ok,true);
});
test('a pending, failed or wrong SHA check blocks the gate',()=>{
  for(const status of [
    {status:'in_progress',conclusion:null},
    {status:'completed',conclusion:'failure'},
    {status:'completed',conclusion:'neutral'}
  ]) {
    const checks=sampleChecks();Object.assign(checks[0],status);
    assert.equal(evaluateChecks(checks,sha).ok,false);
  }
  const checks=sampleChecks();checks[1].head_sha='b'.repeat(40);
  assert.equal(evaluateChecks(checks,sha).ok,false);
});
test('wrong provider app and missing evidence block the gate',()=>{
  const checks=sampleChecks();checks[3].app.slug='untrusted';
  assert.equal(evaluateChecks(checks,sha).ok,false);
  assert.equal(evaluateChecks([],sha).ok,false);
});
test('mobile and desktop snapshots with rendered DOM and a11y evidence pass',()=>{
  assert.equal(evaluateSnapshot(sampleSnapshot(),390).ok,true);
  assert.equal(evaluateSnapshot(sampleSnapshot(),1440).ok,true);
});
test('missing footer, no screenshot, failed origin or accessibility block',()=>{
  const noFooter=sampleSnapshot();noFooter.result.content=noFooter.result.content.replace('<footer></footer>','');
  assert.equal(evaluateSnapshot(noFooter,390).ok,false);
  const noScreenshot=sampleSnapshot();noScreenshot.result.screenshot='';
  assert.equal(evaluateSnapshot(noScreenshot,390).ok,false);
  const badOrigin=sampleSnapshot();badOrigin.meta.finalUrl='https://malicious.example/';
  assert.equal(evaluateSnapshot(badOrigin,390).ok,false);
  const badA11y=sampleSnapshot();delete badA11y.result.accessibilityTree;
  assert.equal(evaluateSnapshot(badA11y,390).ok,false);
});
