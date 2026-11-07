import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const source = rel => readFileSync(new URL(rel, import.meta.url), 'utf8');
const brain = source('../src/worker.mjs');
const healer = source('../../automation/self-heal-worker/src/worker.mjs');
const acceptance = source('../src/private_hmac_candidate.mjs');
const brainConfig = source('../wrangler.toml');
const healerConfig = source('../../automation/self-heal-worker/wrangler.toml');

test('named HMAC acceptance classes re-export existing protocol in both Workers', () => {
  assert.ok(brain.includes("export { BrainHmacAcceptancePort, PrivateHmacNonceStore } from './private_hmac_candidate.mjs';"));
  assert.ok(healer.includes("export { HealerHmacAcceptancePort, PrivateHmacNonceStore } from '../../../brain/src/private_hmac_candidate.mjs';"));
  assert.match(acceptance, /export class BrainHmacAcceptancePort extends WorkerEntrypoint/);
  assert.match(acceptance, /export class HealerHmacAcceptancePort extends WorkerEntrypoint/);
  assert.match(acceptance, /export class PrivateHmacNonceStore extends DurableObject/);
});
test('HMAC QA namespaces and named peer are constrained, distinct and remain disabled by default', () => {
  for (const [config,role,canonical,canonicalClass] of [
    [brainConfig,'brain','BRAIN','BrainCoordinator'],
    [healerConfig,'healer','HEALER_MEMORY','HealerMemory']
  ]) {
    assert.match(config, new RegExp('^PRIVATE_HMAC_ACCEPTANCE_ISOLATED = "false"$','m'));
    assert.match(config, new RegExp('^PRIVATE_HMAC_ACCEPTANCE_ROLE = "'+role+'"$','m'));
    assert.match(config, /^PRIVATE_HMAC_ACCEPTANCE_SESSION = ""$/m);
    assert.match(config, /^PRIVATE_HMAC_ACCEPTANCE_APPROVED_SHA = "0{40}"$/m);
    assert.match(config, /^DEPLOY_SHA = "0{40}"$/m);
    assert.match(config, /^PRIVATE_HMAC_ACCEPTANCE_STARTED_AT = "1970-01-01T00:00:00Z"$/m);
    assert.match(config, /^PRIVATE_HMAC_ACCEPTANCE_EXPIRES_AT = "1970-01-01T00:00:00Z"$/m);
    assert.match(config, /^name = "HMAC_NONCES"\nclass_name = "PrivateHmacNonceStore"$/m);
    assert.match(config, new RegExp('^name = "'+canonical+'"\\nclass_name = "'+canonicalClass+'"$', 'm'));
    assert.equal((config.match(/^name = "HMAC_NONCES"$/gm)||[]).length,1);
    assert.equal((config.match(/^new_sqlite_classes = \["PrivateHmacNonceStore"\]$/gm)||[]).length,1);
    assert.match(config, /^workers_dev = false$/m);
    assert.match(config, /^preview_urls = false$/m);
    assert.doesNotMatch(config, /^routes\s*=|^\[triggers\]|^crons\s*=/m);
  }
  assert.match(brainConfig, /binding = "HMAC_PEER"\nservice = "archelaos-self-heal"\nentrypoint = "HealerHmacAcceptancePort"/);
  assert.equal((brainConfig.match(/^binding = "HMAC_PEER"$/gm)||[]).length,1);
  assert.doesNotMatch(healerConfig,/HMAC_PEER|BrainHmacAcceptancePort/);
  for (const flag of ['BRAIN_SELFHEAL_RECOVERY_ENABLED','BRAIN_SELFHEAL_BINDING_ATTESTED',
      'BRAIN_SELFHEAL_DISPATCH_ENABLED','BRAIN_SELFHEAL_DURABLE_ACK_ENABLED'])
    assert.match(brainConfig,new RegExp('^'+flag+' = "false"$','m'));
  assert.match(brainConfig,/^STAGING_EXPIRES_AT = "1970-01-01T00:00:00Z"$/m);
  assert.match(healerConfig,/^HEALER_DURABLE_ACK_ENABLED = "false"$/m);
  assert.ok(healer.includes('async fetch() {'));
});
