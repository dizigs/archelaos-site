/** Trusted-server readback bridge between #212 Testing and #213 Integration.
 * All evidence is read independently from GitHub REST, never caller-supplied.
 * Does not dispatch, modify, merge, deploy, or bypass any required check.
 */
import { REPOSITORY, REQUIRED_CHECKS, REQUIRED_JOBS } from './index.mjs';

const SHA = /^[0-9a-f]{40}$/;
const EVENTS = new Set(['pull_request', 'push', 'workflow_dispatch']);
const RETRY = new Set([408, 429, 500, 502, 503, 504]);
const fail = () => { throw new Error('GITHUB_PROVENANCE_UNVERIFIED'); };

export function createVerifiedTestingChecksPort({ nativeRunner, token, fetchImpl = fetch, branch,
  requestTimeoutMs = 8000, maxPages = 3, maxRetries = 1, maxDurationMs = 90000,
  now = () => Date.now(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  if (typeof nativeRunner !== 'function' || typeof token !== 'string' || !token.trim() ||
      typeof fetchImpl !== 'function' || (branch !== undefined && (typeof branch !== 'string' ||
      !/^[\w./-]{1,150}$/.test(branch) || branch.includes('..'))) ||
      !Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 30000 ||
      !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 5 ||
      !Number.isSafeInteger(maxRetries) || maxRetries < 0 || maxRetries > 3 ||
      !Number.isSafeInteger(maxDurationMs) || maxDurationMs < 1 || maxDurationMs > 600000) fail();
  const root = `https://api.github.com/repos/${REPOSITORY}`;
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28' };

  return Object.freeze({ async readVerified({ repository, commitSha }) {
    if (repository !== REPOSITORY || !SHA.test(commitSha || '')) fail();
    const start = now();
    const remaining = () => maxDurationMs - (now() - start);
    async function get(path) {
      for (let i = 0; i <= maxRetries; i++) {
        if (remaining() <= 0) fail();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), Math.min(requestTimeoutMs, remaining()));
        try {
          const response = await fetchImpl(root + path, {
            method: 'GET', redirect: 'error', headers, signal: controller.signal
          });
          if (RETRY.has(response.status) && i < maxRetries) {
            await sleep(Math.min(200 * 2 ** i, Math.max(0, remaining())));
            continue;
          }
          if (!response.ok) fail();
          return await response.json();
        } finally { clearTimeout(timeout); }
      }
      fail();
    }
    async function allPages(path, key) {
      let items = [];
      for (let page = 1; page <= maxPages; page++) {
        const value = await get(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
        if (!Number.isSafeInteger(value?.total_count) || value.total_count < 0 ||
            !Array.isArray(value[key]) || value[key].length > 100) fail();
        items = items.concat(value[key]);
        if (items.length === value.total_count) return items;
        if (items.length > value.total_count || value[key].length === 0) fail();
      }
      fail();
    }
    // Only a trusted server-side instance of #212 may be injected. It determines
    // the authoritative latest run; this readback verifies every selected ID.
    const report = await nativeRunner({ repo: REPOSITORY, sha: commitSha, token, branch });
    if (report?.sha !== commitSha || !['passed', 'blocked'].includes(report.status) ||
        !Array.isArray(report.checks) || report.checks.length !== REQUIRED_CHECKS.length) fail();
    const metadata = await get('');
    const commit = await get(`/commits/${commitSha}`);
    if (metadata?.full_name !== REPOSITORY || !Number.isSafeInteger(metadata?.id) ||
        commit?.sha !== commitSha || commit?.url !== root + `/commits/${commitSha}`) fail();
    const latest = await allPages(`/actions/runs?head_sha=${commitSha}`, 'workflow_runs');
    const evidence = [];
    for (const name of REQUIRED_CHECKS) {
      const path = `.github/workflows/${name}`;
      const records = report.checks.filter(c => c?.workflow === path);
      if (records.length !== 1) fail();
      const record = records[0];
      const matching = latest.filter(r => r?.path === path && r?.head_sha === commitSha)
        .sort((a, b) => b.id - a.id);
      const newest = matching[0];
      if (!newest) {
        if (record.runId !== null || record.state !== 'missing') fail();
        evidence.push({ workflow: name, repository: REPOSITORY, headSha: commitSha,
          provenanceVerified: false, runId: null, runAttempt: null, jobs: [],
          status: 'missing', conclusion: null });
        continue;
      }
      if (!Number.isSafeInteger(record.runId) || record.runId !== newest.id) fail();
      const run = await get(`/actions/runs/${record.runId}`);
      if (run?.id !== record.runId || run.path !== path || run.head_sha !== commitSha ||
          run.repository?.id !== metadata.id || run.repository?.full_name !== REPOSITORY ||
          run.head_repository?.id !== metadata.id || run.head_repository?.full_name !== REPOSITORY ||
          !EVENTS.has(run.event) || (branch && run.head_branch !== branch) ||
          !Number.isSafeInteger(run.workflow_id) ||
          !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1 ||
          record.conclusion !== (run.conclusion ?? null) ||
          (record.state === 'passed' && (run.status !== 'completed' || run.conclusion !== 'success'))) fail();
      const jobs = await allPages(`/actions/runs/${run.id}/jobs?filter=latest`, 'jobs');
      if (jobs.some(j => !Number.isSafeInteger(j.id) || j.run_id !== run.id ||
          j.run_attempt !== run.run_attempt || typeof j.name !== 'string')) fail();
      const reduced = jobs.map(j => ({ name: j.name, status: j.status, conclusion: j.conclusion }));
      const required = REQUIRED_JOBS[name];
      const complete = run.status === 'completed' && run.conclusion === 'success' &&
        jobs.length > 0 && jobs.every(j => j.status === 'completed' && j.conclusion === 'success') &&
        required.every(job => jobs.filter(j => j.name === job).length === 1);
      if ((record.state === 'passed') !== complete) fail();
      evidence.push({ workflow: name, repository: REPOSITORY, headSha: commitSha,
        provenanceVerified: true, runId: run.id, runAttempt: run.run_attempt,
        status: run.status, conclusion: run.conclusion, jobs: reduced });
    }
    const allSuccess = evidence.every(e => e.provenanceVerified &&
      e.status === 'completed' && e.conclusion === 'success' && e.jobs.length > 0);
    if ((report.status === 'passed') !== allSuccess) fail();
    return evidence;
  } });
}
