'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {readEvidence} = require('../prepare_handoff.cjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archelaos-ads-evidence-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  const file = path.join(root, 'evidence.json');fs.writeFileSync(file,'{"synthetic":"approved"}');
  return {root,file};
}
test('ordinary reviewed fixture JSON remains readable', t=>{
  const f=fixture(t);assert.deepEqual(readEvidence(f.file),{synthetic:'approved'});
});
test('symlinked and hardlinked evidence cannot masquerade as ordinary input', t=>{
  const f=fixture(t), link=path.join(f.root,'link.json'), hard=path.join(f.root,'hard.json');
  fs.symlinkSync(f.file,link);fs.linkSync(f.file,hard);
  for(const name of [link,hard]) assert.throws(()=>readEvidence(name));
});
test('pathname replacement after inspection cannot change the checked inode', t=>{
  const f=fixture(t), savedStat=fs.statSync, savedFstat=fs.fstatSync;let swapped=false;
  const swap=()=>{if(!swapped){swapped=true;fs.renameSync(f.file,path.join(f.root,'held.json'));fs.writeFileSync(f.file,'{"synthetic":"unapproved"}');}};
  fs.statSync=(...args)=>{const value=savedStat(...args);swap();return value;};
  fs.fstatSync=(...args)=>{const value=savedFstat(...args);swap();return value;};
  let result;
  try {try {result=readEvidence(f.file);} catch {result=null;}}
  finally {fs.statSync=savedStat;fs.fstatSync=savedFstat;}
  if(result) assert.deepEqual(result,{synthetic:'approved'});
});
test('growth after inspection stays bounded and is rejected', t=>{
  const f=fixture(t), savedStat=fs.statSync, savedFstat=fs.fstatSync;let changed=false;
  const grow=()=>{if(!changed){changed=true;fs.writeFileSync(f.file,JSON.stringify({padding:'x'.repeat(1100000)}));}};
  fs.statSync=(...args)=>{const value=savedStat(...args);grow();return value;};
  fs.fstatSync=(...args)=>{const value=savedFstat(...args);grow();return value;};
  try {assert.throws(()=>readEvidence(f.file));}
  finally {fs.statSync=savedStat;fs.fstatSync=savedFstat;}
});
