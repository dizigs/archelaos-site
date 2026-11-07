#!/usr/bin/env node
// Safe offline readiness inspection for OPTIONAL user-local Antigravity config.
// Never make provider requests, report authentication as successful, or print tokens.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {isMainModule,readBoundedFile} from './private-io.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = join(HERE, 'mcp_config.example.json');
const ENDPOINTS = Object.freeze({
  'github-readonly': 'https://api.githubcopilot.com/mcp/x/all/readonly',
  'cloudflare-api': 'https://mcp.cloudflare.com/mcp',
  'cloudflare-docs': 'https://docs.mcp.cloudflare.com/mcp',
  'firecrawl-search': 'https://mcp.firecrawl.dev/v2/mcp-search',
});
const STATUS = Object.freeze({
  disabled: 'PREPARED_DISABLED',
  configured: 'CONFIGURED_UNVERIFIED',
  absent: 'NOT_CONFIGURED',
  wrong: 'ENDPOINT_MISMATCH',
  invalid: 'ENTRY_INVALID',
});

export function inspectMcpConfiguration(rawConfig) {
  if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
    throw new Error('MCP_CONFIG_INVALID');
  }
  const servers = rawConfig.mcpServers;
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) {
    throw new Error('MCP_SERVERS_MISSING');
  }
  return Object.entries(ENDPOINTS).map(([id, expected]) => {
    const entry = Object.hasOwn(servers, id) ? servers[id] : undefined;
    if (entry === undefined) return { id, status: STATUS.absent, authenticated: false, verified: false };
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { id, status: STATUS.wrong, authenticated: false, verified: false };
    }
    const endpoint = entry.serverUrl;
    if (endpoint !== expected) return { id, status: STATUS.wrong, authenticated: false, verified: false };
    if(Object.hasOwn(entry,'disabled')&&typeof entry.disabled!=='boolean')
      return {id,status:STATUS.invalid,authenticated:false,verified:false};
    const enabled = entry.disabled !== true;
    return {
      id,
      status: enabled ? STATUS.configured : STATUS.disabled,
      authenticated: false,
      verified: false,
    };
  });
}

export function inspectFile(filename = DEFAULT_FILE) {
  const text = readBoundedFile(filename,65536);
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('MCP_CONFIG_JSON_INVALID'); }
  return inspectMcpConfiguration(parsed);
}

export function runDoctor(args = process.argv.slice(2)) {
  const example = args.length === 0;
  if (!example && (args.length !== 2 || args[0] !== '--config' ||
      !args[1] || args[1].startsWith('-'))) {
    throw new Error('USAGE: node mcp-doctor.mjs [--config /path/to/mcp_config.json]');
  }
  const result = inspectFile(example ? DEFAULT_FILE : resolve(args[1]));
  return {
    inspection: example ? 'EXAMPLE_ONLY' : 'EXPLICIT_LOCAL_CONFIG',
    providers: result,
    liveEndpointChecked: false,
    oauthVerified: false,
    providerPermissionsVerified: false,
    safeToMerge: 'NOT_ASSESSED',
    message: 'Presence of an enabled MCP configuration is NOT proof of installation, authentication or authorization. No secrets or configuration values are printed.',
  };
}

if (isMainModule(import.meta.url)) {
  try { console.log(JSON.stringify(runDoctor(), null, 2)); }
  catch (error) { console.error('MCP_DOCTOR_ERROR:', error.message); process.exitCode = 1; }
}
