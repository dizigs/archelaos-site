#!/usr/bin/env node
// Public-safe tool discovery + private, append-only local command receipt log.
// This is NOT a cloud event collector or a Brain authorization bypass.
import {
  appendFileSync, closeSync, constants, fsyncSync, mkdirSync,
  openSync, readFileSync, unlinkSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = join(HERE, 'registry.json');
const PRIVATE_DIR = join(HERE, '.private');
const EVENT_PATH = join(PRIVATE_DIR, 'activity.jsonl');
const LOCK_PATH = join(PRIVATE_DIR, 'activity.lock');
const GENESIS = '0'.repeat(64);
const STATES = new Set(['verified', 'reported', 'paused', 'candidate']);
const OUTCOMES = new Set(['PASS', 'FAIL', 'BLOCKED', 'UNKNOWN', 'SKIPPED']);
const MODES = new Set(['read', 'external-call', 'reference']);
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;

export function validateRegistry(data) {
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.tools) || !data.tools.length) {
    throw new Error('REGISTRY_SCHEMA_INVALID');
  }
  if (data.policy?.noSecrets !== true || data.policy?.noAutomaticMerge !== true ||
      data.policy?.noAutomaticDeploy !== true || data.policy?.localLogIsNotCloudSynced !== true) {
    throw new Error('REGISTRY_SAFETY_POLICY_MISSING');
  }
  const ids = new Set();
  for (const tool of data.tools) {
    if (!ID_PATTERN.test(tool.id ?? '') || ids.has(tool.id) ||
        typeof tool.name !== 'string' || !tool.name.trim() ||
        !STATES.has(tool.state) || !Array.isArray(tool.commands) || !tool.commands.length ||
        !Array.isArray(tool.evidence) || !tool.evidence.length) {
      throw new Error('REGISTRY_TOOL_INVALID');
    }
    ids.add(tool.id);
    const cmds = new Set();
    for (const command of tool.commands) {
      if (!ID_PATTERN.test(command.id ?? '') || cmds.has(command.id) ||
          typeof command.run !== 'string' || !command.run.trim() ||
          !MODES.has(command.mode)) {
        throw new Error('REGISTRY_COMMAND_INVALID');
      }
      cmds.add(command.id);
    }
    for (const link of tool.evidence) {
      if (!isSafeEvidence(link, false)) throw new Error('REGISTRY_EVIDENCE_INVALID');
    }
  }
  const encoded = JSON.stringify(data);
  if (/AIza[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}/.test(encoded)) {
    throw new Error('REGISTRY_POSSIBLE_SECRET');
  }
  return data;
}

export function isSafeEvidence(url, restrictToProject = true) {
  if (typeof url !== 'string' || url.length > 240) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
        parsed.search || parsed.hash) return false;
    if (restrictToProject) {
      return parsed.hostname === 'github.com' &&
        parsed.pathname.startsWith('/dizigs/archelaos-site/');
    }
    return ['github.com', 'docs.google.com', 'developers.google.com', 'developers.cloudflare.com', 'antigravity.google', 'docs.sonarsource.com'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

export function eventHash(eventWithoutHash) {
  return createHash('sha256').update(JSON.stringify(eventWithoutHash), 'utf8').digest('hex');
}

export function validateEvents(text, registry) {
  if (typeof text !== 'string') throw new Error('LOG_INVALID');
  const records = [];
  const byId = new Map(registry.tools.map(tool => [tool.id, tool]));
  let previousHash = GENESIS;
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    let event;
    try { event = JSON.parse(line); } catch { throw new Error('LOG_PARSE_FAILED'); }
    const tool = byId.get(event.toolId);
    if (!tool || !tool.commands.some(command => command.id === event.commandId) ||
        event.v !== 1 || !OUTCOMES.has(event.outcome) ||
        typeof event.at !== 'string' || !Number.isFinite(Date.parse(event.at)) ||
        event.prevHash !== previousHash || !isSafeEvidence(event.evidence) ||
        (event.ref !== null && !SHA_PATTERN.test(event.ref ?? '')) ||
        typeof event.hash !== 'string') {
      throw new Error('LOG_RECEIPT_INVALID');
    }
    const { hash, ...withoutHash } = event;
    if (Object.keys(withoutHash).sort().join(',') !==
        ['at', 'commandId', 'evidence', 'outcome', 'prevHash', 'ref', 'toolId', 'v'].sort().join(',') ||
        hash !== eventHash(withoutHash)) {
      throw new Error('LOG_CHAIN_BROKEN');
    }
    previousHash = hash;
    records.push(event);
  }
  return { count: records.length, lastHash: previousHash, lastAt: records.at(-1)?.at ?? null };
}

