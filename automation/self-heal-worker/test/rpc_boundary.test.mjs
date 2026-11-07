import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const SOURCE_URL = new URL('../src/worker.mjs', import.meta.url);
const EXPORTED_RPC_METHODS = [
  'attemptRecovery', 'diagnose', 'fetch', 'observe', 'recoveryStatus', 'status'
];

// Test the actual WorkerEntrypoint source under a restricted, offline VM; the
// stub base class has no Cloudflare RPC machinery. Native workerd Service
// Binding acceptance is a separate release gate, not claimed by these tests.
async function loadHealerService() {
  const source = await readFile(SOURCE_URL, 'utf8');
  // Strip ONLY the reviewed dormant QA module export from the isolated VM;
  // the real Worker bundle/native tests must still import the full module.
  const qaExport = "export { HealerHmacAcceptancePort, PrivateHmacNonceStore } from '../../../brain/src/private_hmac_candidate.mjs';";
  assert.equal(source.split(qaExport).length, 2, 'only one reviewed QA named export');
  const script = source
    .replace(qaExport, '')
    .replace(/^import .*;\n/gm, '')
    .replace('export class HealerMemory', 'class HealerMemory')
    .replace('export default class HealerService', 'class HealerService') + '\nHealerService;';
  assert.equal((script.match(/class HealerService extends WorkerEntrypoint/g) || []).length, 1);
  class WorkerEntrypoint {
    constructor(env) { this.env = env; }
  }
  class DurableObject {}
  const HealerService = runInNewContext(script, {
    WorkerEntrypoint, DurableObject, Response,
    HealerLedger: class {}, RecoveryLedger: class {},
    verifySignedRecoveryEvent: async () => { throw Error('NOT_AUTHENTICATED'); },
    recoverIncident: async () => { throw Error('NOT_RUN'); }
  });
  return { HealerService, source };
}

function assertRpcSurface(klass) {
  const descriptors = Object.getOwnPropertyDescriptors(klass.prototype);
  const keys = Reflect.ownKeys(descriptors);
  assert.deepEqual(keys.filter(k => k !== 'constructor').sort(), EXPORTED_RPC_METHODS);
  for (const [name, descriptor] of Object.entries(descriptors)) {
    if (name === 'constructor') continue;
    assert.equal(typeof descriptor.value, 'function', `RPC ${name} must be a method`);
    assert.equal(descriptor.get, undefined, `RPC ${name} must not be a getter`);
    assert.equal(descriptor.set, undefined, `RPC ${name} must not be a setter`);
  }
}

test('default HealerService prototype exposes exactly reviewed methods and no getter, computed or symbol properties', async () => {
  const { HealerService, source } = await loadHealerService();
  assertRpcSurface(HealerService);
  assert.doesNotMatch(source, /\bget\s+memory\s*\(/);
  assert.doesNotMatch(source, /\bthis\.memory\b/);
});

test('synthetic hostile prototype mutations are caught, including computed getter and symbol', async () => {
  const { HealerService } = await loadHealerService();
  const orig = Object.getOwnPropertyDescriptors(HealerService.prototype);
  for (const change of [
    proto => Object.defineProperty(proto, 'memory', { get: () => ({ stub: true }), configurable: true }),
    proto => Object.defineProperty(proto, ['memory'].join(''), { get: () => ({ stub: true }), configurable: true }),
    proto => Object.defineProperty(proto, Symbol('memory'), { get: () => ({ stub: true }), configurable: true }),
    proto => Object.defineProperty(proto, 'status', { get: () => ({ stub: true }), configurable: true })
  ]) {
    const specimen = Object.create(null);
    Object.defineProperties(specimen, orig);
    change(specimen);
    assert.throws(() => assertRpcSurface({ prototype: specimen }));
  }
});

test('approved RPC methods still forward to same canonical Durable Object stub; private helper is not a public RPC', async () => {
  const { HealerService } = await loadHealerService();
  const calls = [];
  const stub = {
    recordFinding: async (...args) => (calls.push(['recordFinding', ...args]), 'recorded'),
    lookupFinding: async (...args) => (calls.push(['lookupFinding', ...args]), 'located'),
    getStatus: async () => (calls.push(['getStatus']), 'status'),
    getRecoveryStatus: async () => (calls.push(['getRecoveryStatus']), 'recovery-status'),
    attemptRecovery: async (...args) => (calls.push(['attemptRecovery', ...args]), 'recovery-denied')
  };
  const env = { HEALER_MEMORY: {
    idFromName: name => (assert.equal(name, 'archelaos-club'), 'canonical-id'),
    get: id => (assert.equal(id, 'canonical-id'), stub)
  } };
  const service = new HealerService(env);
  assert.equal(await service.observe({ finding: 1 }), 'recorded');
  assert.equal(await service.diagnose('CODE', '/resource'), 'located');
  assert.equal(await service.status(), 'status');
  assert.equal(await service.recoveryStatus(), 'recovery-status');
  assert.equal(await service.attemptRecovery({ signature: 'invalid' }), 'recovery-denied');
  assert.deepEqual(calls, [
    ['recordFinding', { finding: 1 }], ['lookupFinding', 'CODE', '/resource'],
    ['getStatus'], ['getRecoveryStatus'], ['attemptRecovery', { signature: 'invalid' }]
  ]);
  assert.equal(Reflect.get(HealerService.prototype, 'memory'), undefined);
  assert.equal(Reflect.get(HealerService.prototype, 'healerMemory'), undefined);
  const response = await service.fetch();
  assert.equal(response.status, 404);
});
