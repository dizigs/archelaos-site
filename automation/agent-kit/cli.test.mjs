import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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
