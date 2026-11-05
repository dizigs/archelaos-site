/** Assert 6 exact clean read-only source checkouts; 4 real merges + 2 open heads. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const root=process.env.ACCEPTANCE_SOURCE_DIR;
if(!root)throw Error('Missing ACCEPTANCE_SOURCE_DIR');
const config=JSON.parse(readFileSync(new URL('./sources.json',import.meta.url),'utf8'));
assert.equal(config.schemaVersion,2);
assert.equal(config.repository,'dizigs/archelaos-site');
assert.deepEqual(Object.keys(config.sources).sort(),['gemini','gemma','integration','provenance','scaffold','testing']);
for(const [name,pin] of Object.entries(config.sources)){
  assert.ok(Number.isSafeInteger(pin.pr)&&pin.pr>0);
  assert.match(pin.sha,/^[a-f0-9]{40}$/);
  assert.match(pin.headSha,/^[a-f0-9]{40}$/);
  assert.ok(['merged','open'].includes(pin.state));
  const cwd=resolve(root,name);
  const head=execFileSync('git',['rev-parse','HEAD'],{cwd,encoding:'utf8'}).trim();
  assert.equal(head,pin.sha,'Mismatch in immutable source '+name);
  assert.equal(execFileSync('git',['status','--porcelain'],{cwd,encoding:'utf8'}).trim(),'','Dirty '+name);
  console.log('PIN PASS',name,'#'+pin.pr,pin.state,pin.sha);
}
