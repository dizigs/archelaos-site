import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import runner from '../qa/private_hmac_operator_runner.mjs';

const CAP='synthetic-operator-capability-'.repeat(3);
const sha='f'.repeat(40),digest='a'.repeat(64),session=randomUUID();
const proof={status:'KEY_POSSESSION_CONFIRMED',sourceSha:sha,sessionId:session,
  challengeDigest:digest,actionsExecuted:0};
function request(header=CAP,url='http://127.0.0.1:8799/__local_private_hmac_qa',method='POST'){
  return new Request(url,{method,headers:{'x-operator-capability':header}});
}
const config=readFileSync(new URL('../qa/wrangler.operator-local.toml',import.meta.url),'utf8');
test('local runner can bind only remote named Brain QA port, never a public host or repair port',()=>{
  assert.match(config,/^ip = "127\.0\.0\.1"$/m);
  assert.match(config,/^port = 8799$/m);
  assert.match(config,/^workers_dev = false$/m);
  assert.match(config,/^preview_urls = false$/m);
  assert.match(config,/^binding = "BRAIN_QA"\nservice = "archelaos-brain-staging"\nentrypoint = "BrainHmacAcceptancePort"\nremote = true$/m);
  assert.doesNotMatch(config,/BRAIN_RECOVERY|HEALER_MEMORY|route\s*=|crons\s*=/);
});
test('one authorized localhost request returns ONLY redacted proof without any HMAC key',async()=>{
  let calls=0;
  const env={OPERATOR_CAPABILITY:CAP,BRAIN_QA:{async runChallenge(){calls++;return proof}}};
  const r=await runner.fetch(request(),env);
  assert.equal(r.status,200);
  assert.deepEqual(await r.json(),proof);
  assert.equal(calls,1);
  assert.equal(JSON.stringify(proof).includes(CAP),false);
});
test('native RPC proof accepts only a nonenumerable Symbol.dispose lifetime method',async()=>{
  const value={...proof};
  Object.defineProperty(value,Symbol.dispose,{value(){},enumerable:false});
  assert.equal(Reflect.ownKeys(value).length,6);
  const accepted=await runner.fetch(request(),{OPERATOR_CAPABILITY:CAP,BRAIN_QA:{async runChallenge(){return value}}});
  assert.equal(accepted.status,200);
  assert.deepEqual(await accepted.json(),proof);
  const malicious=[
    Object.assign({...value},{extra:'not-allowed'}),
    Object.defineProperty({...proof},Symbol('unapproved'),{value(){},enumerable:false}),
    Object.defineProperty({...proof},Symbol.dispose,{value(){},enumerable:true}),
  ];
  for(const result of malicious){
    const denied=await runner.fetch(request(),{OPERATOR_CAPABILITY:CAP,BRAIN_QA:{async runChallenge(){return result}}});
    assert.equal(denied.status,200);
    assert.deepEqual(await denied.json(),{status:'UNKNOWN',actionsExecuted:0});
  }
});
test('native RPC proof releases accepted Symbol.dispose lifecycle metadata',async()=>{
  let released=0;
  const value={...proof};
  Object.defineProperty(value,Symbol.dispose,{value(){released++},enumerable:false});
  const result=await runner.fetch(request(),{OPERATOR_CAPABILITY:CAP,BRAIN_QA:{async runChallenge(){return value}}});
  assert.deepEqual(await result.json(),proof);
  assert.equal(released,1);
});
test('hostile property getters and exotic own properties are rejected without execution',async()=>{
  let getterCalls=0;
  for(const mutate of [
    p=>Object.defineProperty(p,'status',{get(){getterCalls++;return 'KEY_POSSESSION_CONFIRMED'}}),
    p=>Object.defineProperty(p,'challengeDigest',{get(){getterCalls++;return digest}}),
    p=>Object.defineProperty(p,Symbol.dispose,{get(){getterCalls++;return ()=>{}}}),
    p=>Object.defineProperty(p,'surprise',{value:true}),
    p=>Object.setPrototypeOf(p,{unsafe:true})
  ]){
    const result={...proof};mutate(result);
    const response=await runner.fetch(request(),{OPERATOR_CAPABILITY:CAP,BRAIN_QA:{async runChallenge(){return result}}});
    assert.deepEqual(await response.json(),{status:'UNKNOWN',actionsExecuted:0});
  }
  assert.equal(getterCalls,0);
});
test('diagnostic status preserves only safe code values without invoking accessors',async()=>{
  let getterCalls=0;
  const safe={status:'UNKNOWN',actionsExecuted:0,code:'QA_DIAG_UNVERIFIED'};
  const ok=await runner.fetch(request(),{OPERATOR_CAPABILITY:CAP,BRAIN_QA:{async runChallenge(){return safe}}});
  assert.deepEqual(await ok.json(),safe);
  const hostile={status:'UNKNOWN'};
  Object.defineProperty(hostile,'code',{get(){getterCalls++;throw Error('getter must not run')}});
  const denied=await runner.fetch(request(),{OPERATOR_CAPABILITY:CAP,BRAIN_QA:{async runChallenge(){return hostile}}});
  assert.deepEqual(await denied.json(),{status:'UNKNOWN',actionsExecuted:0});
  assert.equal(getterCalls,0);
});
test('loopback, method, exact path and private per-run operator capability are mandatory',async()=>{
  let calls=0;const env={OPERATOR_CAPABILITY:CAP,BRAIN_QA:{async runChallenge(){calls++;return proof}}};
  for(const r of [
    request('wrong'),request(''),request(CAP,'http://localhost:8799/__local_private_hmac_qa'),
    request(CAP,'https://public.invalid:8799/__local_private_hmac_qa'),
    request(CAP,'http://127.0.0.1:8799/__local_private_hmac_qa?extra=1'),
    request(CAP,'http://127.0.0.1:8799/'),request(CAP,'http://127.0.0.1:8799/__local_private_hmac_qa','GET'),
  ]){
    const response=await runner.fetch(r,env);assert.equal(response.status,404);
  }
  assert.equal(calls,0);
});
test('missing/malformed/hostile remote results never authorize repair or leak internals',async()=>{
  for(const outcome of [
    null,{}, {status:'UNKNOWN',actionsExecuted:0}, {...proof,actionsExecuted:1},
    {...proof,secret:'dont-expose'}, {...proof,challengeDigest:'malformed'},
  ]) {
    const r=await runner.fetch(request(),{OPERATOR_CAPABILITY:CAP,BRAIN_QA:{async runChallenge(){return outcome}}});
    assert.deepEqual(await r.json(),{status:'UNKNOWN',actionsExecuted:0});
  }
  const r=await runner.fetch(request(),{OPERATOR_CAPABILITY:CAP,BRAIN_QA:{async runChallenge(){throw Error('redacted')}}});
  assert.deepEqual(await r.json(),{status:'UNKNOWN',actionsExecuted:0});
});
