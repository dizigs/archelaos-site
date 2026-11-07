import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspectMcpConfiguration } from './mcp-doctor.mjs';

const config = JSON.parse(readFileSync(new URL('../../.agents/mcp_config.json', import.meta.url), 'utf8'));

test('Antigravity workspace MCP config contains only trusted endpoints', () => {
  assert.deepEqual(Object.keys(config), ['mcpServers']);
  assert.deepEqual(Object.keys(config.mcpServers).sort(), [
    'cloudflare-api', 'cloudflare-docs', 'firecrawl-search', 'github-readonly',
  ]);
  const expected = {
    'github-readonly': 'https://api.githubcopilot.com/mcp/x/all/readonly',
    'cloudflare-docs': 'https://docs.mcp.cloudflare.com/mcp',
    'cloudflare-api': 'https://mcp.cloudflare.com/mcp',
    'firecrawl-search': 'https://mcp.firecrawl.dev/v2/mcp-search',
  };
  for (const [name, entry] of Object.entries(config.mcpServers)) {
    assert.equal(entry.serverUrl, expected[name]);
    assert.deepEqual(Object.keys(entry).sort(), ['disabled','serverUrl']);
    assert.ok(!JSON.stringify(entry).includes('Authorization'));
  }
  assert.doesNotMatch(JSON.stringify(config), /AIza[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|Bearer\s+\S+/);
});

test('only GitHub readonly and public Cloudflare docs are pre-enabled; private APIs need OAuth', () => {
  assert.equal(config.mcpServers['github-readonly'].disabled, false);
  assert.equal(config.mcpServers['cloudflare-docs'].disabled, false);
  assert.equal(config.mcpServers['cloudflare-api'].disabled, true);
  assert.equal(config.mcpServers['firecrawl-search'].disabled, true);
  const statuses = inspectMcpConfiguration(config);
  assert.equal(statuses.find(x => x.id === 'github-readonly').status, 'CONFIGURED_UNVERIFIED');
  assert.equal(statuses.find(x => x.id === 'cloudflare-api').status, 'PREPARED_DISABLED');
  assert.equal(statuses.find(x => x.id === 'cloudflare-docs').status, 'CONFIGURED_UNVERIFIED');
  assert.equal(statuses.find(x => x.id === 'firecrawl-search').status, 'PREPARED_DISABLED');
  assert.ok(statuses.every(x => !x.authenticated && !x.verified));
});

test('workspace file cannot authorize merge/deploy or certify provider OAuth', () => {
  assert.equal(config.mcpServers['cloudflare-api'].disabled, true);
  assert.equal(config.mcpServers['firecrawl-search'].disabled, true);
  assert.equal(config.mcpServers['github-readonly'].serverUrl.endsWith('/readonly'), true);
  assert.equal(Object.hasOwn(config.mcpServers, 'google-workspace'), false);
});

test('Agent Kit CI also runs for each configuration input it inspects',()=>{
  const workflow=readFileSync(new URL('../../.github/workflows/agent-kit-validation.yml',import.meta.url),'utf8');
  for(const path of ['.agents/mcp_config.json','brain/wrangler.toml','brain/package.json','automation/self-heal-worker/wrangler.toml'])
    assert.ok(workflow.includes("- '"+path+"'"),path+' must trigger validation');
});
