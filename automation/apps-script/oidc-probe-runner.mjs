// Explicit, zero-cost read-only bridge check run by GitHub Actions.
// No Google access tokens, cookies, Cloudflare API keys or repository secrets.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const url = 'https://archelaos-automation-bridge.dimitriszgalanis.workers.dev/api/apps-script/github-oidc-probe';
const audience = 'archelaos.club:apps-script:readonly:v1';
function requireCondition(v) { if (!v) throw new Error('TRUSTED_READONLY_REQUEST_REQUIRED'); }
const env = process.env;
requireCondition(env.GITHUB_REPOSITORY === 'dizigs/archelaos-site');
requireCondition(env.GITHUB_EVENT_NAME === 'push');
requireCondition(env.GITHUB_REF === 'refs/heads/codex/automation-bridge-integration');
requireCondition(/^[0-9a-f]{40}$/.test(env.GITHUB_SHA || ''));
requireCondition(typeof env.ACTIONS_ID_TOKEN_REQUEST_URL === 'string');
requireCondition(typeof env.ACTIONS_ID_TOKEN_REQUEST_TOKEN === 'string');
const paths = execFileSync('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'],
  { encoding:'utf8', maxBuffer:65536 }).trim().split('\n').filter(Boolean);
requireCondition(paths.length === 1);
requireCondition(/^automation\/apps-script\/operator-requests\/probe-[0-9a-f-]{36}\.json$/.test(paths[0]));
const payload = JSON.parse(readFileSync(paths[0], 'utf8'));
requireCondition(payload && Object.keys(payload).sort().join(',') === 'id,task,version');
requireCondition(payload.version === 1 && payload.task === 'readiness');
requireCondition(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(payload.id));
requireCondition(paths[0].endsWith('probe-' + payload.id + '.json'));

const oidc = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
oidc.searchParams.set('audience', audience);
const tokenResponse = await fetch(oidc.href, {
  headers: { authorization: 'Bearer ' + env.ACTIONS_ID_TOKEN_REQUEST_TOKEN },
  signal: AbortSignal.timeout(15000), redirect: 'manual'
});
requireCondition(tokenResponse.status === 200);
const data = await tokenResponse.json();
requireCondition(typeof data.value === 'string' && data.value.length > 200 && data.value.length < 8192);
const response = await fetch(url, {
  method: 'POST',
  headers: { authorization: 'Bearer ' + data.value },
  signal: AbortSignal.timeout(20000),
  redirect: 'manual'
});
if (response.status !== 200) throw new Error('READONLY_WORKER_COMMAND_REJECTED_HTTP_' + response.status);
const result = await response.json();
requireCondition(result.status === 'GITHUB_OIDC_READONLY_PROBE_VERIFIED');
requireCondition(result.signedExecution === true && result.readOnly === true);
requireCondition(result.encryptedBackupPresent === true && result.googleEditsPerformed === false && result.editorEnabled === false);
// Only emit fixed, non-sensitive status; no token or private content in logs.
console.log('GITHUB_OIDC_READONLY_PROBE_VERIFIED');
