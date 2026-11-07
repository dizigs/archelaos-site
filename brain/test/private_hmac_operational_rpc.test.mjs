import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';

// Native workerd fixture loads BOTH operational Worker entrypoints, not the
// HMAC candidate in isolation. Entirely synthetic credentials and local RPC.
// There is no public QA route, Cloudflare credential, live Worker or deployment.
const BRAIN = fileURLToPath(new URL('../src/worker.mjs', import.meta.url));
const HEALER = fileURLToPath(new URL('../../automation/self-heal-worker/src/worker.mjs', import.meta.url));
const BRAIN_ROOT = fileURLToPath(new URL('../src/', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const KEY = 'synthetic-offline-operational-hmac-test-'.repeat(3);
const WRONG_KEY = 'different-synthetic-offline-hmac-test-'.repeat(3);
const SHA = 'd'.repeat(40);
const RUNNER = `export default {
  async fetch(request,env) {
    if(request.method!=='POST') return new Response('Not found',{status:404});
    return Response.json(await env.BRAIN_QA.runChallenge());
  }
}`;

async function fixture({ wrongKey = false, omitHmacPeer = false } = {}) {
  const persist = await mkdtemp(join(tmpdir(), 'archelaos-operational-qa-'));
  const session = randomUUID();
  const now = Date.now();
  const qa = {
    PRIVATE_HMAC_ACCEPTANCE_ISOLATED: 'true',
    PRIVATE_HMAC_ACCEPTANCE_SESSION: session,
    PRIVATE_HMAC_ACCEPTANCE_APPROVED_SHA: SHA,
    PRIVATE_HMAC_ACCEPTANCE_STARTED_AT: new Date(now - 1000).toISOString(),
    PRIVATE_HMAC_ACCEPTANCE_EXPIRES_AT: new Date(now + 120000).toISOString(),
    DEPLOY_SHA: SHA,
  };
  const brainVars = {
    ...qa, PRIVATE_HMAC_ACCEPTANCE_ROLE: 'brain',
    ENVIRONMENT: 'staging', STAGING_EXPIRES_AT: '1970-01-01T00:00:00Z',
    BRAIN_SELFHEAL_RECOVERY_ENABLED: 'false',
    BRAIN_SELFHEAL_BINDING_ATTESTED: 'false',
    BRAIN_SELFHEAL_DISPATCH_ENABLED: 'false',
    BRAIN_SELFHEAL_DURABLE_ACK_ENABLED: 'false',
    HEALER_EVENT_HMAC_KEY: KEY,
  };
  const healerVars = {
    ...qa, PRIVATE_HMAC_ACCEPTANCE_ROLE: 'healer',
    HEALER_DURABLE_ACK_ENABLED: 'false',
    HEALER_EVENT_HMAC_KEY: wrongKey ? WRONG_KEY : KEY,
  };
  let egress = 0;
  const config = {
    durableObjectsPersist: persist,
    outboundService: async () => {
      egress++;
      return new Response('Off-network test denied', { status: 503 });
    },
    workers: [
      {
        name: 'archelaos-brain-staging', modules: true, scriptPath: BRAIN,
        modulesRoot: BRAIN_ROOT, compatibilityDate: '2026-07-30',
        bindings: brainVars,
        durableObjects: {
          BRAIN: { className: 'BrainCoordinator', useSQLite: true },
          HMAC_NONCES: { className: 'PrivateHmacNonceStore', useSQLite: true },
        },
        serviceBindings: {
          HEALER: { name: 'archelaos-self-heal' },
          ...(omitHmacPeer ? {} : {
            HMAC_PEER: { name: 'archelaos-self-heal', entrypoint: 'HealerHmacAcceptancePort' },
          }),
        },
      },
      {
        name: 'archelaos-self-heal', modules: true, scriptPath: HEALER,
        modulesRoot: REPO_ROOT, compatibilityDate: '2026-11-01',
        bindings: healerVars,
        durableObjects: {
          HEALER_MEMORY: { className: 'HealerMemory', useSQLite: true },
          HMAC_NONCES: { className: 'PrivateHmacNonceStore', useSQLite: true },
        },
        serviceBindings: {
          BRAIN_RECOVERY: { name: 'archelaos-brain-staging', entrypoint: 'BrainRecoveryPort' },
        },
      },
      {
        name: 'synthetic-local-qa-runner', modules: true, script: RUNNER,
        compatibilityDate: '2026-11-01',
        serviceBindings: {
          BRAIN_QA: { name: 'archelaos-brain-staging', entrypoint: 'BrainHmacAcceptancePort' },
        },
      },
    ],
  };
  const mf = new Miniflare(config);
  return {
    async run() {
      const worker = await mf.getWorker('synthetic-local-qa-runner');
      const response = await worker.fetch('https://local.invalid/qa', { method: 'POST' });
      assert.equal(response.status, 200);
      return response.json();
    },
    async publicFailClosed() {
      // The actual Brain rejects HTTP with 503 before routing when staging is
      // deliberately expired. Unlike the Healer's default 404 this is expected
      // and stronger than allowing any public QA route.
      for (const [name, expectedStatus] of [
        ['archelaos-brain-staging', 503],
        ['archelaos-self-heal', 404],
      ]) {
        const worker = await mf.getWorker(name);
        for (const endpoint of ['/', '/qa', '/selfheal/dispatch']) {
          const response = await worker.fetch('https://local.invalid' + endpoint, { method: 'POST' });
          assert.equal(response.status, expectedStatus, name + ' must remain HTTP fail-closed');
        }
      }
    },
    async close() {
      try { await mf.dispose(); }
      finally {
        await rm(persist, { recursive: true, force: true });
        assert.equal(egress, 0, 'HMAC acceptance must never invoke a public provider');
      }
    },
  };
}

test('operational Brain and Healer modules complete one local private HMAC RPC; no repair and HTTP denied', async () => {
  const f = await fixture();
  try {
    const reply = await f.run();
    assert.equal(reply.status, 'KEY_POSSESSION_CONFIRMED');
    assert.equal(reply.sourceSha, SHA);
    assert.equal(reply.actionsExecuted, 0);
    assert.match(reply.challengeDigest, /^[0-9a-f]{64}$/);
    assert.equal(JSON.stringify(reply).includes(KEY), false);
    await f.publicFailClosed();
  } finally { await f.close(); }
});

test('actual operational ports refuse wrong HMAC key and missing private QA peer', async () => {
  for (const variant of [{ wrongKey: true }, { omitHmacPeer: true }]) {
    const f = await fixture(variant);
    try {
      const reply = await f.run();
      assert.deepEqual(reply, {
        status: 'UNKNOWN', code: 'PRIVATE_HMAC_ACCEPTANCE_UNVERIFIED', actionsExecuted: 0,
      });
      await f.publicFailClosed();
    } finally { await f.close(); }
  }
});
