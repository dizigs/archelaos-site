import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Antigravity workspace tool skill is discoverable and scoped', () => {
  const filename = new URL('../../.agents/skills/archelaos-tool-registry/SKILL.md', import.meta.url);
  // This fixture path is resolved from automation/agent-kit to repository root.
  const text = readFileSync(filename, 'utf8');
  assert.match(text, /^---\nname: archelaos-tool-registry\ndescription: [^\n]+\n---\n/);
  assert.match(text, /node automation\/agent-kit\/cli\.mjs list/);
  assert.match(text, /node automation\/agent-kit\/mcp-doctor\.mjs/);
  assert.match(text, /NOT_CONNECTED/);
  assert.match(text, /Never expose API keys/);
  assert.match(text, /do not merge|Do not merge/i);
});
