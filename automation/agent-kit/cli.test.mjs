import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import {
  createReceipt, isSafeEvidence, run, validateEvents, validateRegistry,
} from './cli.mjs';

const registry = validateRegistry(JSON.parse(readFileSync(new URL('./registry.json', import.meta.url), 'utf8')));
const evidence = 'https://github.com/dizigs/archelaos-site/actions/runs/42284982522';
const proofTime = '2026-11-07T07:30:00.000Z';
const ref = 'a'.repeat(40);

test('registry is parseable with distinct IDs and explicit rollout states', () => {
  assert.ok(registry.tools.length >= 15);
  assert.equal(registry.policy.maxSharedAIMonthlyEUR, 20);
  assert.equal(registry.policy.localLogIsNotCloudSynced, true);
  assert.ok(registry.tools.find(t => t.id === 'antigravity-managed' && t.state === 'paused'));
  assert.ok(registry.tools.find(t => t.id === 'github-mcp' && t.state === 'candidate'));
});

test('all tools have bounded commands and evidence and no raw keys', () => {
  const ids = registry.tools.map(t => t.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(registry.tools.every(t => t.evidence.length && t.commands.length));
  assert.doesNotMatch(JSON.stringify(registry), /AIza[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}/);
});

test('CLI can inspect known tools without running third-party commands', () => {
  const shown = run(['show', 'github'], registry);
  assert.equal(shown.id, 'github');
  assert.ok(run(['commands', 'github'], registry).commands.length);
  assert.ok(run(['list'], registry).some(t => t.id === 'gemini-api'));
  assert.throws(() => run(['show', 'no-tool'], registry), /USAGE/);
});

test('only clean repository evidence links are accepted in command receipts', () => {
  assert.equal(isSafeEvidence(evidence), true);
  for (const url of [
    'https://evil.example/actions/runs/1', 'http://github.com/dizigs/archelaos-site/actions',
    'https://github.com/dizigs/archelaos-site/actions?token=x',
    'https://other.example/dizigs/archelaos-site/actions',
  ]) assert.equal(isSafeEvidence(url), false);
});

test('receipt hash chain verifies and detects tampering', () => {
  const a = createReceipt({ registry, toolId: 'github', commandId: 'checks', outcome: 'PASS', evidence, ref, at: proofTime });
  const b = createReceipt({ registry, toolId: 'gemini-api', commandId: 'inspect', outcome: 'UNKNOWN', evidence, prevHash: a.hash, at: proofTime });
  const log = JSON.stringify(a) + '\n' + JSON.stringify(b) + '\n';
  assert.deepEqual(validateEvents(log, registry), { count: 2, lastHash: b.hash, lastAt: proofTime });
  assert.throws(() => validateEvents(log.replace('"PASS"', '"FAIL"'), registry), /LOG_CHAIN_BROKEN/);
  assert.throws(() => validateEvents(JSON.stringify(b) + '\n', registry), /LOG_RECEIPT_INVALID/);
});

test('receipt rejects fake tool, arbitrary commands and references', () => {
  assert.throws(() => createReceipt({ registry, toolId: 'not-real', commandId: 'checks', outcome: 'PASS', evidence }), /RECEIPT_INPUT_INVALID/);
  assert.throws(() => createReceipt({ registry, toolId: 'github', commandId: 'deploy', outcome: 'PASS', evidence }), /RECEIPT_INPUT_INVALID/);
  assert.throws(() => createReceipt({ registry, toolId: 'github', commandId: 'checks', outcome: 'PASS', evidence, ref: 'not-sha' }), /RECEIPT_INPUT_INVALID/);
});

test('registry validator rejects duplicates and missing safe policy', () => {
  const dup = structuredClone(registry);
  dup.tools.push(structuredClone(dup.tools[0]));
  assert.throws(() => validateRegistry(dup), /REGISTRY_TOOL_INVALID/);
  const unsafe = structuredClone(registry);
  unsafe.policy.noAutomaticMerge = false;
  assert.throws(() => validateRegistry(unsafe), /REGISTRY_SAFETY_POLICY_MISSING/);
});

test('Antigravity MCP example is disabled and secret-free', () => {
  const sample = JSON.parse(readFileSync(new URL('./mcp_config.example.json', import.meta.url), 'utf8'));
  const entries = Object.values(sample.mcpServers);
  assert.equal(entries.length, 2);
  assert.ok(entries.every(entry => entry.disabled === true));
  assert.ok(entries.every(entry => Object.keys(entry).sort().join(',') === 'disabled,serverUrl'));
  assert.ok(entries.every(entry => entry.serverUrl.startsWith('https://')));
  assert.doesNotMatch(JSON.stringify(sample), /Authorization|Bearer |AIza|token|secret/i);
});

test('record uses same descriptor and never follows a replacement log symlink', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archelaos-agentkit-test-'));
  try {
    copyFileSync(new URL('./cli.mjs', import.meta.url), join(dir, 'cli.mjs'));
    copyFileSync(new URL('./registry.json', import.meta.url), join(dir, 'registry.json'));
    try { copyFileSync(new URL('./private-io.mjs', import.meta.url), join(dir, 'private-io.mjs')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const execute = (...args) => spawnSync(process.execPath, [join(dir, 'cli.mjs'), ...args], { encoding: 'utf8' });
    const args = ['record', 'github', 'checks', 'PASS', '--evidence',
      'https://github.com/dizigs/archelaos-site/actions/runs/42344875512'];
    const first = execute(...args);
    assert.equal(first.status, 0, first.stderr);
    const second = execute(...args);
    assert.equal(second.status, 0, second.stderr);
    const checked = execute('verify');
    assert.equal(checked.status, 0, checked.stderr);
    assert.equal(JSON.parse(checked.stdout).localLog.count, 2);

    // Attacker-controlled local symlink must not redirect append into another file.
    const log = join(dir, '.private', 'activity.jsonl');
    const target = join(dir, 'outside-file.txt');
    writeFileSync(target, 'KEEP-INTACT\n');
    rmSync(log);
    symlinkSync(target, log);
    const rejected = execute(...args);
    assert.notEqual(rejected.status, 0);
    assert.equal(readFileSync(target, 'utf8'), 'KEEP-INTACT\n');
    assert.match(rejected.stderr, /ELOOP|symbolic link|AGENT_KIT_ERROR/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function isolatedCli() {
  const dir=mkdtempSync(join(tmpdir(),'agent-kit regression '));
  for(const name of ['cli.mjs','registry.json','private-io.mjs']) {
    try {copyFileSync(new URL(name,import.meta.url),join(dir,name));}
    catch(error){if(name!=='private-io.mjs'||error.code!=='ENOENT')throw error;}
  }
  return {dir,args:['record','github','checks','PASS','--evidence',evidence],
    execute(...args){return spawnSync(process.execPath,[join(dir,'cli.mjs'),...args],{encoding:'utf8',timeout:5000})},
    close(){rmSync(dir,{recursive:true,force:true})}};
}
test('null and scalar audit records fail with a stable receipt error',()=>{
  for(const text of ['null','[]','1','true','"receipt"'])assert.throws(()=>validateEvents(text,registry),/LOG_RECEIPT_INVALID/);
});
test('append preserves the accepted final record when its newline is missing',()=>{
  const f=isolatedCli();try {
    assert.equal(f.execute(...f.args).status,0);
    const path=join(f.dir,'.private','activity.jsonl');
    writeFileSync(path,readFileSync(path,'utf8').trimEnd(),{mode:0o600});
    assert.equal(f.execute('verify').status,0);
    const written=f.execute(...f.args);assert.equal(written.status,0,written.stderr);
    const checked=f.execute('verify');assert.equal(checked.status,0,checked.stderr);
    assert.equal(JSON.parse(checked.stdout).localLog.count,2);
  }finally{f.close()}
});
test('record and verify reject a redirected private directory without changing the target',()=>{
  const f=isolatedCli();try {
    const outside=join(f.dir,'outside');mkdirSync(outside,{mode:0o700});
    const receipt=createReceipt({registry,toolId:'github',commandId:'checks',outcome:'PASS',evidence});
    const text=JSON.stringify(receipt)+'\n';writeFileSync(join(outside,'activity.jsonl'),text,{mode:0o600});
    symlinkSync(outside,join(f.dir,'.private'),'dir');
    const checked=f.execute('verify'),written=f.execute(...f.args);
    assert.notEqual(checked.status,0,'verify must not consume receipts from a symlinked directory');
    assert.notEqual(written.status,0,'record must not append outside its held private directory');
    assert.equal(readFileSync(join(outside,'activity.jsonl'),'utf8'),text);
  }finally{f.close()}
});
test('concurrent CLI writers serialize one verifiable receipt chain',async()=>{
  const f=isolatedCli();try {
    const results=await Promise.all(Array.from({length:8},()=>new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,[join(f.dir,'cli.mjs'),...f.args]);let error='';
      child.stderr.on('data',data=>{error+=data});child.on('error',reject);
      child.on('close',code=>resolve({code,error}));
    })));
    for(const r of results)assert.equal(r.code,0,r.error);
    const checked=f.execute('verify');assert.equal(checked.status,0,checked.stderr);
    assert.equal(JSON.parse(checked.stdout).localLog.count,8);
  }finally{f.close()}
});
test('kernel lock contention is explicit and process death safely releases the same lock inode',async()=>{
  const f=isolatedCli();let holder;
  try {
    assert.equal(f.execute(...f.args).status,0);
    const lock=join(f.dir,'.private','activity.lock'),inode=statSync(lock).ino;
    const fixture=join(f.dir,'lock-holder.mjs');
    copyFileSync(new URL('./fixtures/lock-holder.mjs',import.meta.url),fixture);
    holder=spawn(process.execPath,[fixture]);
    await new Promise((resolve,reject)=>{
      holder.stdout.once('data',data=>String(data).includes('LOCK_READY')?resolve():reject(Error('lock fixture failed')));
      holder.once('error',reject);holder.once('exit',()=>reject(Error('lock fixture exited before ready')));
    });
    const blocked=f.execute(...f.args);assert.equal(blocked.status,1);assert.match(blocked.stderr,/AUDIT_LOCK_BUSY/);
    const exited=new Promise(resolve=>holder.once('close',resolve));holder.kill('SIGKILL');await exited;
    const written=f.execute(...f.args);assert.equal(written.status,0,written.stderr);
    assert.equal(statSync(lock).ino,inode,'must never unlink/recreate a lock to recover it');
    assert.equal(JSON.parse(f.execute('verify').stdout).localLog.count,2);
  }finally{if(holder?.exitCode===null&&holder?.signalCode===null)holder.kill('SIGKILL');f.close()}
});
test('hardlinked receipt files are rejected without modifying either alias',()=>{
  const f=isolatedCli();try {
    assert.equal(f.execute(...f.args).status,0);const log=join(f.dir,'.private','activity.jsonl');
    const before=readFileSync(log,'utf8');linkSync(log,join(f.dir,'outside-alias'));
    assert.notEqual(f.execute('verify').status,0);assert.notEqual(f.execute(...f.args).status,0);
    assert.equal(readFileSync(log,'utf8'),before);
  }finally{f.close()}
});
test('unmarked legacy lock is never guessed stale or removed while a writer may own it',()=>{
  const f=isolatedCli();try {
    assert.equal(f.execute(...f.args).status,0);
    const lock=join(f.dir,'.private','activity.lock'),log=join(f.dir,'.private','activity.jsonl');
    const before=readFileSync(log,'utf8');writeFileSync(lock,'',{mode:0o600});
    const rejected=f.execute(...f.args);assert.equal(rejected.status,1);
    assert.match(rejected.stderr,/AUDIT_LOCK_PROTOCOL_UNVERIFIED/);
    assert.equal(readFileSync(lock,'utf8'),'');assert.equal(readFileSync(log,'utf8'),before);
  }finally{f.close()}
});
test('directory replacement after open cannot redirect an audit append',()=>{
  const f=isolatedCli();try {
    const outside=join(f.dir,'outside');mkdirSync(outside,{mode:0o700});
    const previous=JSON.stringify(createReceipt({registry,toolId:'github',commandId:'checks',outcome:'PASS',evidence,at:proofTime}))+'\n';
    writeFileSync(join(outside,'activity.jsonl'),previous,{mode:0o600});
    const fixture=join(f.dir,'swap-fixture.mjs');
    copyFileSync(new URL('./fixtures/dir-swap.mjs',import.meta.url),fixture);
    const result=spawnSync(process.execPath,[fixture],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.equal(readFileSync(join(outside,'activity.jsonl'),'utf8'),previous);
    assert.equal(validateEvents(readFileSync(join(f.dir,'held-private','activity.jsonl'),'utf8'),registry).count,1);
  }finally{f.close()}
});
test('verify cannot report an existing audit log empty when descriptor paths disappear',()=>{
  const f=isolatedCli();try {
    assert.equal(f.execute(...f.args).status,0);
    const log=join(f.dir,'.private','activity.jsonl'),before=readFileSync(log,'utf8');
    const fixture=join(f.dir,'proc-fixture.mjs');
    copyFileSync(new URL('./fixtures/proc-fd-missing.mjs',import.meta.url),fixture);
    for(const mode of ['before-private','after-private','at-log-open']) {
      writeFileSync(join(f.dir,'descriptor-mode.txt'),mode,{mode:0o600});
      const r=spawnSync(process.execPath,[fixture],{encoding:'utf8'});
      assert.equal(r.status,1,'descriptor path failure must not become an empty valid log: '+mode);
      assert.match(r.stderr,/DESCRIPTOR_PATHS_UNAVAILABLE/);
      assert.equal(readFileSync(log,'utf8'),before);
    }
  }finally{f.close()}
});
