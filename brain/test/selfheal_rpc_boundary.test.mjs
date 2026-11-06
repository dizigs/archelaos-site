import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Miniflare } from 'miniflare';

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
      coordinatorCapabilityExposed: false,
      leakedControlReadable: false,
      forgedEvidenceAccepted: false,
    };
    try {
      const verified = await rpc.verifySelfHealReceipt({ verified: true });
      result.normalGateDenied = verified?.verified === false;
    } catch {
      result.normalGateDenied = true;
    }
    try {
      const review = await rpc.routeSelfHealReview({ verified: true });
      result.reviewDenied = review?.accepted === false;
    } catch {
      result.reviewDenied = true;
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
  assert.deepEqual(names, [
    'recheckSelfHealHealth', 'routeSelfHealReview', 'verifySelfHealReceipt'
  ]);
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
