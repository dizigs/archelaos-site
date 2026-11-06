import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { Miniflare } from 'miniflare';

const SHA='a'.repeat(40);
const GITHUB_KEY='synthetic-github-private-'.repeat(4);
const OPERATOR_KEY='synthetic-operator-private-'.repeat(4);
const STAGING_KEY='synthetic-staging-private-'.repeat(4);
const RECEIPT_KEY='synthetic-capability-receipt-'.repeat(4);
let mf,directory,outboundCalls;

function options(patch={}) {
  return {
    name:'archelaos-brain-selfheal-dispatch-test',modules:true,
    scriptPath:resolve('src/worker.mjs'),compatibilityDate:'2026-07-30',
    durableObjects:{BRAIN:{className:'BrainCoordinator',useSQLite:true}},
    durableObjectsPersist:directory,
    outboundService:async()=>{outboundCalls++;return new Response('BLOCKED',{status:502});},
    bindings:{
      ENVIRONMENT:'staging',DEPLOY_SHA:SHA,
      STAGING_EXPIRES_AT:new Date(Date.now()+30*60_000).toISOString(),
      STAGING_INTAKE_KEY:STAGING_KEY, STAGING_OPERATOR_KEY:OPERATOR_KEY,
      BRAIN_GITHUB_INTAKE_KEY:GITHUB_KEY,BRAIN_CAPABILITY_RECEIPT_KEY:RECEIPT_KEY,
      BRAIN_PRIVATE_EVENT_SOURCES_ENABLED:'true',
      BRAIN_PRIVATE_SERVICE_BINDINGS_VERIFIED:'true',
      ...patch
    }
  };
}
beforeEach(async()=>{
  directory=await mkdtemp(join(tmpdir(),'brain-selfheal-dispatch-'));
  outboundCalls=0;
  mf=new Miniflare(options());
});
afterEach(async()=>{
  await mf.dispose();await rm(directory,{recursive:true,force:true});
  assert.equal(outboundCalls,0);
});
async function send(receiptId,principal='github-v1',bodyPatch,headersPatch={}) {
  const path='/v1/selfheal/dispatch';
  const body=JSON.stringify(bodyPatch||{receiptId});
  const timestamp=String(Math.floor(Date.now()/1000));
  const key=principal==='github-v1'?GITHUB_KEY:
    principal==='operator-v1'?OPERATOR_KEY:STAGING_KEY;
  const signature=createHmac('sha256',key).update(
    ['POST',path,timestamp,body].join('\n')).digest('hex');
  return mf.dispatchFetch('https://brain.test'+path,{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-archelaos-key-id':principal,
      'x-archelaos-timestamp':timestamp,
      'x-archelaos-signature':signature,...headersPatch
    },
    body
  });
}

test('private recovery dispatch rejects unauthenticated and wrong source principals',async()=>{
  const receiptId=randomUUID();
  assert.equal((await send(receiptId,'github-v1',undefined,{
    'x-archelaos-signature':'0'.repeat(64)
  })).status,401);
  assert.equal((await send(receiptId,'operator-v1')).status,403);
  assert.equal((await send(receiptId,'staging-v1')).status,403);
});
test('github source cannot dispatch when OFF, even with a signed request',async()=>{
  const response=await send(randomUUID());
  assert.equal(response.status,423);
  assert.equal((await response.json()).code,'SELFHEAL_DISPATCH_DISABLED');
});
test('with dispatcher enabled, malformed inputs are blocked before canonical DO',async()=>{
  await mf.setOptions(options({BRAIN_SELFHEAL_DISPATCH_ENABLED:'true'}));
  for(const input of [
    {receiptId:'not-uuid'}, {receiptId:randomUUID(),override:true},
    {receiptId:null}, [],{}, {receiptId:'b'.repeat(64)}
  ]) {
    const r=await send(randomUUID(),'github-v1',input);
    assert.equal(r.status,422);
    assert.equal((await r.json()).code,'INVALID_SELFHEAL_DISPATCH_REQUEST');
  }
});
test('valid signed github request still cannot send without original Healer binding and release proofs',async()=>{
  await mf.setOptions(options({BRAIN_SELFHEAL_DISPATCH_ENABLED:'true'}));
  const response=await send(randomUUID());
  assert.equal(response.status,423);
  assert.equal((await response.json()).code,'SELFHEAL_SIGNED_DISPATCH_DISABLED');
});
test('expired private source/binding flags fail closed despite a valid caller HMAC',async()=>{
  for (const patch of [
    {BRAIN_PRIVATE_EVENT_SOURCES_ENABLED:'false'},
    {BRAIN_PRIVATE_SERVICE_BINDINGS_VERIFIED:'false'},
    {BRAIN_CAPABILITY_RECEIPT_KEY:''}
  ]){
    await mf.setOptions(options({...patch,BRAIN_SELFHEAL_DISPATCH_ENABLED:'true'}));
    const response=await send(randomUUID());
    assert.equal(response.status,423);
  }
});

test('Healer signature key cannot be reused for source event or operator authentication',async()=>{
  await mf.setOptions(options({
    BRAIN_SELFHEAL_DISPATCH_ENABLED:'true',
    HEALER_EVENT_HMAC_KEY:GITHUB_KEY
  }));
  const response=await send(randomUUID());
  assert.equal(response.status,503);
  assert.equal((await response.json()).code,'PRINCIPAL_SECRET_COLLISION');
});
