/** Read-only GitHub Actions testing executor. Never dispatches, edits or bypasses a check. */
export const REQUIRED_WORKFLOWS = Object.freeze([
  { path: '.github/workflows/rebuild-check.yml', jobs: ['HTML, data and JavaScript integrity'] },
  { path: '.github/workflows/axe-accessibility.yml', jobs: ['axe'] },
  { path: '.github/workflows/lighthouse-ci.yml', jobs: ['Lighthouse CI mobile audit'] },
  { path: '.github/workflows/eslint-guard.yml', jobs: ['ESLint JavaScript quality'] },
  { path: '.github/workflows/codeql-security.yml', jobs: ['CodeQL (javascript-typescript)', 'CodeQL (python)'] },
  { path: '.github/workflows/javascript-syntax-guard.yml', jobs: ['JavaScript syntax (all site scripts)'] },
  { path: '.github/workflows/release-qa.yml', jobs: ['Validate production build'] },
  { path: '.github/workflows/validate-site.yml', jobs: ['verify'] },
]);

const SHA_RE = /^[a-f0-9]{40}$/i;
const REPO_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const EVENTS = new Set(['pull_request', 'push', 'workflow_dispatch']);
const DEFAULT_LIMITS = Object.freeze({ maxPolls: 3, pollIntervalMs: 10000, requestTimeoutMs: 8000, maxDurationMs: 90000, maxPages: 3, maxRetries: 2 });

function limitsOf(input = {}) {
  const x = { ...DEFAULT_LIMITS, ...input };
  for (const [name, max] of Object.entries({ maxPolls: 10, pollIntervalMs: 60000, requestTimeoutMs: 30000, maxDurationMs: 600000, maxPages: 5, maxRetries: 3 })) {
    if (!Number.isSafeInteger(x[name]) || x[name] < (name === 'pollIntervalMs' || name === 'maxRetries' ? 0 : 1) || x[name] > max) {
      throw new Error(`invalid ${name}`);
    }
  }
  return x;
}
const blocked = (sha, checks, reason) => ({ status: 'blocked', sha, checks, reason });

/**
 * Read-only: GET /repos/:repo, /commits/:sha, /actions/runs, /actions/runs/:id/jobs.
 * Never trusts GitHub status contexts alone, PR merge refs, or similarly named fork runs.
 */
