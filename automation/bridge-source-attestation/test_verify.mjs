import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, mkdir, symlink, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sha256,validateManifest,verifyPrivate,verifyRepo} from './verify.mjs';

const source=Buffer.from('export const safe = 1;\n');
const changed=Buffer.from('export const safe = 2;\n');
const manifest=()=>({schema:'archelaos.bridge.deployed-source.v1',modules:[
  {name:'source.mjs',repo_path:'src/source.mjs',bytes:source.length,
    sha256:sha256(source),git_blob_sha1:'a'.repeat(40),repo_blob_sha1:'a'.repeat(40),repo_sha256:sha256(source)},
  {name:'legacy.js',repo_path:null,bytes:changed.length,
    sha256:sha256(changed),git_blob_sha1:'b'.repeat(40),repo_blob_sha1:null,repo_sha256:null}
]});
async function sandbox(fn) {
  const root=await mkdtemp(join(tmpdir(),'bridge-attest-'));
  try{return await fn(root);}finally{await rm(root,{recursive:true,force:true});}
}
test('reconciles exact public repo module and identifies private-only module',async()=>sandbox(async root=>{
  await mkdir(join(root,'src'));await writeFile(join(root,'src/source.mjs'),source);
  const r=await verifyRepo(root,manifest());
  assert.equal(r.status,'SOURCE_RECOVERY_BLOCKED');
  assert.deepEqual(r.records.map(v=>v.status),['EXACT_DEPLOYED_MATCH','NO_PUBLIC_REPO_COUNTERPART']);
}));
test('fail-closed when public repo baseline changes',async()=>sandbox(async root=>{
  await mkdir(join(root,'src'));await writeFile(join(root,'src/source.mjs'),changed);
  const r=await verifyRepo(root,manifest());
  assert.equal(r.status,'UNEXPECTED_REPO_DRIFT');
}));
test('privately exported complete source passes immutable hashes',async()=>sandbox(async root=>{
  await writeFile(join(root,'source.mjs'),source);
  await writeFile(join(root,'legacy.js'),changed);
  assert.equal((await verifyPrivate(root,manifest())).status,'ATTESTED_PRIVATE_COPY');
}));
test('private export missing one file fails without printing source',async()=>sandbox(async root=>{
  await writeFile(join(root,'source.mjs'),source);
  const r=await verifyPrivate(root,manifest());
  assert.equal(r.status,'BLOCKED');
  assert.deepEqual(r.records.map(v=>v.status),['MATCH','MISSING']);
}));
test('private export changed bytes fails',async()=>sandbox(async root=>{
  await writeFile(join(root,'source.mjs'),changed);
  await writeFile(join(root,'legacy.js'),changed);
  const r=await verifyPrivate(root,manifest());
  assert.equal(r.status,'BLOCKED');
  assert.equal(r.records[0].status,'CONTENT_MISMATCH');
}));
test('symlinked module is denied before reading',async()=>sandbox(async root=>{
  await writeFile(join(root,'legacy.js'),changed);
  await symlink(join(root,'legacy.js'),join(root,'source.mjs'));
  const r=await verifyPrivate(root,manifest());
  assert.equal(r.status,'BLOCKED');
  assert.equal(r.records[0].status,'SYMLINK_FORBIDDEN');
}));
test('manifest traversal, duplicate and invalid digest are denied',()=>{
  for(const name of ['../escape.js','/absolute.js','./module.js','a//b.mjs']){
    const m=manifest();m.modules[0].name=name;
    assert.throws(()=>validateManifest(m),/UNSAFE_MANIFEST_PATH/);
  }
  const d=manifest();d.modules.push({...d.modules[0]});
  assert.throws(()=>validateManifest(d),/INVALID_MANIFEST_ENTRY/);
  const h=manifest();h.modules[0].sha256='invalid';
  assert.throws(()=>validateManifest(h),/INVALID_MANIFEST_ENTRY/);
});
test('expected drift is explicit, never misclassified as a deploy match',async()=>sandbox(async root=>{
  const m=manifest();m.modules[0].repo_sha256=sha256(changed);
  await mkdir(join(root,'src'));await writeFile(join(root,'src/source.mjs'),changed);
  const r=await verifyRepo(root,m);
  assert.equal(r.status,'SOURCE_RECOVERY_BLOCKED');
  assert.equal(r.records[0].status,'EXPECTED_DEPLOYED_DRIFT');
}));

test('intermediate symlink cannot bypass handle-bound path verification',async()=>sandbox(async root=>{
  await mkdir(join(root,'real'));
  await writeFile(join(root,'real/source.mjs'),source);
  await writeFile(join(root,'legacy.js'),changed);
  await symlink(join(root,'real'),join(root,'alias'));
  const m=manifest();m.modules[0].name='alias/source.mjs';
  const r=await verifyPrivate(root,m);
  assert.equal(r.status,'BLOCKED');
  assert.equal(r.records[0].status,'SYMLINK_FORBIDDEN');
}));
test('oversized modules are rejected by bounded descriptor reads',async()=>sandbox(async root=>{
  await writeFile(join(root,'source.mjs'),Buffer.alloc(262145,97));
  await writeFile(join(root,'legacy.js'),changed);
  const r=await verifyPrivate(root,manifest());
  assert.equal(r.status,'BLOCKED');
  assert.equal(r.records[0].status,'INVALID_MODULE_FILE');
}));
