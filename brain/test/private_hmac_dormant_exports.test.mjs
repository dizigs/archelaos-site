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
  assert.match(brain, /^export \\{ BrainHmacAcceptancePort, PrivateHmacNonceStore \\} from '\\.\\/private_hmac_candidate\\.mjs';$/m);
  assert.match(healer, /^export \\{ HealerHmacAcceptancePort, PrivateHmacNonceStore \\} from '\\.\\.\\/\\.\\.\\/\\.\\.\\/brain\\/src\\/private_hmac_candidate\\.mjs';$/m);
  assert.match(acceptance, /export class BrainHmacAcceptancePort extends WorkerEntrypoint/);
  assert.match(acceptance, /export class HealerHmacAcceptancePort extends WorkerEntrypoint/);
  assert.match(acceptance, /export class PrivateHmacNonceStore extends DurableObject/);
});
test('code-only exports do not install QA bindings, acceptance permit, routes or recovery', () => {
  assert.doesNotMatch(brainConfig, /HMAC_PEER|HMAC_NONCES|PRIVATE_HMAC_ACCEPTANCE_/);
  assert.doesNotMatch(healerConfig, /HMAC_PEER|HMAC_NONCES|PRIVATE_HMAC_ACCEPTANCE_/);
  for (const flag of ['BRAIN_SELFHEAL_RECOVERY_ENABLED','BRAIN_SELFHEAL_BINDING_ATTESTED',
      'BRAIN_SELFHEAL_DISPATCH_ENABLED','BRAIN_SELFHEAL_DURABLE_ACK_ENABLED'])
    assert.match(brainConfig, new RegExp('^'+flag+' = "false"$', 'm'));
  assert.match(healerConfig, /^HEALER_DURABLE_ACK_ENABLED = "false"$/m);
  for (const c of [brainConfig,healerConfig]) {
    assert.match(c, /^workers_dev = false$/m);
    assert.match(c, /^preview_urls = false$/m);
  }
  assert.match(brainConfig, /^STAGING_EXPIRES_AT = "1970-01-01T00:00:00Z"$/m);
  assert.match(healer, /async fetch\\(\\) \\{/);
});
