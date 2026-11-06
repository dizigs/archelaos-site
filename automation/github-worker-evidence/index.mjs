import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Read-only proof collector. This module never merges, deploys, writes GitHub or calls AI.
const SHA = /^[0-9a-f]{40}$/i;
const MAX_PAGES = 5;
const FRESHNESS_MS = 5 * 60 * 1000;
const THREAD_QUERY = 'query($owner:String!,$name:String!,$number:Int!,$after:String){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100,after:$after){nodes{id isResolved}pageInfo{endCursor hasNextPage}}}}}';
const dateMs = value => typeof value === 'string' ? Date.parse(value) : NaN;
const observedRecently = value => Number.isFinite(dateMs(value)) &&
  Math.abs(Date.now() - dateMs(value)) <= FRESHNESS_MS;
const checkProvenanceValid = (c, sha, now) =>
  c?.head_sha === sha && Number.isSafeInteger(c.id) && c.id > 0 &&
  Number.isSafeInteger(c.app?.id) && c.app.id > 0 &&
  typeof c.name === 'string' && c.name.length > 0 &&
  Number.isFinite(dateMs(c.started_at)) && dateMs(c.started_at) <= now + FRESHNESS_MS &&
  (c.status !== 'completed' || (Number.isFinite(dateMs(c.completed_at)) &&
    dateMs(c.completed_at) >= dateMs(c.started_at) && dateMs(c.completed_at) <= now + FRESHNESS_MS));
const statusProvenanceValid = (s, sha, now) =>
  s?.sha === sha && Number.isSafeInteger(s.id) && s.id > 0 &&
  typeof s.context === 'string' && Number.isFinite(dateMs(s.updated_at)) &&
  dateMs(s.updated_at) <= now + FRESHNESS_MS;
function required(value, message) { if (!value) throw new Error(message); return value; }
function unique(values) { return [...new Set(values)]; }
function safeNumber(number) { required(Number.isSafeInteger(number) && number > 0, 'invalid issue/PR number'); return number; }

