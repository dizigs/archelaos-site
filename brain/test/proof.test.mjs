import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Miniflare } from 'miniflare';
import { proveStaging } from '../tools/prove_staging.mjs';

test('remote staging proof client passes against actual local HTTP workerd runtime', async () => {
  const storage = await mkdtemp(join(tmpdir(), 'brain-proof-'));
  const key = 'synthetic-intake-proof-'.repeat(4); const operator = 'synthetic-operator-proof-'.repeat(4); const commit = 'a'.repeat(40);
  const mf = new Miniflare({ name: 'archelaos-brain-proof', modules: true, scriptPath: resolve('src/worker.mjs'), compatibilityDate: '2026-07-30', durableObjects: { BRAIN: { className: 'BrainCoordinator', useSQLite: true } }, durableObjectsPersist: storage, bindings: { ENVIRONMENT: 'staging', DEPLOY_SHA: commit, STAGING_EXPIRES_AT: new Date(Date.now() + 3600000).toISOString(), STAGING_INTAKE_KEY: key, STAGING_OPERATOR_KEY: operator, STAGING_SHORT_RETRIES: 'true' } });
  try {
    const origin = String(await mf.ready);
    const proof = await proveStaging(origin, key, operator, commit);
    assert.equal(proof.logicalJobsAdded, 4); assert.equal(proof.aiProviderCalls, 0);
    assert.equal(proof.providerDeploymentVerified, false);
    await assert.rejects(proveStaging('https://foreign.example/', key, operator, commit));
  } finally { await mf.dispose(); await rm(storage, { recursive: true, force: true }); }
});