export async function runTestingExecutor({ repo, sha, token, branch, limits, fetchImpl = fetch, sleep = (ms) => new Promise(r => setTimeout(r, ms)), now = () => Date.now() }) {
  if (!REPO_RE.test(repo || '') || !SHA_RE.test(sha || '') || (branch !== undefined && (typeof branch !== 'string' || !/^[\w./-]{1,150}$/.test(branch) || branch.includes('..')))) {
    throw new Error('invalid repository, full SHA or branch');
  }
  if (typeof token !== 'string' || !token.trim()) throw new Error('GitHub token required');
  const normalizedSha = sha.toLowerCase();
  const policy = limitsOf(limits);
  const start = now();
  const endpoint = `https://api.github.com/repos/${repo}`;
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' };
  const remaining = () => policy.maxDurationMs - (now() - start);

  async function get(path) {
    for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
      if (remaining() <= 0) throw new Error('overall deadline exceeded');
      const ac = new AbortController();
      const timeout = setTimeout(() => ac.abort(), Math.min(policy.requestTimeoutMs, remaining()));
      try {
        const res = await fetchImpl(endpoint + path, { method: 'GET', headers, redirect: 'error', signal: ac.signal });
        if (RETRYABLE.has(res.status) && attempt < policy.maxRetries) {
          const wait = Math.min(200 * (2 ** attempt), remaining());
          if (wait <= 0) throw new Error('overall deadline exceeded');
          await sleep(wait);
          continue;
        }
        if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`);
        return await res.json();
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new Error('GitHub API retries exhausted');
  }

  async function pages(path, field) {
    const items = [];
    for (let page = 1; page <= policy.maxPages; page++) {
      const q = `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`;
      const body = await get(q);
      if (!Array.isArray(body?.[field]) || !Number.isSafeInteger(body.total_count) || body.total_count < 0) throw new Error('invalid GitHub pagination');
      items.push(...body[field]);
      if (items.length >= body.total_count) {
        if (items.length !== body.total_count) throw new Error('inconsistent GitHub pagination');
        return items;
      }
      if (body[field].length === 0) throw new Error('incomplete GitHub pagination');
    }
    throw new Error('GitHub pagination cap exceeded');
  }

  let checks = [];
  try {
    const metadata = await get('');
    if (metadata.full_name !== repo || !Number.isSafeInteger(metadata.id)) throw new Error('repository provenance mismatch');
    const commit = await get(`/commits/${normalizedSha}`);
    if (commit.sha?.toLowerCase() !== normalizedSha || !commit.url?.startsWith(endpoint + '/commits/')) throw new Error('commit provenance mismatch');
    for (let poll = 1; poll <= policy.maxPolls; poll++) {
      const runs = await pages(`/actions/runs?head_sha=${normalizedSha}`, 'workflow_runs');
      checks = [];
      let hardFailure = false;
      for (const required of REQUIRED_WORKFLOWS) {
        // Latest workflow run is authoritative; never accept an older success over a newer failure.
        const candidates = runs.filter(run => run.path === required.path && run.head_sha?.toLowerCase() === normalizedSha);
        candidates.sort((a, b) => (b.id || 0) - (a.id || 0));
        const run = candidates[0];
        const record = { workflow: required.path, runId: run?.id ?? null, conclusion: null, jobs: [], state: 'missing' };
        checks.push(record);
        if (!run) continue;
        if (!Number.isSafeInteger(run.id) || run.repository?.id !== metadata.id || run.repository?.full_name !== repo ||
            run.head_repository?.id !== metadata.id || run.head_repository?.full_name !== repo ||
            !EVENTS.has(run.event) || (branch && run.head_branch !== branch) ||
            !Number.isSafeInteger(run.workflow_id) || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1) {
          record.state = 'untrusted'; hardFailure = true; continue;
        }
        record.conclusion = run.conclusion ?? null;
        if (run.status !== 'completed') { record.state = 'pending'; continue; }
        if (run.conclusion !== 'success') { record.state = 'failed'; hardFailure = true; continue; }
        const jobs = await pages(`/actions/runs/${run.id}/jobs?filter=latest`, 'jobs');
        if (jobs.length === 0 || jobs.some(j => j.run_id !== run.id || j.run_attempt !== run.run_attempt || !Number.isSafeInteger(j.id))) {
          record.state = 'untrusted'; hardFailure = true; continue;
        }
        record.jobs = jobs.map(j => ({ name: j.name, status: j.status, conclusion: j.conclusion }));
        const names = new Set(jobs.map(j => j.name));
        if (required.jobs.some(name => !names.has(name)) || jobs.some(j => j.status !== 'completed' || j.conclusion !== 'success')) {
          record.state = 'failed'; hardFailure = true; continue;
        }
        record.state = 'passed';
      }
      if (checks.every(c => c.state === 'passed')) return { status: 'passed', sha: normalizedSha, checks, polls: poll };
      if (hardFailure || poll === policy.maxPolls) return blocked(normalizedSha, checks, hardFailure ? 'required check failed or provenance rejected' : 'required check missing or pending');
      if (remaining() <= policy.pollIntervalMs) return blocked(normalizedSha, checks, 'polling deadline exceeded');
      await sleep(policy.pollIntervalMs);
    }
  } catch (error) {
    // Avoid logging thrown response bodies, tokens or arbitrary exception strings.
    return blocked(normalizedSha, checks, error?.name === 'AbortError' ? 'GitHub API timeout' : 'GitHub API unavailable or invalid response');
  }
  return blocked(normalizedSha, checks, 'polling exhausted');
}