export class GitHubReader {
  constructor({ repo, token, fetcher = fetch }) {
    required(/^[\w.-]+\/[\w.-]+$/.test(repo), 'invalid repository');
    this.repo = repo;
    this.token = token;
    this.fetcher = fetcher;
  }
  async request(path, options = {}) {
    required(this.token, 'GITHUB_TOKEN required');
    const method = options.body ? 'POST' : 'GET';
    // A POST to GitHub GraphQL may be a mutation. Only our constant read query is allowed.
    if (path === '/graphql') required(options.body?.query === THREAD_QUERY &&
      typeof options.body.variables?.number === 'number' &&
      !options.body.variables?.query, 'unapproved GraphQL query');
    required(path === '/graphql' || path.startsWith('/repos/' + this.repo + '/'), 'out-of-scope API path');
    required(method === 'GET' || path === '/graphql', 'writes forbidden');
    const response = await this.fetcher('https://api.github.com' + path, {
      method,
      headers: {
        Authorization: 'Bearer ' + this.token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error('GitHub HTTP ' + response.status + ' for ' + path.split('?')[0]);
    const data = await response.json();
    if (Array.isArray(data.errors) && data.errors.length) throw new Error('GitHub GraphQL error');
    return data;
  }
  get(path) { return this.request('/repos/' + this.repo + path); }
  issue(number) { return this.get('/issues/' + safeNumber(number)); }
  pull(number) { return this.get('/pulls/' + safeNumber(number)); }
  async paginated(path, select) {
    const all = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const data = await this.get(path + (path.includes('?') ? '&' : '?') + 'per_page=100&page=' + page);
      const rows = select(data);
      required(Array.isArray(rows), 'invalid paginated evidence');
      all.push(...rows);
      if (rows.length < 100) return all;
    }
    throw new Error('pagination limit exceeded');
  }
  checkRuns(sha) {
    required(SHA.test(sha), 'invalid SHA');
    return this.paginated('/commits/' + sha + '/check-runs', x => x.check_runs);
  }
  async ciRunProofs(checks, requiredChecks) {
    const requiredNames = new Set(requiredChecks);
    const target = checks.filter(c => c.app?.slug === 'github-actions' &&
      (requiredNames.has(c.name) || /codeql|sonar/i.test(c.name)));
    if (target.length > 25) throw new Error('too many CI proof candidates');
    const proofs = [];
    for (const check of target) {
      const url = new URL(check.details_url || 'https://invalid.invalid/');
      const parts = url.pathname.split('/');
      if (url.hostname !== 'github.com' || parts[1] !== this.repo.split('/')[0] ||
          parts[2] !== this.repo.split('/')[1] || parts[3] !== 'actions' ||
          parts[4] !== 'runs' || parts[6] !== 'job') continue;
      const runId = Number(parts[5]), jobId = Number(parts[7]);
      if (!Number.isSafeInteger(runId) || runId < 1 ||
          !Number.isSafeInteger(jobId) || jobId < 1) continue;
      const [run, jobs] = await Promise.all([
        this.get('/actions/runs/' + runId),
        this.get('/actions/runs/' + runId + '/jobs?per_page=100')
      ]);
      if (jobs?.total_count > 100) throw new Error('CI job pagination required');
      const job = jobs?.jobs?.find(j => j.id === jobId);
      if (run?.id !== runId || run.head_sha !== check.head_sha ||
          run?.repository?.full_name !== this.repo ||
          run.status !== 'completed' || run.conclusion !== 'success' ||
          !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1 ||
          job?.id !== jobId || job.run_id !== runId || job.head_sha !== check.head_sha ||
          job.status !== 'completed' || job.conclusion !== 'success' ||
          (job.check_run_url && !job.check_run_url.endsWith('/' + check.id))) {
        throw new Error('CI run/job provenance mismatch');
      }
      proofs.push({
        source: 'github-actions-api', checkId: check.id, runId, jobId,
        attempt: run.run_attempt, commitSha: run.head_sha,
        observedAt: new Date().toISOString(),
        url: 'https://github.com/' + this.repo + '/actions/runs/' + runId
      });
    }
    return proofs;
  }
  statuses(sha) {
    required(SHA.test(sha), 'invalid SHA');
    return this.paginated('/commits/' + sha + '/statuses', x => x);
  }
  async rules(branch) {
    required(/^[\w./-]+$/.test(branch) && !branch.includes('..'), 'invalid branch');
    const data = await this.get('/rules/branches/' + encodeURIComponent(branch));
    required(Array.isArray(data), 'effective rules unavailable');
    return unique(data.filter(x => x.type === 'required_status_checks')
      .flatMap(x => x.parameters?.required_status_checks || [])
      .map(x => x.context).filter(Boolean));
  }
  async threads(number) {
    safeNumber(number);
    const [owner, name] = this.repo.split('/');
    const query = THREAD_QUERY;
    let after = null;
    const all = [];
    for (let i = 0; i < MAX_PAGES; i++) {
      const response = await this.request('/graphql', { body: { query, variables: { owner, name, number, after } } });
      const part = response?.data?.repository?.pullRequest?.reviewThreads;
      required(part && Array.isArray(part.nodes), 'review thread proof unavailable');
      all.push(...part.nodes);
      if (!part.pageInfo?.hasNextPage) return all;
      after = required(part.pageInfo.endCursor, 'missing review cursor');
    }
    throw new Error('review thread pagination limit');
  }
}

export function evaluate({ task, issue, pull, checks, statuses, threads, requiredChecks, runProofs = [], timestamp }) {
  const sha = pull?.head?.sha;
  const reasons = [];
  const now = Date.now();
  if (!observedRecently(timestamp)) reasons.push('OBSERVATION_STALE_OR_INVALID');
  if (!/^[a-z0-9-]+$/.test(task?.id || '') || !task?.worker) reasons.push('WORKER_IDENTITY_UNVERIFIED');
  if (!issue?.assignee?.login) reasons.push('OWNER_UNVERIFIED');
  if (issue?.number !== task.issue || issue.pull_request) reasons.push('ISSUE_ID_OR_TYPE_MISMATCH');
  if (pull?.number !== task.pr || !SHA.test(sha || '')) reasons.push('PR_ID_OR_SHA_MISMATCH');
  if (pull?.base?.ref !== 'main' || pull?.base?.repo?.full_name !== task.repo ||
      pull?.head?.repo?.full_name !== task.repo) reasons.push('REPOSITORY_OR_BASE_MISMATCH');
  if (!Array.isArray(requiredChecks) || !requiredChecks.length) reasons.push('REQUIRED_POLICY_UNVERIFIED');
  if (!Array.isArray(checks) || !Array.isArray(statuses) || !Array.isArray(threads)) reasons.push('INCOMPLETE_PROOF');
  const rawChecks = Array.isArray(checks) ? checks : [];
  if (rawChecks.some(c => !checkProvenanceValid(c, sha, now))) reasons.push('CHECK_PROVENANCE_INVALID');
  const currentChecks = rawChecks.filter(c => checkProvenanceValid(c, sha, now));
  const checkIds = new Set();
  const deduplicatedChecks = currentChecks.filter(c => {
    if (checkIds.has(c.id)) return false;
    checkIds.add(c.id); return true;
  });
  const byName = new Map();
  for (const check of deduplicatedChecks) {
    const key = check.name + ':' + (check.app?.slug || 'unknown');
    const old = byName.get(key);
    if (!old || Date.parse(check.started_at || '') >= Date.parse(old.started_at || '')) byName.set(key, check);
  }
  const effective = [...byName.values()];
  const rawStatuses = Array.isArray(statuses) ? statuses : [];
  if (rawStatuses.some(s => !statusProvenanceValid(s, sha, now))) reasons.push('STATUS_PROVENANCE_INVALID');
  const statusIds = new Set();
  const statusesAtHead = rawStatuses.filter(x => {
    if (!statusProvenanceValid(x, sha, now) || statusIds.has(x.id)) return false;
    statusIds.add(x.id); return true;
  });
  const requiredResults = [];
  for (const name of Array.isArray(requiredChecks) ? requiredChecks : []) {
    const c = effective.filter(x => x.name === name);
    const s = statusesAtHead.filter(x => x.context === name);
    const passed = c.length ? c.every(x => x.status === 'completed' && x.conclusion === 'success')
      : s.length ? s[0].state === 'success' : false;
    requiredResults.push({ name, passed, urls: [...c.map(x => x.details_url), ...s.map(x => x.target_url)].filter(Boolean) });
    if (!passed) reasons.push('REQUIRED_CHECK_NOT_PASS:' + name);
  }
  const requiredActionChecks = effective.filter(c => c.app?.slug === 'github-actions' &&
    ((Array.isArray(requiredChecks) && requiredChecks.includes(c.name)) || /codeql|sonar/i.test(c.name)));
  const completeRunProofs = requiredActionChecks.every(c =>
    runProofs.some(p => p.source === 'github-actions-api' &&
      p.checkId === c.id && p.commitSha === sha &&
      Number.isSafeInteger(p.runId) && p.runId > 0 &&
      Number.isSafeInteger(p.jobId) && p.jobId > 0 &&
      Number.isSafeInteger(p.attempt) && p.attempt > 0 &&
      observedRecently(p.observedAt)));
  if (!requiredActionChecks.length || !completeRunProofs) reasons.push('EXACT_HEAD_RUN_JOB_PROOF_MISSING');
  const security = {};
  for (const [label, pattern] of [['codeql', /codeql/i], ['sonar', /sonar/i]]) {
    const found = effective.filter(x => pattern.test(x.name) || pattern.test(x.app?.slug || ''));
    security[label] = found.length > 0 && found.every(x => x.status === 'completed' && x.conclusion === 'success');
    if (!security[label]) reasons.push(label.toUpperCase() + '_NOT_VERIFIED');
  }
  const unresolved = Array.isArray(threads) ? threads.filter(x => x.isResolved !== true).length : null;
  if (unresolved === null || unresolved > 0) reasons.push('UNRESOLVED_OR_UNKNOWN_REVIEWS');
  if (pull?.state === 'closed' && !pull.merged_at) reasons.push('PR_CLOSED_UNMERGED');
  if (pull?.merged_at && !Number.isFinite(dateMs(pull.merged_at))) reasons.push('MERGED_TIMESTAMP_INVALID');
  const merged = Boolean(pull?.merged_at);
  return {
    taskId: task.id, worker: task.worker, owner: issue?.assignee?.login || null,
    issueUrl: issue?.html_url || null, prUrl: pull?.html_url || null,
    branch: pull?.head?.ref || null, headSha: sha || null, baseSha: pull?.base?.sha || null,
    status: reasons.length ? 'BLOCKED' : merged ? 'CODE_MERGED' : 'IN_REVIEW',
    proofStates: {
      code: SHA.test(sha || '') && pull?.number === task.pr ? 'CODE_READY' : 'UNKNOWN',
      ci: reasons.length ? 'UNKNOWN' : 'CI_PASS',
      deployment: 'UNKNOWN', connection: 'UNKNOWN', authentication: 'UNKNOWN'
    },
    workerIdentity: { registryTaskId: task.id, providerWorkerId: null, identityVerified: false },
    version: null, commitSha: sha || null, environment: null,
    evidence: {
      source: 'github-api-read-only', observedAt: timestamp,
      exactHeadSha: sha || null,
      checks: effective.map(c => ({
        source: 'github-check-runs', checkId: c.id, appId: c.app.id,
        appSlug: c.app.slug || null, name: c.name, commitSha: c.head_sha,
        startedAt: c.started_at, completedAt: c.completed_at || null,
        url: 'https://github.com/' + task.repo + '/runs/' + c.id
      })),
      runs: runProofs.map(p => ({ ...p })),
      statuses: statusesAtHead.map(s => ({
        source: 'github-commit-status', statusId: s.id, context: s.context,
        commitSha: s.sha, updatedAt: s.updated_at,
        state: s.state
      })),
      reviewThreads: {
        source: 'github-graphql-review-threads', count: threads?.length ?? null,
        unresolved, observedAt: timestamp
      }
    },
    isDraft: pull?.draft ?? null, codeMerged: merged,
    requiredChecks: requiredResults, security, unresolvedReviewThreads: unresolved,
    providerDeployment: 'NOT_VERIFIED', privateBrainReceipt: 'NOT_VERIFIED',
    blockers: unique(reasons), verifiedAt: timestamp
  };
}

export async function scanTask(reader, task, timestamp = new Date().toISOString()) {
  required(task && Number.isInteger(task.issue) && Number.isInteger(task.pr), 'invalid task');
  const partial = { taskId: task.id, worker: task.worker, status: 'BLOCKED',
    proofStates: { code: 'UNKNOWN', ci: 'UNKNOWN', deployment: 'UNKNOWN',
      connection: 'UNKNOWN', authentication: 'UNKNOWN' },
    workerIdentity: { registryTaskId: task.id, providerWorkerId: null, identityVerified: false },
    version: null, commitSha: null, environment: null,
    evidence: { source: 'github-api-read-only', observedAt: timestamp },
    headSha: null, providerDeployment: 'NOT_VERIFIED', privateBrainReceipt: 'NOT_VERIFIED',
    verifiedAt: timestamp };
  try {
    const [issue, pull] = await Promise.all([reader.issue(task.issue), reader.pull(task.pr)]);
    if (!SHA.test(pull?.head?.sha || '')) return { ...partial, blockers: ['INVALID_HEAD_SHA'] };
    const results = await Promise.allSettled([
      reader.checkRuns(pull.head.sha), reader.statuses(pull.head.sha),
      reader.threads(task.pr), reader.rules(pull.base.ref)
    ]);
    const types = ['CHECK_RUNS', 'STATUS', 'REVIEW_THREADS', 'REQUIRED_POLICY'];
    const failures = results.flatMap((r, i) => r.status === 'rejected' ? [types[i] + '_READ_FAILED'] : []);
    if (failures.length) return { ...partial, headSha: pull.head.sha,
      prUrl: pull.html_url, issueUrl: issue.html_url, blockers: failures };
    let runProofs;
    try { runProofs = await reader.ciRunProofs(results[0].value, results[3].value); }
    catch { return { ...partial, headSha: pull.head.sha,
      blockers: ['CI_RUN_JOB_READ_OR_ATTESTATION_FAILED'] }; }
    // Detect head changes between evidence collection and publication (TOCTOU).
    let freshPull;
    try { freshPull = await reader.pull(task.pr); }
    catch { return { ...partial, headSha: pull.head.sha, blockers: ['PR_HEAD_RECHECK_FAILED'] }; }
    if (freshPull?.head?.sha !== pull.head.sha || freshPull?.merged_at !== pull.merged_at ||
        freshPull?.state !== pull.state) {
      return { ...partial, headSha: pull.head.sha, blockers: ['PR_CHANGED_DURING_SCAN'] };
    }
    return evaluate({ task: { ...task, repo: reader.repo }, issue, pull: freshPull,
      checks: results[0].value, statuses: results[1].value,
      threads: results[2].value, requiredChecks: results[3].value,
      runProofs, timestamp });
  } catch (error) {
    return { ...partial, blockers: ['GITHUB_READ_FAILED'], detail: error.message };
  }
}

export async function buildReport(reader, registry, timestamp = new Date().toISOString()) {
  required(registry?.repo === reader.repo && Array.isArray(registry.tasks), 'registry mismatch');
  let mainSha = null;
  try {
    const branch = await reader.get('/branches/main');
    if (!SHA.test(branch?.commit?.sha || '')) throw new Error('invalid main SHA');
    mainSha = branch.commit.sha;
  } catch {
    // A missing provider readback must never be silently treated as current main.
  }
  const seen = new Set();
  const tasks = [];
  for (const task of registry.tasks) {
    required(/^[a-z0-9-]+$/.test(task.id) && !seen.has(task.id), 'duplicate or invalid task id');
    required(typeof task.worker === 'string' && task.worker.length > 0, 'invalid worker label');
    seen.add(task.id);
    const result = await scanTask(reader, task, timestamp);
    result.mainSha = mainSha;
    if (!mainSha) {
      result.status = 'BLOCKED';
      result.proofStates.ci = 'UNKNOWN';
      result.blockers = unique([...(result.blockers || []), 'MAIN_SHA_UNVERIFIED']);
    }
    tasks.push(result);
  }
  return {
    schemaVersion: 2, generatedAt: timestamp, repo: reader.repo,
    mainSha, mainShaSource: mainSha ? 'github-api-read-only' : 'UNKNOWN',
    authority: 'GitHub evidence; authoritative expense/execution ledger stays in canonical Brain',
    tasks
  };
}

async function cli() {
  const registry = JSON.parse(await readFile(new URL('./registry.json', import.meta.url), 'utf8'));
  const reader = new GitHubReader({ repo: registry.repo, token: process.env.GITHUB_TOKEN });
  const report = await buildReport(reader, registry);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (report.tasks.some(x => x.status === 'BLOCKED')) process.exitCode = 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli().catch(error => { process.stderr.write('worker-evidence: ' + error.message + '\n'); process.exitCode = 2; });
}