/**
 * Verify that every external source checkout is exactly the recorded PR head.
 * Read-only local git inspection; no network calls or mutable GitHub operations.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.env.ACCEPTANCE_SOURCE_DIR;
if (!root) throw Error('Missing ACCEPTANCE_SOURCE_DIR');
const manifest = JSON.parse(readFileSync(new URL('./sources.json', import.meta.url), 'utf8'));
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.repository, 'dizigs/archelaos-site');
assert.deepEqual(Object.keys(manifest.sources).sort((a, b) => a.localeCompare(b)), [
  'gemini', 'gemma', 'integration', 'scaffold', 'testing'
]);
for (const [name, pin] of Object.entries(manifest.sources)) {
  assert.ok(Number.isSafeInteger(pin.pr) && pin.pr > 0, 'Invalid source PR');
  assert.match(pin.sha, /^[a-f0-9]{40}$/, 'Invalid pinned SHA');
  const cwd = resolve(root, name);
  const actual = execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  assert.equal(actual, pin.sha, 'PR #' + pin.pr + ' checkout does not match pinned SHA');
  const dirty = execFileSync('/usr/bin/git', ['status', '--porcelain'], { cwd, encoding: 'utf8' }).trim();
  assert.equal(dirty, '', 'Source checkout mutated: ' + name);
  console.log('verified PR #' + pin.pr + ' ' + name + ' ' + actual);
}
console.log('PASS: five exact-head source pins verified; NO credentials, network calls or AI inference');
