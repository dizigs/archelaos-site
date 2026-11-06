import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Miniflare } from 'miniflare';
import { runInNewContext } from 'node:vm';

// The named BrainRecoveryPort is a security boundary. A class getter is
// remotely callable through native Worker RPC, even when the HTTP staging
// entrypoint, credentials, and expiry are disabled. These tests require a
// *real named Service Binding*; mocks of the three public methods are not enough.
const callerScript = String.raw`
export default {
  async fetch(request, env) {
    const rpc = env.BRAIN_RECOVERY;
    const result = {
      normalGateDenied: false,
      reviewDenied: false,
      healthDenied: false,
      coordinatorCapabilityExposed: false,
      leakedControlReadable: false,
      forgedEvidenceAccepted: false,
    };
    try {
      const verified = await rpc.verifySelfHealReceipt({ verified: true });
      result.normalGateDenied = verified?.verified === false &&
        verified?.code === 'SELFHEAL_PROVENANCE_OR_STAGING_UNVERIFIED';
    } catch {
      result.normalGateDenied = false;
    }
    try {
      const review = await rpc.routeSelfHealReview({ verified: true });
      result.reviewDenied = review?.accepted === false &&
        review?.code === 'SELFHEAL_REVIEW_NOT_AUTHORIZED';
    } catch {
      result.reviewDenied = false;
    }
    try {
      const health = await rpc.recheckSelfHealHealth({ resource: 'test' });
      result.healthDenied = health?.verified === false &&
        health?.code === 'SELFHEAL_HEALTH_PROVENANCE_NOT_IMPLEMENTED';
    } catch {
      result.healthDenied = false;
    }

    // This reproduces the previous getter exposure from the *untrusted*
    // Worker side, without a credential, authorized SHA or remote network.
    try {
      const stub = await rpc.coordinator;
      if (stub !== null && stub !== undefined) {
        result.coordinatorCapabilityExposed = true;
        try {
          const controls = await stub.controlState();
          result.leakedControlReadable = Boolean(controls);
        } catch {}
        try {
          const forged = await stub.verifiedSelfHealCi(
            { verified: true, source: 'github' },
            { verified: true, source: 'github' }
          );
          result.forgedEvidenceAccepted = forged?.verified === true;
        } catch {}
      }
    } catch {}
    return Response.json(result);
  }
};
`;

test('named BrainRecoveryPort exposes exactly three review-only RPC methods and no helper getters', async () => {
  const source = await readFile(new URL('../src/worker.mjs', import.meta.url), 'utf8');
  const marker = 'export class BrainRecoveryPort extends WorkerEntrypoint {';
  assert.equal(source.split(marker).length, 2);
  const port = source.split(marker)[1];
  const names = [...port.matchAll(/^  (?:async )?(?:get )?([A-Za-z]\w*)\s*\(/gm)]
    .map(match => match[1]).sort();
  const allowed = [
    'recheckSelfHealHealth', 'routeSelfHealReview', 'verifySelfHealReceipt'
  ];
  assert.deepEqual(names, allowed);

  // Do not rely on a regex for the security boundary: computed properties
  // like get ['canonical']() evade textual method-name matching. Instantiate
  // the actual class declaration in an isolated VM (methods are not invoked),
  // then inspect *all* own keys and accessor descriptors at JavaScript runtime.
  // The next test also exercises the real named Miniflare RPC service binding.
  const declaration = source.slice(source.indexOf(marker)).replace(/^export /, '');
  const prototype = runInNewContext(
    declaration + '\nBrainRecoveryPort.prototype',
    { WorkerEntrypoint: class {} }, { timeout: 1000 }
  );
  const keys = Reflect.ownKeys(prototype).filter(key => key !== 'constructor');
  assert.deepEqual(keys.sort(), allowed);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
    assert.equal(typeof descriptor.value, 'function', key + ' must be a method');
    assert.equal(descriptor.get, undefined, key + ' must not be an RPC getter');
    assert.equal(descriptor.set, undefined, key + ' must not be an RPC setter');
  }
  assert.doesNotMatch(port, /\bget\s+coordinator\s*\(/);
  assert.doesNotMatch(port, /\bthis\.coordinator\b/);
  assert.doesNotMatch(port, /\bthis\.requireStaging\b/);
});

test('real named Worker RPC cannot leak canonical DO or bypass expired staging with forged evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'brain-rpc-visibility-'));
  let outboundCalls = 0;
  const mf = new Miniflare({
    workers: [
      {
        name: 'brain-rpc-boundary-test',
        modules: true,
        scriptPath: resolve('src/worker.mjs'),
        compatibilityDate: '2026-07-30',
        durableObjects: {
          BRAIN: { className: 'BrainCoordinator', useSQLite: true }
        },
        bindings: {
          ENVIRONMENT: 'staging',
          DEPLOY_SHA: 'a'.repeat(40),
          STAGING_EXPIRES_AT: '1970-01-01T00:00:00Z',
          // Deliberately no approval, GitHub App key, or HMAC credentials.
        }
      },
      {
        name: 'untrusted-recovery-caller',
        modules: true,
        script: callerScript,
        compatibilityDate: '2026-07-30',
        serviceBindings: {
          BRAIN_RECOVERY: {
            name: 'brain-rpc-boundary-test',
            entrypoint: 'BrainRecoveryPort'
          }
        }
      }
    ],
    durableObjectsPersist: directory,
    outboundService: async () => {
      outboundCalls++;
      return new Response('no external egress', { status: 503 });
    }
  });
  try {
    const caller = await mf.getWorker('untrusted-recovery-caller');
    const response = await caller.fetch('https://internal.example.invalid/');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      normalGateDenied: true,
      reviewDenied: true,
      healthDenied: true,
      coordinatorCapabilityExposed: false,
      leakedControlReadable: false,
      forgedEvidenceAccepted: false
    });
    assert.equal(outboundCalls, 0);
  } finally {
    await mf.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});


