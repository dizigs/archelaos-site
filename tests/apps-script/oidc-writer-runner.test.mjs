import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runWriterCommand } from '../../automation/apps-script/oidc-writer-runner.mjs';
import { writerAudience } from '../../automation/apps-script/github-writer.mjs';
const now = Date.now();
function fixture() {
  const command = { version: 1, operationId: crypto.randomUUID(), action: 'create-smoke', sourceCommit: 'c'.repeat(40), expectedBaseHash: 'd'.repeat(64), expiresAt: now + 60000 };
  return { command, env: { GITHUB_REPOSITORY: 'dizigs/archelaos-site', GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_SHA: command.sourceCommit, GITHUB_WORKFLOW_SHA: command.sourceCommit,
    SCRIPT_COMMAND: JSON.stringify(command), ACTIONS_ID_TOKEN_REQUEST_URL: 'https://synthetic.actions.githubusercontent.com/token', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'synthetic-request-token' } };
}
test('bounded writer sender uses separate audience and fixed endpoint, with no source/credentials in command', async () => {
  const f = fixture(), calls = [];
  const result = await runWriterCommand({ env: f.env, now: () => now, transport: async (url, init) => {
    calls.push(url); assert.equal(init.redirect, 'manual');
    if (calls.length === 1) {
      assert.equal(new URL(url).searchParams.get('audience'), writerAudience);
      assert.equal(init.headers.authorization, 'Bearer synthetic-request-token');
      return Response.json({ value: 'j'.repeat(300) });
    }
    assert.equal(url, 'https://archelaos-automation-bridge.dimitriszgalanis.workers.dev/api/apps-script/github-oidc-write');
    assert.equal(init.headers.authorization, 'Bearer ' + 'j'.repeat(300));
    assert.deepEqual(JSON.parse(init.body), f.command);
    return Response.json({ status: 'VERIFIED', operationId: f.command.operationId });
  } });
  assert.equal(result, 'GITHUB_OIDC_BOUNDED_WRITER_VERIFIED'); assert.equal(calls.length, 2);
});
test('unreviewed refs, token destinations and arbitrary code are rejected before network', async () => {
  const f = fixture(); let calls = 0;
  for (const fields of [{ GITHUB_REF: 'refs/heads/codex/automation-bridge-integration' }, { GITHUB_WORKFLOW_SHA: 'a'.repeat(40) },
    { ACTIONS_ID_TOKEN_REQUEST_URL: 'https://attacker.invalid' }, { SCRIPT_COMMAND: JSON.stringify({ ...f.command, source: 'function evil() {}' }) }]) {
    await assert.rejects(runWriterCommand({ env: { ...f.env, ...fields }, now: () => now, transport: async () => { calls++; } }));
  }
  assert.equal(calls, 0);
});
