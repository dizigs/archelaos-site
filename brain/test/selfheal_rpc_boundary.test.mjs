import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, rm, writeFile, unlink } from 'node:fs/promises';
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
  // Include the real BrainRecoveryPort prototype but exclude only the exact
  // reviewed, dormant named QA re-export from this no-module VM harness.
  const qaExport = "export { BrainHmacAcceptancePort, PrivateHmacNonceStore } from './private_hmac_candidate.mjs';";
  assert.equal(source.split(qaExport).length, 2, 'only one reviewed QA named export');
  const declaration = source.slice(source.indexOf(marker))
    .replace(qaExport, '')
    .replace(/^export /, '');
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
  const scriptPath = resolve('src', '.rpc-sqlite-fixture-' + process.pid + '-' + Date.now() + '.mjs');
  let outboundCalls = 0;
  // This is an instrumentation of a TEMPORARY COPY, not a production method.
  // It adds readback exclusively to the local test DO. The real RPC port and
  // production source are unchanged, and the copied module retains imports.
  const source = await readFile(resolve('src/worker.mjs'), 'utf8');
  const marker = 'export class BrainCoordinator extends DurableObject {';
  assert.equal(source.split(marker).length, 2);
  const temporaryMethods = [
    '  async __testSqlCanarySeed() {',
    "    this.sql.exec('INSERT INTO controls(name,value) VALUES(?,?)', 'source:rpc_sqlite_canary', 1);",
    "    this.sql.exec('INSERT INTO task_intents(id,payload,created,expires) VALUES(?,?,?,?)',",
    '      \'rpc_sqlite_canary\', \'{"synthetic":true}\', 1700000000000, 1800000000000);',
    '    return true;',
    '  }',
    '  async __testSqlSnapshot() {',
    '    const names = [...this.sql.exec(',
    '      "SELECT name FROM sqlite_master WHERE type=\'table\' AND name NOT LIKE \'sqlite_%\' ORDER BY name"',
    '    )].map(row => row.name);',
    '    return names.map(name => {',
    '      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error("UNEXPECTED_TABLE_NAME");',
    '      const rows = [...this.sql.exec(\'SELECT * FROM "\' + name + \'"\')]',
    '        .map(row => JSON.stringify(row, (_key, value) =>',
    '          typeof value === "bigint" ? value.toString() : value)).sort();',
    '      return [name, rows];',
    '    });',
    '  }',
    '  async __testSqlAlarm() { return await this.ctx.storage.getAlarm(); }'
  ].join('\n');
  await writeFile(scriptPath, source.replace(marker, marker + '\n' + temporaryMethods + '\n'));

  const build = () => new Miniflare({
    workers: [
      {
        name: 'brain-rpc-boundary-test',
        modules: true,
        scriptPath,
        compatibilityDate: '2026-07-30',
        durableObjects: { BRAIN: { className: 'BrainCoordinator', useSQLite: true } },
        bindings: {
          ENVIRONMENT: 'staging',
          DEPLOY_SHA: 'a'.repeat(40),
          STAGING_EXPIRES_AT: '1970-01-01T00:00:00Z'
          // Deliberately no approval, GitHub App key or HMAC secrets.
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

  const getStub = async mf => {
    const ns = await mf.getDurableObjectNamespace('BRAIN', 'brain-rpc-boundary-test');
    const stub = ns.get(ns.idFromName('central-v1'));
    const response = await stub.fetch('https://brain.internal/internal/control');
    assert.equal(response.status, 200);
    return stub;
  };

  let mf;
  try {
    mf = build();
    const stub = await getStub(mf);
    assert.equal(await stub.__testSqlCanarySeed(), true);
    const before = await stub.__testSqlSnapshot();
    assert.ok(before.some(([table, rows]) =>
      table === 'controls' && rows.some(row => row.includes('rpc_sqlite_canary'))));
    assert.ok(before.some(([table, rows]) =>
      table === 'task_intents' && rows.some(row => row.includes('rpc_sqlite_canary'))));
    const alarmBefore = await stub.__testSqlAlarm();

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
      assert.deepEqual(await stub.__testSqlSnapshot(), before,
        'denied named RPC modified durable SQL state');
      assert.equal(await stub.__testSqlAlarm(), alarmBefore);
    }
    assert.equal(outboundCalls, 0);
    await mf.dispose();
    mf = null;

    mf = build();
    const restartedStub = await getStub(mf);
    assert.deepEqual(await restartedStub.__testSqlSnapshot(), before,
      'durable SQL tables or rows changed after workerd restart');
    assert.equal(await restartedStub.__testSqlAlarm(), alarmBefore);
    assert.equal(outboundCalls, 0);
  } finally {
    if (mf) await mf.dispose();
    await unlink(scriptPath);
    await rm(directory, { recursive: true, force: true });
  }
});