test('durable SQLite tables and canary rows survive rejected named RPC, replay and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'brain-rpc-sqlite-invariance-'));
  let outboundCalls = 0;
  const build = () => new Miniflare({
    workers: [
      {
        name: 'brain-rpc-boundary-test',
        modules: true,
        scriptPath: resolve('src/worker.mjs'),
        compatibilityDate: '2026-07-30',
        durableObjects: { BRAIN: { className: 'BrainCoordinator', useSQLite: true } },
        bindings: {
          ENVIRONMENT: 'staging',
          DEPLOY_SHA: 'a'.repeat(40),
          STAGING_EXPIRES_AT: '1970-01-01T00:00:00Z'
          // No approval, provider credentials, private HMAC or receipt secrets.
        }
      },
      {
        name: 'untrusted-recovery-caller',
        modules: true,
        script: callerScript,
        compatibilityDate: '2026-07-30',
        serviceBindings: {
          BRAIN_RECOVERY: {
            name: 'brain-rpc-boundary-test',
            entrypoint: 'BrainRecoveryPort'
          }
        }
      }
    ],
    durableObjectsPersist: directory,
    outboundService: async () => {
      outboundCalls++;
      return new Response('external access prohibited', { status: 503 });
    }
  });

  const openStorage = async mf => {
    const namespace = await mf.getDurableObjectNamespace('BRAIN', 'brain-rpc-boundary-test');
    const id = namespace.idFromName('central-v1');
    // Construct the real DO, ensuring its schema and controls have initialized.
    const response = await namespace.get(id).fetch('https://brain.internal/internal/control');
    assert.equal(response.status, 200);
    return await mf.getDurableObjectStorage(id);
  };

  const snapshot = storage => {
    const names = [...storage.sql.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )].map(row => row.name);
    assert.ok(names.includes('controls'));
    assert.ok(names.includes('task_intents'));
    return names.map(name => {
      // Table names only come from sqlite_master; disallow quoted identifiers.
      assert.match(name, /^[A-Za-z_][A-Za-z0-9_]*$/);
      const rows = [...storage.sql.exec('SELECT * FROM "' + name + '"')]
        .map(row => JSON.stringify(row, (_key, value) =>
          typeof value === 'bigint' ? value.toString() : value)).sort();
      return [name, rows];
    });
  };

  let mf = build();
  try {
    const storage = await openStorage(mf);
    // Synthetic durable records make the assertion stronger than counting
    // empty tables. Neither record belongs to any live account or receipt.
    storage.sql.exec('INSERT INTO controls(name,value) VALUES(?,?)',
      'source:rpc_sqlite_canary', 1);
    storage.sql.exec('INSERT INTO task_intents(id,payload,created,expires) VALUES(?,?,?,?)',
      'rpc_sqlite_canary', '{"synthetic":true}', 1700000000000, 1800000000000);
    await storage.sync();
    const before = snapshot(storage);
    const alarmBefore = await storage.getAlarm();

    const caller = await mf.getWorker('untrusted-recovery-caller');
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await caller.fetch('https://internal.example.invalid/');
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        normalGateDenied: true,
        reviewDenied: true,
        healthDenied: true,
        coordinatorCapabilityExposed: false,
        leakedControlReadable: false,
        forgedEvidenceAccepted: false
      });
      assert.deepEqual(snapshot(storage), before, 'rejected RPC changed SQLite');
      assert.equal(await storage.getAlarm(), alarmBefore, 'rejected RPC set an alarm');
    }
    assert.equal(outboundCalls, 0);
    await mf.dispose();
    mf = null;

    // A fresh workerd instance must read exactly the same persisted SQLite
    // rows and tables; no deferred mutation may materialize after restart.
    mf = build();
    const restarted = await openStorage(mf);
    assert.deepEqual(snapshot(restarted), before, 'SQLite mutated across restart');
    assert.equal(await restarted.getAlarm(), alarmBefore);
    assert.equal(outboundCalls, 0);
  } finally {
    if (mf) await mf.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
