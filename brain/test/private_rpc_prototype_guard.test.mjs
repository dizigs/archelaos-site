import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Miniflare } from 'miniflare';

// Test-only, fail-closed check for plain RPC reply data objects. Do not
// apply Object.prototype assumptions to workerd RPC stub proxies.
const SENSITIVE = ['env','ctx','nonceStore','coordinator','memory'];
const INTRINSICS = ['constructor','__proto__'];
const BUILTINS = new Map(INTRINSICS.map(k=>[k,Object.getOwnPropertyDescriptor(Object.prototype,k)]));
function inspectOwnShape(target) {
  try {
    if ((typeof target!=='object' && typeof target!=='function') || target===null)
      return {safe:false,reason:'NOT_OBJECT'};
    const proto=Object.getPrototypeOf(target);
    if (proto!==null && proto!==Object.prototype)
      return {safe:false,reason:'UNAPPROVED_PROTOTYPE'};
    for (const name of SENSITIVE)
      if (name in target) return {safe:false,reason:'SENSITIVE_REACHABLE',name};
    for (const name of INTRINSICS) {
      if (Object.getOwnPropertyDescriptor(target,name))
        return {safe:false,reason:'INTRINSIC_SHADOWED',name};
      if (proto===Object.prototype) {
        const expected=BUILTINS.get(name);
        const actual=Object.getOwnPropertyDescriptor(proto,name);
        if (!actual || actual.get!==expected.get || actual.set!==expected.set ||
            actual.value!==expected.value || actual.writable!==expected.writable ||
            actual.configurable!==expected.configurable || actual.enumerable!==expected.enumerable)
          return {safe:false,reason:'INTRINSIC_DESCRIPTOR_CHANGED',name};
      }
    }
    return {safe:true,reason:'BOUNDARY_CLEAN'};
  } catch {
    // Object reflection can execute malicious Proxy traps. Never treat that
    // exception as proof that inaccessible data is safe.
    return {safe:false,reason:'REFLECTION_TRAP'};
  }
}
const clean=()=>({status:'OFF',verified:false});

test('plain objects inherit constructor and __proto__, not leak their own properties',()=>{
  const obj=clean();
  assert.equal('constructor' in obj,true);
  assert.equal('__proto__' in obj,true);
  assert.equal(Object.hasOwn(obj,'constructor'),false);
  assert.equal(Object.hasOwn(obj,'__proto__'),false);
  assert.equal(inspectOwnShape(obj).safe,true);
});
test('builtin Object.prototype.__proto__ accessor is not a hostile getter',()=>{
  const desc=Object.getOwnPropertyDescriptor(Object.prototype,'__proto__');
  assert.equal(typeof desc.get,'function');
  assert.equal(inspectOwnShape(clean()).safe,true);
});
test('null-prototype reply does not inherit prototype accessors',()=>{
  const reply=Object.assign(Object.create(null),clean());
  assert.equal('constructor' in reply,false);
  assert.equal(inspectOwnShape(reply).safe,true);
});
test('own constructor shadow is rejected',()=>{
  assert.equal(inspectOwnShape({constructor:()=>{}}).reason,'INTRINSIC_SHADOWED');
});
test('own __proto__ shadow is rejected',()=>{
  const o=Object.defineProperty({},'__proto__',{value:null});
  assert.equal(inspectOwnShape(o).reason,'INTRINSIC_SHADOWED');
});
test('all five sensitive own capabilities are rejected',()=>{
  for(const name of SENSITIVE)
    assert.deepEqual(inspectOwnShape({[name]:{}}),{safe:false,reason:'SENSITIVE_REACHABLE',name});
});
test('all five inherited sensitive capabilities are rejected',()=>{
  for(const name of SENSITIVE) {
    const obj=Object.create({[name]:{}});
    assert.equal(inspectOwnShape(obj).reason,'UNAPPROVED_PROTOTYPE');
  }
});
test('malicious inherited getter is rejected without reading its value',()=>{
  let reads=0;
  const parent=Object.defineProperty({},'env',{get(){reads++;throw Error('do not read')}});
  assert.equal(inspectOwnShape(Object.create(parent)).safe,false);
  assert.equal(reads,0);
});
test('custom prototype fails closed',()=>{
  assert.equal(inspectOwnShape(Object.create({harmless:true})).reason,'UNAPPROVED_PROTOTYPE');
});
test('reflection Proxy traps fail closed',()=>{
  const p=new Proxy({},{getPrototypeOf(){throw Error('trap')}});
  assert.equal(inspectOwnShape(p).reason,'REFLECTION_TRAP');
});
test('scalar, null and Boolean-array reports cannot replace a port check',()=>{
  for(const value of [null,false,0,'safe',undefined,[true,true]])
    assert.equal(inspectOwnShape(value).safe,false);
});

// Actual Miniflare Service Binding, not a mock or inferred plain-object check.
// All gates are OFF; this fixture has no HMAC key or real recovery capability.
const targetScript=String.raw`
import { WorkerEntrypoint } from 'cloudflare:workers';
export class MinimalPort extends WorkerEntrypoint {
  async health() { return { verified: false, status: 'OFF' }; }
}
export class SyntheticLeakyPort extends WorkerEntrypoint {
  async health() { return { verified: false, status: 'OFF' }; }
  // Deliberate synthetic leak on the public prototype: calibration ONLY.
  // The detector must notice this without needing any real env/ctx/secret.
  get coordinator() { return 'SYNTHETIC-LEAK-CANARY'; }
}
export default { async fetch() { return new Response('private', { status: 404 }); } };
`;
const callerScript=String.raw`
export default {
  async fetch(request, env) {
    const rpc=env.PRIVATE_PORT;
    const names=['env','ctx','nonceStore','coordinator','memory'];
    const result={healthDenied:false,exposed:[]};
    try {
      const reply=await rpc.health();
      result.healthDenied=reply?.verified===false && reply?.status==='OFF';
    } catch {}
    for (const name of names) {
      try {
        const value=await rpc[name];
        if (value!==null && value!==undefined) result.exposed.push(name);
      } catch {}
    }
    return Response.json(result);
  }
};
`;
async function probeNativeRpc(entrypoint) {
  // This fixture exercises actual workerd JSRPC. Both clean and leaky cases
  // share precisely the same detector and transport so the negative control
  // cannot pass via a different mocked implementation.
  let egress=0;
  const mf=new Miniflare({
    workers:[
      {name:'isolated-private-port',modules:true,script:targetScript,compatibilityDate:'2026-07-30'},
      {name:'isolated-caller',modules:true,script:callerScript,compatibilityDate:'2026-07-30',
        serviceBindings:{PRIVATE_PORT:{name:'isolated-private-port',entrypoint}}}
    ],
    outboundService:async()=>{egress++;return new Response('DENIED',{status:503})}
  });
  try {
    const caller=await mf.getWorker('isolated-caller');
    const response=await caller.fetch('https://internal.invalid/');
    assert.equal(response.status,200);
    const report=await response.json();
    assert.equal(egress,0);
    return report;
  } finally { await mf.dispose(); }
}

test('native named Miniflare RPC does not leak five internal capabilities',async()=>{
  assert.deepEqual(await probeNativeRpc('MinimalPort'),{
    healthDenied:true,exposed:[]
  });
});

test('native RPC detector flags an intentionally exposed synthetic getter',async()=>{
  // Negative control proves the same real RPC detector fails open neither on
  // clean ports nor on a deliberate public-prototype capability leak.
  assert.deepEqual(await probeNativeRpc('SyntheticLeakyPort'),{
    healthDenied:true,exposed:['coordinator']
  });
});
