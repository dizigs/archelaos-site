import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectFile, inspectMcpConfiguration, runDoctor } from './mcp-doctor.mjs';

const github = 'https://api.githubcopilot.com/mcp/x/all/readonly';
const cloudflare = 'https://mcp.cloudflare.com/mcp';

test('example configuration remains disabled and provides no authentication claims', () => {
  const diagnosis = runDoctor();
  assert.equal(diagnosis.inspection, 'EXAMPLE_ONLY');
  assert.equal(diagnosis.liveEndpointChecked, false);
  assert.equal(diagnosis.oauthVerified, false);
  assert.equal(diagnosis.providerPermissionsVerified, false);
  assert.equal(diagnosis.providers.length, 2);
  assert.ok(diagnosis.providers.every(x => x.status === 'PREPARED_DISABLED'));
  assert.ok(diagnosis.providers.every(x => !x.authenticated && !x.verified));
});

test('locally enabled entries are still unverified, not claimed installed or authenticated', () => {
  const diagnosis = inspectMcpConfiguration({mcpServers: {
    'github-readonly': {serverUrl: github, disabled: false},
    'cloudflare-api': {serverUrl: cloudflare, disabled: false},
  }});
  assert.ok(diagnosis.every(x => x.status === 'CONFIGURED_UNVERIFIED'));
  assert.ok(diagnosis.every(x => x.authenticated === false && x.verified === false));
});

test('endpoint mismatch and missing servers are surfaced, never auto-corrected', () => {
  const diagnosis = inspectMcpConfiguration({mcpServers: {
    'github-readonly': {serverUrl: 'https://evil.example/mcp', disabled: false},
  }});
  assert.deepEqual(diagnosis.map(x=>x.status), ['ENDPOINT_MISMATCH','NOT_CONFIGURED']);
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
      [new URL('./mcp-doctor.mjs', import.meta.url).pathname, '--config', filename],
      {encoding: 'utf8'});
    assert.equal(executed.status, 0, executed.stderr);
    assert.doesNotMatch(executed.stdout + executed.stderr, /SYNTHETIC_SECRET_VALUE/);
  } finally { rmSync(dir, {recursive:true,force:true}); }
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
    assert.throws(() => inspectFile(link), /ELOOP|symbolic link/i);
  } finally { rmSync(dir, {recursive:true,force:true}); }
});
