// GitLab Guardian — read-only, fail-closed GitHub -> GitLab mirror observer.
// This Worker never writes to GitHub, GitLab, or Cloudflare Pages.
const GITLAB_PROJECT_ID = 88488684;
const GITHUB_REPOSITORY = 'dizigs/archelaos-site';
const GITLAB_API = `https://gitlab.com/api/v4/projects/${GITLAB_PROJECT_ID}`;
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPOSITORY}`;
const MAX_RESPONSE_BYTES = 120_000;

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
}

function secureMatch(expected, supplied) {
  if (typeof expected !== 'string' || expected.length < 24 ||
      typeof supplied !== 'string' || supplied.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  return mismatch === 0;
}

async function readJSON(url, headers, fetcher) {
  // Fixed domains and paths only. No user-supplied URLs, methods, or request body.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetcher(url, { method: 'GET', headers, signal: controller.signal, redirect: 'error' });
    if (!res.ok) throw new Error('UPSTREAM_STATUS');
    const length = Number(res.headers.get('content-length') || 0);
    if (length > MAX_RESPONSE_BYTES) throw new Error('UPSTREAM_SIZE');
    const text = await res.text();
    if (text.length > MAX_RESPONSE_BYTES) throw new Error('UPSTREAM_SIZE');
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

export function assess({ mirror, gitlabBranch, githubCommit, checkedAt }) {
  if (!mirror || !gitlabBranch || !githubCommit ||
      !/^[a-f0-9]{40}$/.test(gitlabBranch.commit?.id || '') ||
      !/^[a-f0-9]{40}$/.test(githubCommit.sha || '')) throw new Error('INVALID_UPSTREAM_SCHEMA');
  const glSha = gitlabBranch.commit.id;
  const ghSha = githubCommit.sha;
  const issues = [];
  if (mirror.enabled !== true) issues.push('MIRROR_DISABLED');
  if (mirror.mirror_trigger_builds === true) issues.push('UNEXPECTED_MIRROR_PIPELINES');
  if (mirror.mirror_overwrites_diverged_branches === true) issues.push('UNSAFE_BRANCH_OVERWRITE');
  if (['failed', 'canceled'].includes(mirror.update_status)) issues.push('MIRROR_UPDATE_FAILED');
  if (mirror.last_error) issues.push('MIRROR_ERROR_RECORDED');
  if (ghSha !== glSha) issues.push('HEAD_MISMATCH');
  const stamp = Date.parse(mirror.last_successful_update_at || '');
  const ageMinutes = Number.isFinite(stamp) ? Math.max(0, Math.round((checkedAt - stamp) / 60_000)) : null;
  if (ageMinutes === null) issues.push('NO_SUCCESSFUL_MIRROR_TIMESTAMP');
  const degraded = issues.some(i => i !== 'HEAD_MISMATCH' && i !== 'NO_SUCCESSFUL_MIRROR_TIMESTAMP');
  const criticalMismatch = issues.includes('HEAD_MISMATCH') && (ageMinutes === null || ageMinutes >= 120);
  return {
    status: degraded || criticalMismatch ? 'alert' : issues.length ? 'attention' : 'ok',
    checked_at: new Date(checkedAt).toISOString(),
    github_main_sha: ghSha,
    gitlab_main_sha: glSha,
    head_matches: ghSha === glSha,
    mirror_last_success: Number.isFinite(stamp) ? new Date(stamp).toISOString() : null,
    mirror_last_success_age_minutes: ageMinutes,
    mirror_update_status: mirror.update_status || 'unknown',
    issues,
    // No private repository metadata, mirror credentials, or provider error bodies.
  };
}

export async function runAudit(env, fetcher = fetch, checkedAt = Date.now()) {
  if (!env?.GITLAB_READ_TOKEN) throw new Error('MISSING_GITLAB_READ_TOKEN');
  const glHeaders = { 'PRIVATE-TOKEN': env.GITLAB_READ_TOKEN, accept: 'application/json' };
  const ghHeaders = { 'User-Agent': 'archelaos-gitlab-guardian', accept: 'application/vnd.github+json' };
  const [mirror, gitlabBranch, githubCommit] = await Promise.all([
    readJSON(`${GITLAB_API}/mirror/pull`, glHeaders, fetcher),
    readJSON(`${GITLAB_API}/repository/branches/main`, glHeaders, fetcher),
    readJSON(`${GITHUB_API}/commits/main`, ghHeaders, fetcher),
  ]);
  return assess({ mirror, gitlabBranch, githubCommit, checkedAt });
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (request.method !== 'GET') return json({ error: 'NOT_FOUND' }, 404);
    if (path === '/health') return json({ service: 'archelaos-gitlab-guardian', healthy: true });
    if (path !== '/check') return json({ error: 'NOT_FOUND' }, 404);
    const bearer = request.headers.get('authorization') || '';
    if (!secureMatch(env?.GUARDIAN_CHECK_KEY, bearer.startsWith('Bearer ') ? bearer.slice(7) : ''))
      return json({ error: 'NOT_FOUND' }, 404);
    if (!env?.GITLAB_READ_TOKEN) return json({ status: 'not_configured' }, 503);
    try {
      return json(await runAudit(env));
    } catch {
      // Do not leak GitLab private metadata, tokens, or provider body/errors.
      return json({ status: 'unavailable' }, 503);
    }
  },
  async scheduled(controller, env, ctx) {
    if (!env?.GITLAB_READ_TOKEN) {
      console.log(JSON.stringify({ kind: 'gitlab_guardian', status: 'not_configured' }));
      return;
    }
    ctx.waitUntil(runAudit(env).then(report => {
      console.log(JSON.stringify({ kind: 'gitlab_guardian', ...report }));
    }).catch(() => {
      console.error(JSON.stringify({ kind: 'gitlab_guardian', status: 'unavailable' }));
    }));
  },
};
