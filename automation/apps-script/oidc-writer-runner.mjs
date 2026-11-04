import { boundedJson } from './security.mjs';
import { validateWriterCommand, writerAudience } from './github-writer.mjs';

function trusted(value) { if (!value) throw new Error('TRUSTED_WRITER_REQUEST_REQUIRED'); }
export async function runWriterCommand({ env = process.env, transport = fetch, now = Date.now } = {}) {
  trusted(env.GITHUB_REPOSITORY === 'dizigs/archelaos-site' && env.GITHUB_REF === 'refs/heads/main' && env.GITHUB_EVENT_NAME === 'workflow_dispatch');
  trusted(/^[0-9a-f]{40}$/.test(env.GITHUB_SHA || '') && env.GITHUB_SHA === env.GITHUB_WORKFLOW_SHA);
  trusted(typeof env.SCRIPT_COMMAND === 'string' && env.SCRIPT_COMMAND.length <= 2048);
  const command = validateWriterCommand(JSON.parse(env.SCRIPT_COMMAND), env.GITHUB_SHA, now());
  const oidc = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
  trusted(oidc.protocol === 'https:' && oidc.hostname.endsWith('.actions.githubusercontent.com') && !oidc.username && !oidc.password && !oidc.port);
  trusted(typeof env.ACTIONS_ID_TOKEN_REQUEST_TOKEN === 'string' && env.ACTIONS_ID_TOKEN_REQUEST_TOKEN.length > 0);
  oidc.searchParams.set('audience', writerAudience);
  const token = await boundedJson(await transport(oidc.href, { redirect: 'manual', signal: AbortSignal.timeout(10000),
    headers: { authorization: 'Bearer ' + env.ACTIONS_ID_TOKEN_REQUEST_TOKEN } }), 16384);
  trusted(typeof token.value === 'string' && token.value.length > 200 && token.value.length < 8192);
  const result = await boundedJson(await transport('https://archelaos-automation-bridge.dimitriszgalanis.workers.dev/api/apps-script/github-oidc-write', {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(90000),
    headers: { authorization: 'Bearer ' + token.value, 'content-type': 'application/json' }, body: JSON.stringify(command)
  }), 4096);
  trusted(result.status === 'VERIFIED' && result.operationId === command.operationId);
  return 'GITHUB_OIDC_BOUNDED_WRITER_VERIFIED';
}
if (process.argv[1]?.endsWith('/oidc-writer-runner.mjs')) {
  runWriterCommand().then(code => console.log(code)).catch(() => { console.error('BOUNDED_WRITER_FAILED; inspect sanitized receipt'); process.exitCode = 1; });
}
