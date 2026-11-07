import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { signCanonicalRecoveryFinding } from '../src/selfheal_signed_outbox.mjs';

// Synthetic local Workers only. No real source, provider credential or enabled
// Brain gate. The service targets/entrypoint match the approved Wrangler links.
const KEY = 'synthetic-local-link-test-not-a-secret-'.repeat(3);
const caller = `export default { async fetch(request, env) {
  const envelope = await request.json();
  const result = await env.HEALER.attemptRecovery(envelope);
  return Response.json(result);
}}`;

test('two existing-service targets fail closed through named Brain RPC; SQLite HMAC replay survives restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'brain-healer-inactive-links-'));
  let outbound = 0;
  const build = () => new Miniflare({
    workers: [
      {
        name: 'archelaos-brain-staging', modules: true,
        scriptPath: fileURLToPath(new URL('../src/worker.mjs', import.meta.url)),
        modulesRoot: fileURLToPath(new URL('../src/', import.meta.url)),
        compatibilityDate: '2026-07-30',
        durableObjects: { BRAIN: { className: 'BrainCoordinator', useSQLite: true } },
        bindings: {
          ENVIRONMENT: 'staging', DEPLOY_SHA: '0'.repeat(40),
          STAGING_EXPIRES_AT: '1970-01-01T00:00:00Z',
          BRAIN_SELFHEAL_RECOVERY_ENABLED: 'false',
          BRAIN_SELFHEAL_BINDING_ATTESTED: 'false',
          BRAIN_SELFHEAL_DISPATCH_ENABLED: 'false'
        },
        serviceBindings: { HEALER: { name: 'archelaos-self-heal' } }
      },
      {
        name: 'archelaos-self-heal', modules: true,
        scriptPath: fileURLToPath(new URL('../../automation/self-heal-worker/src/worker.mjs', import.meta.url)),
        modulesRoot: fileURLToPath(new URL('../../', import.meta.url)), // repo root: shared private HMAC module inside root
        compatibilityDate: '2026-11-01',
        durableObjects: { HEALER_MEMORY: { className: 'HealerMemory', useSQLite: true } },
        bindings: { HEALER_EVENT_HMAC_KEY: KEY },
        serviceBindings: { BRAIN_RECOVERY: {
          name: 'archelaos-brain-staging', entrypoint: 'BrainRecoveryPort'
        } }
      },
      {
        name: 'synthetic-link-caller', modules: true, script: caller,
        compatibilityDate: '2026-11-01',
        serviceBindings: { HEALER: { name: 'archelaos-self-heal' } }
      }
    ],
    durableObjectsPersist: directory,
    outboundService: async () => {
      outbound++;
      return new Response('Synthetic egress denied', { status: 503 });
    }
  });
  const finding = {
    schemaVersion: 1, source: 'github_actions', repository: 'dizigs/archelaos-site',
    code: 'CI_FAILURE', resource: '/ci', commit: 'a'.repeat(40),
    observedAt: new Date().toISOString(), evidenceId: 'actions:42022399427'
  };
  const signed = await signCanonicalRecoveryFinding(finding, KEY, Date.now(), 'c'.repeat(32));
  const deliver = async (mf, envelope) => {
    const client = await mf.getWorker('synthetic-link-caller');
    const response = await client.fetch('https://synthetic.invalid/', {
      method: 'POST', body: JSON.stringify(envelope)
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  let mf;
  try {
    mf = build();
    const unsigned = await deliver(mf, finding);
    assert.equal(unsigned.reason, 'RECOVERY_AUTH_REJECTED');
    const denied = await deliver(mf, signed);
    assert.equal(denied.status, 'BLOCKED');
    assert.equal(denied.reason, 'BRAIN_PROOF_UNVERIFIED');
    assert.equal(denied.autoMergeAllowed, false);
    assert.equal(denied.deployAllowed, false);
    assert.equal((await deliver(mf, signed)).reason, 'RECOVERY_AUTH_REJECTED');
    await mf.dispose();
    mf = build();
    assert.equal((await deliver(mf, signed)).reason, 'RECOVERY_AUTH_REJECTED');
    assert.equal(outbound, 0);
  } finally {
    if (mf) await mf.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
