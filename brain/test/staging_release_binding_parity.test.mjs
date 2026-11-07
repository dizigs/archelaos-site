import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

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
  // Only the approved default Healer and narrow QA named-port links may exist.
  // Both are private; the QA permit is disabled and the canonical recovery gate stays OFF.
  // Use real TOML parsing: a valid inline-comment header must not be ignored.
  const services = (text) => {
    const p = spawnSync('python3', ['-c',
      'import json,sys,tomllib; print(json.dumps(tomllib.loads(sys.stdin.read()).get("services", [])))'],
      {input: text, encoding: 'utf8'});
    assert.equal(p.status, 0, 'TOML parser must succeed');
    return JSON.parse(p.stdout);
  };
  assert.deepEqual(services(config), [
    {binding:'HEALER',service:'archelaos-self-heal'},
    {binding:'HMAC_PEER',service:'archelaos-self-heal',entrypoint:'HealerHmacAcceptancePort'},
  ]);
  assert.match(config, /^PRIVATE_HMAC_ACCEPTANCE_ISOLATED\s*=\s*"false"\s*$/m);
  assert.match(config, /^PRIVATE_HMAC_ACCEPTANCE_EXPIRES_AT\s*=\s*"1970-01-01T00:00:00Z"\s*$/m);
  const extra = config + '\n[[services]] # legal inline comment\nbinding = "OTHER"\nservice = "other"\n';
  assert.equal(services(extra).length, 3);
  assert.doesNotMatch(config,/^\[\[routes\]\]/m);
  assert.doesNotMatch(config,/^\[triggers\]/m);
});