export function createReceipt({ registry, toolId, commandId, outcome, evidence, ref = null, prevHash = GENESIS, at = new Date().toISOString() }) {
  const tool = registry.tools.find(item => item.id === toolId);
  if (!tool || !tool.commands.some(command => command.id === commandId) ||
      !OUTCOMES.has(outcome) || !isSafeEvidence(evidence) ||
      (ref !== null && !SHA_PATTERN.test(ref)) || !/^[0-9a-f]{64}$/.test(prevHash)) {
    throw new Error('RECEIPT_INPUT_INVALID');
  }
  const entry = { v: 1, at, toolId, commandId, outcome, evidence, ref, prevHash };
  return { ...entry, hash: eventHash(entry) };
}

function parseOptions(args) {
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--evidence', '--ref'].includes(args[i]) || i + 1 >= args.length ||
        args[i] in result) throw new Error('UNKNOWN_OR_DUPLICATE_OPTION');
    result[args[i]] = args[i + 1];
  }
  return result;
}

function record(registry, args) {
  const [toolId, commandId, outcome, ...optionArgs] = args;
  const options = parseOptions(optionArgs);
  mkdirSync(PRIVATE_DIR, { recursive: true, mode: 0o700 });
  // Exclusive local lock prevents two CLI writers from forking the hash chain.
  const lock = openSync(LOCK_PATH, 'wx', 0o600);
  try {
    // Open once with O_NOFOLLOW and retain the same descriptor from read to append.
    // This removes the exists/read/open TOCTOU window reported by CodeQL.
    const descriptor = openSync(EVENT_PATH,
      constants.O_RDWR | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW, 0o600);
    try {
      const existing = readFileSync(descriptor, 'utf8');
      const proof = validateEvents(existing, registry);
      const receipt = createReceipt({
        registry, toolId, commandId, outcome, evidence: options['--evidence'],
        ref: options['--ref'] ?? null, prevHash: proof.lastHash,
      });
      appendFileSync(descriptor, JSON.stringify(receipt) + '\n', 'utf8');
      fsyncSync(descriptor);
      return { status: 'LOCALLY_RECORDED_NOT_REMOTE_SYNCED', count: proof.count + 1, hash: receipt.hash };
    } finally { closeSync(descriptor); }
  } finally {
    closeSync(lock);
    unlinkSync(LOCK_PATH);
  }
}

export function run(argv = process.argv.slice(2), registry = validateRegistry(JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')))) {
  validateRegistry(registry);
  const [command, ...args] = argv;
  switch (command) {
    case 'list':
      if (args.length) throw new Error('USAGE: list');
      return registry.tools.map(t => ({ id: t.id, name: t.name, state: t.state, family: t.family }));
    case 'show': {
      const tool = registry.tools.find(t => t.id === args[0]);
      if (args.length !== 1 || !tool) throw new Error('USAGE: show <tool-id>');
      return tool;
    }
    case 'commands': {
      const tool = registry.tools.find(t => t.id === args[0]);
      if (args.length !== 1 || !tool) throw new Error('USAGE: commands <tool-id>');
      return { tool: tool.id, commands: tool.commands, caution: 'Descriptions only; external calls are not executed by this CLI.' };
    }
    case 'verify': {
      if (args.length) throw new Error('USAGE: verify');
      let log = '';
      let descriptor;
      try {
        descriptor = openSync(EVENT_PATH, constants.O_RDONLY | constants.O_NOFOLLOW);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (descriptor !== undefined) {
        try { log = readFileSync(descriptor, 'utf8'); }
        finally { closeSync(descriptor); }
      }
      return { registry: 'VALID', localLog: validateEvents(log, registry), logLocation: 'LOCAL_PRIVATE_NOT_SYNCED' };
    }
    case 'record':
      return record(registry, args);
    default:
      throw new Error('USAGE: list | show <tool> | commands <tool> | verify | record <tool> <command> <PASS|FAIL|BLOCKED|UNKNOWN|SKIPPED> --evidence <github-repo-url> [--ref <40-hex-sha>]');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(run(), null, 2));
  } catch (error) {
    console.error('AGENT_KIT_ERROR:', error.message);
    process.exitCode = 1;
  }
}
