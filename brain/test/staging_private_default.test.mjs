import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const config = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');

// This guard applies to source defaults; actual Cloudflare staging deployments
// still require independent readback of their active settings and bindings.
test('Brain staging has no public workers.dev or preview endpoints by default', () => {
  assert.match(config, /^workers_dev\s*=\s*false\s*$/m);
  assert.match(config, /^preview_urls\s*=\s*false\s*$/m);
  assert.doesNotMatch(config, /^\[\[?(?:routes?|triggers)\]?\]/m);
});

test('Brain staging is expired and unpinned until an operator-reviewed release', () => {
  assert.match(config, /^STAGING_EXPIRES_AT\s*=\s*"1970-01-01T00:00:00Z"\s*$/m);
  assert.match(config, /^DEPLOY_SHA\s*=\s*"0{40}"\s*$/m);
  assert.match(config, /^ENVIRONMENT\s*=\s*"staging"\s*$/m);
  assert.doesNotMatch(config, /^BRAIN_(?:PRIVATE_\w+|EXECUTION_ADMISSION)\s*=\s*["']?(?:true|enabled)/m);
});
