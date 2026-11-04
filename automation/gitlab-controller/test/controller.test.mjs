import test from 'node:test';
import assert from 'node:assert/strict';
import controller,{constantTimeEqual, validateIssue, submitIssue} from '../src/index.mjs';
const fixed={category:'audit',title:'Review mirror sync',description:'The mirror is delayed by 150 minutes.',ticketId:'MIRROR-20261104-0001'};
const KEY='k'.repeat(64);
const u='https://archelaos-gitlab-controller.workers.dev/issues';
const dummy=new Request(u,{method:'POST',headers:{authorization:`Bearer ${KEY}`,'content-type':'application/json'},body:JSON.stringify(fixed)});

test('constant-time comparison rejects missing and short values',()=>{
  assert.equal(constantTimeEqual(KEY,KEY),true);
  assert.equal(constantTimeEqual(KEY,KEY+'a'),false);
  assert.equal(constantTimeEqual(KEY,undefined),false);
  assert.equal(constantTimeEqual('', ''),false);
});
test('input uses only fixed categories and confidential flag',()=>{
  const x=validateIssue(fixed);
  assert.equal(x.title,'[ARC AUDIT] Review mirror sync');
  assert.equal(x.confidential,true);
  assert.match(x.description,/ARC-CTRL:MIRROR-20261104-0001/);
});
test('rejects arbitrary fields, categories and slash quick actions',()=>{
  assert.throws(()=>validateIssue({...fixed,operation:'merge'}),/INVALID/);
  assert.throws(()=>validateIssue({...fixed,category:'delete'}),/INVALID/);
  assert.throws(()=>validateIssue({...fixed,description:'hello\n/merge now'}),/INVALID/);
});
test('rejects control characters and malformed ticket identifiers',()=>{
  assert.throws(()=>validateIssue({...fixed,title:'test\ninjection'}),/INVALID/);
  assert.throws(()=>validateIssue({...fixed,ticketId:'x'}),/INVALID/);
});
test('public /health returns 200 with no private data',async()=>{
  const r=await controller.fetch(new Request(u.replace('/issues','/health')),{GITLAB_CONTROLLER_TOKEN:'no-leak'});
  assert.equal(r.status,200);
  assert.doesNotMatch(await r.text(),/no-leak/);
});
test('unauthorized POST denies without a configured command key',async()=>{
  assert.equal((await controller.fetch(dummy,{})).status,404);
});
test('bad key is denied even with GitLab token present',async()=>{
  assert.equal((await controller.fetch(dummy,{CONTROLLER_COMMAND_KEY:'r'.repeat(64),GITLAB_CONTROLLER_TOKEN:'private'})).status,404);
});
test('authorized POST fails closed when GitLab token is absent',async()=>{
  const r=await controller.fetch(dummy,{CONTROLLER_COMMAND_KEY:KEY});
  assert.equal(r.status,503); assert.deepEqual(await r.json(),{status:'not_configured'});
});
test('all non-allowlisted routes and HTTP methods are denied',async()=>{
  assert.equal((await controller.fetch(new Request(u,{method:'GET'}),{})).status,404);
  assert.equal((await controller.fetch(new Request(u.replace('/issues','/merge'),{method:'POST'}),{})).status,404);
});
test('duplicate found: only GET, no new issue',async()=>{
  const seen=[];
  const f=async(url,opt)=>{seen.push([url,opt.method]);return new Response(JSON.stringify([{iid:1,description:'Controller reference: ARC-CTRL:MIRROR-20261104-0001',web_url:'https://gitlab.com/p/1'}]),{status:200});};
  const r=await submitIssue(fixed,{GITLAB_CONTROLLER_TOKEN:'token'},f);
  assert.deepEqual(r,{status:'exists',iid:1,url:'https://gitlab.com/p/1'});
  assert.equal(seen.length,1); assert.equal(seen[0][1],'GET');
});
test('new issue: GET search followed by restricted POST',async()=>{
  const calls=[];
  const f=async(url,opt)=>{calls.push({url,method:opt.method,body:opt.body,headers:opt.headers});
    const x=opt.method==='GET'?[]:{iid:2,web_url:'https://gitlab.com/p/2',confidential:true};
    return new Response(JSON.stringify(x),{status:opt.method==='POST'?201:200});};
  const result=await submitIssue(fixed,{GITLAB_CONTROLLER_TOKEN:'token'},f);
  assert.deepEqual(result,{status:'created',iid:2,url:'https://gitlab.com/p/2'});
  assert.deepEqual(calls.map(x=>x.method),['GET','POST']);
  assert.ok(calls.every(x=>x.url.startsWith('https://gitlab.com/api/v4/projects/88488684/issues')));
  assert.equal(JSON.parse(calls[1].body).confidential,true);
  assert.equal(calls[1].headers['PRIVATE-TOKEN'],'token');
});
test('API error is not returned to the caller',async()=>{
  const f=async()=>new Response('private token error',{status:403});
  await assert.rejects(submitIssue(fixed,{GITLAB_CONTROLLER_TOKEN:'token'},f),/UPSTREAM_HTTP_STATUS/);
});
test('nonconfidential response is treated as schema failure',async()=>{
  const f=async(_u,o)=>new Response(JSON.stringify(o.method==='GET'?[]:{iid:2,web_url:'https://gitlab.com/p/2',confidential:false}));
  await assert.rejects(submitIssue(fixed,{GITLAB_CONTROLLER_TOKEN:'token'},f),/UPSTREAM_SCHEMA/);
});
test('content-type enforced and excessive body rejected',async()=>{
  const wrong=new Request(u,{method:'POST',headers:{authorization:`Bearer ${KEY}`,'content-type':'text/plain'},body:'abc'});
  assert.equal((await controller.fetch(wrong,{CONTROLLER_COMMAND_KEY:KEY,GITLAB_CONTROLLER_TOKEN:'token'})).status,400);
  const huge=new Request(u,{method:'POST',headers:{authorization:`Bearer ${KEY}`,'content-type':'application/json'},body:'A'.repeat(6000)});
  assert.ok([400,413].includes((await controller.fetch(huge,{CONTROLLER_COMMAND_KEY:KEY,GITLAB_CONTROLLER_TOKEN:'token'})).status));
});
