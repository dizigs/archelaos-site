import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspectFile, inspectMcpConfiguration, runDoctor } from './mcp-doctor.mjs';

const github = 'https://api.githubcopilot.com/mcp/x/all/readonly';
const cloudflare = 'https://mcp.cloudflare.com/mcp';

test('example configuration remains disabled and provides no authentication claims', () => {
  const diagnosis = runDoctor();
  assert.equal(diagnosis.inspection, 'EXAMPLE_ONLY');
  assert.equal(diagnosis.liveEndpointChecked, false);
  assert.equal(diagnosis.oauthVerified, false);
  assert.equal(diagnosis.providerPermissionsVerified, false);
  assert.equal(diagnosis.providers.length, 4);
  assert.deepEqual(diagnosis.providers.map(x=>x.status), ['PREPARED_DISABLED','PREPARED_DISABLED','NOT_CONFIGURED','NOT_CONFIGURED']);
  assert.ok(diagnosis.providers.every(x => !x.authenticated && !x.verified));
});

test('locally enabled entries are still unverified, not claimed installed or authenticated', () => {
  const diagnosis = inspectMcpConfiguration({mcpServers: {
    'github-readonly': {serverUrl: github, disabled: false},
    'cloudflare-api': {serverUrl: cloudflare, disabled: false},
  }});
  assert.deepEqual(diagnosis.map(x=>x.status), ['CONFIGURED_UNVERIFIED','CONFIGURED_UNVERIFIED','NOT_CONFIGURED','NOT_CONFIGURED']);
  assert.ok(diagnosis.every(x => x.authenticated === false && x.verified === false));
});

test('endpoint mismatch and missing servers are surfaced, never auto-corrected', () => {
  const diagnosis = inspectMcpConfiguration({mcpServers: {
    'github-readonly': {serverUrl: 'https://evil.example/mcp', disabled: false},
  }});
  assert.deepEqual(diagnosis.map(x=>x.status), ['ENDPOINT_MISMATCH','NOT_CONFIGURED','NOT_CONFIGURED','NOT_CONFIGURED']);
});

test('unrelated secret values in local config are never displayed', () => {
  const marker = 'SYNTHETIC_SECRET_VALUE_DO_NOT_LOG_123';
  const dir = mkdtempSync(join(tmpdir(), 'agent-mcp-doctor-'));
  try {
    const filename = join(dir, 'mcp_config.json');
    writeFileSync(filename, JSON.stringify({mcpServers: {
      'github-readonly': {serverUrl: github, disabled: false, env: {TOKEN: marker}},
      'cloudflare-api': {serverUrl: cloudflare, disabled: true},
    }}));
    const report = runDoctor(['--config', filename]);
    assert.equal(report.inspection, 'EXPLICIT_LOCAL_CONFIG');
    assert.equal(report.providers[0].status, 'CONFIGURED_UNVERIFIED');
    assert.doesNotMatch(JSON.stringify(report), /SYNTHETIC_SECRET_VALUE/);
    const executed = spawnSync(process.execPath,
      [fileURLToPath(new URL('./mcp-doctor.mjs', import.meta.url)), '--config', filename],
      {encoding: 'utf8'});
    assert.equal(executed.status, 0, executed.stderr);
    assert.doesNotMatch(executed.stdout + executed.stderr, /SYNTHETIC_SECRET_VALUE/);
  } finally { rmSync(dir, {recursive:true,force:true}); }
});

test('omitted disabled means configured but unverified; invalid flag types never imply disabled',()=>{
  const report=inspectMcpConfiguration({mcpServers:{'github-readonly':{serverUrl:github}}});
  assert.equal(report[0].status,'CONFIGURED_UNVERIFIED');assert.equal(report[0].authenticated,false);
  for(const disabled of ['false',null,1])assert.equal(inspectMcpConfiguration({mcpServers:{'github-readonly':{serverUrl:github,disabled}}})[0].status,'ENTRY_INVALID');
});
test('FIFO config is rejected promptly rather than blocking a private reader',()=>{
  const dir=mkdtempSync(join(tmpdir(),'agentkit-fifo-'));try {
    const filename=join(dir,'pipe');const made=spawnSync('/usr/bin/mkfifo',[filename]);assert.equal(made.status,0);
    const r=spawnSync(process.execPath,[fileURLToPath(new URL('./mcp-doctor.mjs',import.meta.url)),'--config',filename],{encoding:'utf8',timeout:1200});
    assert.equal(r.error,undefined,'non-regular config must not hang');assert.equal(r.status,1);
    assert.match(r.stderr,/NOT_REGULAR_FILE/);
  }finally{rmSync(dir,{recursive:true,force:true})}
});
test('unsupported nofollow platform fails before reading even a regular config',()=>{
  const dir=mkdtempSync(join(tmpdir(),'agentkit-platform-'));try {
    const filename=join(dir,'config.json');writeFileSync(filename,'{"mcpServers":{}}');
    const script=`Object.defineProperty(process,'platform',{value:'win32'});const {inspectFile}=await import(${JSON.stringify(new URL('./mcp-doctor.mjs',import.meta.url).href)});try{inspectFile(process.argv[1]);process.exitCode=0}catch{console.error('FILESYSTEM_SAFETY_UNAVAILABLE');process.exitCode=1}`;
    const r=spawnSync(process.execPath,['--input-type=module','-e',script,filename],{encoding:'utf8'});
    assert.equal(r.status,1);assert.match(r.stderr,/FILESYSTEM_SAFETY_UNAVAILABLE/);
  }finally{rmSync(dir,{recursive:true,force:true})}
});
test('oversized config fails before an unbounded read',()=>{
  const dir=mkdtempSync(join(tmpdir(),'agentkit-large-'));try {
    const filename=join(dir,'config.json');writeFileSync(filename,' '.repeat(65536)+'{}');
    const script=`import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';const {inspectFile}=await import(${JSON.stringify(new URL('./mcp-doctor.mjs',import.meta.url).href)});fs.readFileSync=()=>{throw Error('UNBOUNDED_READ_USED')};syncBuiltinESMExports();try{inspectFile(process.argv[1]);process.exitCode=2}catch(e){console.error(e.message);process.exitCode=1}`;
    const r=spawnSync(process.execPath,['--input-type=module','-e',script,filename],{encoding:'utf8'});
    assert.equal(r.status,1);assert.match(r.stderr,/TOO_LARGE/);assert.doesNotMatch(r.stderr,/UNBOUNDED_READ_USED/);
  }finally{rmSync(dir,{recursive:true,force:true})}
});

test('invalid configuration and CLI arguments fail closed', () => {
  assert.throws(() => inspectMcpConfiguration({}), /MCP_SERVERS_MISSING/);
  assert.throws(() => inspectMcpConfiguration({mcpServers: []}), /MCP_SERVERS_MISSING/);
  assert.throws(() => runDoctor(['--config']), /USAGE/);
});

test('local config symlink is not followed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-mcp-symlink-'));
  try {
    const target = join(dir, 'target.json');
    const link = join(dir, 'link.json');
    writeFileSync(target, JSON.stringify({mcpServers: {}}));
    symlinkSync(target, link);
    assert.throws(() => inspectFile(link), /ELOOP|symbolic link|FILESYSTEM_SAFETY_UNAVAILABLE/i);
  } finally { rmSync(dir, {recursive:true,force:true}); }
});
