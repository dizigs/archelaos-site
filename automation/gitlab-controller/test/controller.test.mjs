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
  const f=async(url,opt)=>{seen.push([url,opt.method]);return new Response(JSON.stringify([{iid:1,description:'Controller reference: ARC-CTRL:MIRROR-20261104-0001',confidential:true,web_url:'https://gitlab.com/p/1'}]),{status:200});};
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

test('ticket-prefix collision is not an exact existing ticket',async()=>{
  const calls=[];
  const f=async(_url,opt)=>{
    calls.push(opt.method);
    return Response.json(opt.method==='GET'?[{iid:1,description:'Controller reference: ARC-CTRL:'+fixed.ticketId+'0',confidential:true,web_url:'https://gitlab.com/p/1'}]:{iid:2,web_url:'https://gitlab.com/p/2',confidential:true});
  };
  const r=await submitIssue(fixed,{GITLAB_CONTROLLER_TOKEN:'synthetic-token'},f);
  assert.equal(r.status,'created');assert.deepEqual(calls,['GET','POST']);
});
test('carriage-return quick actions cannot bypass the command boundary',()=>{
  assert.throws(()=>validateIssue({...fixed,description:'Ordinary context\r/label ~production'}),/INVALID_REQUEST/);
});
test('an existing public issue cannot be reported as a confidential receipt',async()=>{
  const f=async()=>Response.json([{iid:1,description:'Controller reference: ARC-CTRL:'+fixed.ticketId,confidential:false,web_url:'https://gitlab.com/p/1'}]);
  await assert.rejects(submitIssue(fixed,{GITLAB_CONTROLLER_TOKEN:'synthetic-token'},f),/UPSTREAM_PRIVACY_CONFLICT/);
});

test('controller refuses partial paginated duplicate search without POST', async () => {
  const methods=[];
  const f=async(_url,opt)=>{
    methods.push(opt.method);
    return Response.json([{iid:3,description:'unrelated marker'}], {headers:{'x-next-page':'2'}});
  };
  await assert.rejects(submitIssue(fixed,{GITLAB_CONTROLLER_TOKEN:'synthetic-token'},f), /UPSTREAM_PAGINATION_UNVERIFIED/);
  assert.deepEqual(methods,['GET']);
});

test('controller treats a full search page without pagination metadata as UNKNOWN', async () => {
  const methods=[];
  const f=async(_url,opt)=>{
    methods.push(opt.method);
    return Response.json(Array.from({length:100},(_,i)=>({iid:i+1,description:'unrelated marker'})));
  };
  await assert.rejects(submitIssue(fixed,{GITLAB_CONTROLLER_TOKEN:'synthetic-token'},f), /UPSTREAM_PAGINATION_UNVERIFIED/);
  assert.deepEqual(methods,['GET']);
});


test('oversized upstream stream is cancelled and cannot reach issue creation', async () => {
  const methods=[];
  let cancelled=false;
  const fake=async (_url, options) => {
    methods.push(options.method);
    return new Response(new ReadableStream({
      pull(c) { c.enqueue(new Uint8Array(100_001)); },
      cancel() { cancelled=true; },
    }), {status:200});
  };
  await assert.rejects(submitIssue(fixed,{GITLAB_CONTROLLER_TOKEN:'synthetic-token'},fake), /BODY_TOO_LARGE/);
  assert.deepEqual(methods, ['GET']);
  assert.equal(cancelled,true);
});

test('quick-action boundary rejects CR, LF and Unicode line separators without regex backtracking', () => {
  for (const separator of ['\\r', '\\n', '\\r\\n', '\\u2028', '\\u2029']) {
    const input = JSON.parse('"'+separator+'"');
    assert.throws(() => validateIssue({...fixed,description:'ordinary context'+input+'  /close'}), /INVALID_REQUEST/);
  }
  assert.doesNotThrow(() => validateIssue({...fixed,description:'ordinary context with /slash in middle of line'}));
});

test('bounded long inputs cannot bypass quick-action rejection', () => {
  assert.doesNotThrow(() => validateIssue({...fixed,description:' x'.repeat(1200)}));
  assert.throws(() => validateIssue({...fixed,description:' x'.repeat(1200)+'\\n   /merge'}), /INVALID_REQUEST/);
});
