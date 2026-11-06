import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const config=readFileSync(fileURLToPath(new URL('../wrangler.toml', import.meta.url)), 'utf8');
const section=(name)=>config.match(new RegExp('^\\['+name+'\\]\\s*$([\\s\\S]*?)(?=^\\[|$(?![\\s\\S]))','m'))?.[1]||'';

test('GitHub App public identifiers are pinned; no private key is stored in Wrangler',()=>{
  const vars=section('vars');
  assert.match(vars,/^BRAIN_GITHUB_APP_ID\s*=\s*"5641216"\s*$/m);
  assert.match(vars,/^BRAIN_GITHUB_APP_INSTALLATION_ID\s*=\s*"179225349"\s*$/m);
  assert.doesNotMatch(config,/^BRAIN_GITHUB_APP_PRIVATE_KEY\s*=/m);
  assert.doesNotMatch(config,/^BRAIN_GITHUB_READ_TOKEN\s*=/m);
});

test('original live AI and canonical BrainCoordinator Durable Object bindings are retained',()=>{
  assert.match(config,/^\[ai\]\s*\nbinding\s*=\s*"AI"/m);
  assert.match(config,/^\[\[durable_objects\.bindings\]\]\s*\nname\s*=\s*"BRAIN"\s*\nclass_name\s*=\s*"BrainCoordinator"/m);
  assert.match(config,/^\[\[migrations\]\]\s*\ntag\s*=\s*"brain-staging-v1"\s*\nnew_sqlite_classes\s*=\s*\["BrainCoordinator"\]/m);
});

test('unapproved release stays non-public, expired, with all execution gates OFF',()=>{
  assert.match(config,/^name\s*=\s*"archelaos-brain-staging"\s*$/m);
  assert.match(config,/^workers_dev\s*=\s*false\s*$/m);
  assert.match(config,/^preview_urls\s*=\s*false\s*$/m);
  assert.match(config,/^DEPLOY_SHA\s*=\s*"0{40}"\s*$/m);
  assert.match(config,/^STAGING_EXPIRES_AT\s*=\s*"1970-01-01T00:00:00Z"\s*$/m);
  assert.doesNotMatch(config,/^BRAIN_SELFHEAL_(?:RECOVERY_ENABLED|BINDING_ATTESTED|DISPATCH_ENABLED)\s*=\s*"true"\s*$/m);
  // Only the approved existing private service may be declared. Recovery still
  // needs independent live attestation, an approved SHA and unexpired staging.
  const links = [...config.matchAll(/^\[\[services\]\]\s*$([\s\S]*?)(?=^\[|$(?![\s\S]))/gm)];
  assert.equal(links.length, 1);
  assert.match(links[0][1], /^binding\s*=\s*"HEALER"\s*$/m);
  assert.match(links[0][1], /^service\s*=\s*"archelaos-self-heal"\s*$/m);
  assert.doesNotMatch(links[0][1], /^\s*(?:entrypoint|environment)\s*=/m);
  assert.doesNotMatch(config,/^\[\[routes\]\]/m);
  assert.doesNotMatch(config,/^\[triggers\]/m);
});
