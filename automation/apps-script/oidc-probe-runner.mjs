// Zero-cost, read-only receiver regression. No subprocess or dynamic local file
// read: inspect the immutable signed source commit through the fixed GitHub API.
import { boundedJson } from './security.mjs';
const endpoint = 'https://archelaos-automation-bridge.dimitriszgalanis.workers.dev/api/apps-script/github-oidc-probe';
const audience = 'archelaos.club:apps-script:readonly:v1';
function requireCondition(value) { if (!value) throw new Error('TRUSTED_READONLY_REQUEST_REQUIRED'); }

export async function runReadinessProbe({ env = process.env, transport = fetch } = {}) {
  requireCondition(env.GITHUB_REPOSITORY === 'dizigs/archelaos-site');
  requireCondition(env.GITHUB_EVENT_NAME === 'push');
  requireCondition(env.GITHUB_REF === 'refs/heads/codex/automation-bridge-integration');
  requireCondition(/^[0-9a-f]{40}$/.test(env.GITHUB_SHA || ''));
  requireCondition(typeof env.GH_TOKEN === 'string' && env.GH_TOKEN.length > 0);
  const headers = { authorization: 'Bearer ' + env.GH_TOKEN, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };
  const commit = await boundedJson(await transport('https://api.github.com/repos/dizigs/archelaos-site/commits/' + env.GITHUB_SHA,
    { headers, signal: AbortSignal.timeout(15000), redirect: 'manual' }), 131072);
  requireCondition(commit.sha === env.GITHUB_SHA && Array.isArray(commit.parents) && commit.parents.length === 1);
  requireCondition(Array.isArray(commit.files) && commit.files.length === 1 && commit.files[0].status === 'added');
  const path = commit.files[0].filename;
  const matched = typeof path === 'string' && /^automation\/apps-script\/operator-requests\/probe-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.json$/.exec(path);
  requireCondition(matched);
  const payload = await boundedJson(await transport('https://api.github.com/repos/dizigs/archelaos-site/contents/' + path + '?ref=' + env.GITHUB_SHA,
    { headers: { ...headers, accept: 'application/vnd.github.raw+json' }, signal: AbortSignal.timeout(15000), redirect: 'manual' }), 4096);
  requireCondition(payload && !Array.isArray(payload) && Object.keys(payload).length === 3 && ['id', 'task', 'version'].every(key => Object.hasOwn(payload, key)));
  requireCondition(payload.version === 1 && payload.task === 'readiness' && payload.id === matched[1]);
  const oidc = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
  requireCondition(oidc.protocol === 'https:' && oidc.hostname.endsWith('.actions.githubusercontent.com') && !oidc.username && !oidc.password && !oidc.port);
  requireCondition(typeof env.ACTIONS_ID_TOKEN_REQUEST_TOKEN === 'string' && env.ACTIONS_ID_TOKEN_REQUEST_TOKEN.length > 0);
  oidc.searchParams.set('audience', audience);
  const data = await boundedJson(await transport(oidc.href, { headers: { authorization: 'Bearer ' + env.ACTIONS_ID_TOKEN_REQUEST_TOKEN }, signal: AbortSignal.timeout(15000), redirect: 'manual' }), 16384);
  requireCondition(typeof data.value === 'string' && data.value.length > 200 && data.value.length < 8192);
  const response = await transport(endpoint, { method: 'POST', headers: { authorization: 'Bearer ' + data.value }, signal: AbortSignal.timeout(20000), redirect: 'manual' });
  if (response.status !== 200) throw new Error('READONLY_WORKER_COMMAND_REJECTED_HTTP_' + response.status);
  const result = await boundedJson(response, 4096);
  requireCondition(result.status === 'GITHUB_OIDC_READONLY_PROBE_VERIFIED' && result.signedExecution === true && result.readOnly === true);
  requireCondition(result.encryptedBackupPresent === true && result.googleEditsPerformed === false && result.editorEnabled === false);
  return 'GITHUB_OIDC_READONLY_PROBE_VERIFIED';
}
if (process.argv[1]?.endsWith('/oidc-probe-runner.mjs')) {
  runReadinessProbe().then(code => console.log(code)).catch(() => { console.error('READONLY_PROBE_FAILED; inspect sanitized run evidence'); process.exitCode = 1; });
}
