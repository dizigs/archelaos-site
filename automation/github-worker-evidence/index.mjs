import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Read-only proof collector. This module never merges, deploys, writes GitHub or calls AI.
const SHA = /^[0-9a-f]{40}$/i;
const MAX_PAGES = 5;
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
    const query = 'query($owner:String!,$name:String!,$number:Int!,$after:String){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100,after:$after){nodes{isResolved}pageInfo{endCursor hasNextPage}}}}}';
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

export function evaluate({ task, issue, pull, checks, statuses, threads, requiredChecks, timestamp }) {
  const sha = pull?.head?.sha;
  const reasons = [];
  if (issue?.number !== task.issue || issue.pull_request) reasons.push('ISSUE_ID_OR_TYPE_MISMATCH');
  if (pull?.number !== task.pr || !SHA.test(sha || '')) reasons.push('PR_ID_OR_SHA_MISMATCH');
  if (pull?.base?.ref !== 'main' || pull?.base?.repo?.full_name !== task.repo ||
      pull?.head?.repo?.full_name !== task.repo) reasons.push('REPOSITORY_OR_BASE_MISMATCH');
  if (!Array.isArray(requiredChecks) || !requiredChecks.length) reasons.push('REQUIRED_POLICY_UNVERIFIED');
  if (!Array.isArray(checks) || !Array.isArray(statuses) || !Array.isArray(threads)) reasons.push('INCOMPLETE_PROOF');
  const currentChecks = (Array.isArray(checks) ? checks : []).filter(c => c.head_sha === sha);
  const byName = new Map();
  for (const check of currentChecks) {
    const key = check.name + ':' + (check.app?.slug || 'unknown');
    const old = byName.get(key);
    if (!old || Date.parse(check.started_at || '') >= Date.parse(old.started_at || '')) byName.set(key, check);
  }
  const effective = [...byName.values()];
  const statusesAtHead = (Array.isArray(statuses) ? statuses : []).filter(x => !x.sha || x.sha === sha);
  if (Array.isArray(statuses) && statusesAtHead.length !== statuses.length) reasons.push('STATUS_SHA_MISMATCH');
  const requiredResults = [];
  for (const name of Array.isArray(requiredChecks) ? requiredChecks : []) {
    const c = effective.filter(x => x.name === name);
    const s = statusesAtHead.filter(x => x.context === name);
    const passed = c.length ? c.every(x => x.status === 'completed' && x.conclusion === 'success')
      : s.length ? s[0].state === 'success' : false;
    requiredResults.push({ name, passed, urls: [...c.map(x => x.details_url), ...s.map(x => x.target_url)].filter(Boolean) });
    if (!passed) reasons.push('REQUIRED_CHECK_NOT_PASS:' + name);
  }
  const security = {};
  for (const [label, pattern] of [['codeql', /codeql/i], ['sonar', /sonar/i]]) {
    const found = effective.filter(x => pattern.test(x.name) || pattern.test(x.app?.slug || ''));
    security[label] = found.length > 0 && found.every(x => x.status === 'completed' && x.conclusion === 'success');
    if (!security[label]) reasons.push(label.toUpperCase() + '_NOT_VERIFIED');
  }
  const unresolved = Array.isArray(threads) ? threads.filter(x => x.isResolved !== true).length : null;
  if (unresolved === null || unresolved > 0) reasons.push('UNRESOLVED_OR_UNKNOWN_REVIEWS');
  if (pull?.state === 'closed' && !pull.merged_at) reasons.push('PR_CLOSED_UNMERGED');
  const merged = Boolean(pull?.merged_at);
  return {
    taskId: task.id, worker: task.worker, owner: issue?.assignee?.login || null,
    issueUrl: issue?.html_url || null, prUrl: pull?.html_url || null,
    branch: pull?.head?.ref || null, headSha: sha || null, baseSha: pull?.base?.sha || null,
    status: reasons.length ? 'BLOCKED' : merged ? 'CODE_MERGED' : 'IN_REVIEW',
    isDraft: pull?.draft ?? null, codeMerged: merged,
    requiredChecks: requiredResults, security, unresolvedReviewThreads: unresolved,
    providerDeployment: 'NOT_VERIFIED', privateBrainReceipt: 'NOT_VERIFIED',
    blockers: unique(reasons), verifiedAt: timestamp
  };
}

export async function scanTask(reader, task, timestamp = new Date().toISOString()) {
  required(task && Number.isInteger(task.issue) && Number.isInteger(task.pr), 'invalid task');
  const partial = { taskId: task.id, worker: task.worker, status: 'BLOCKED',
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
    return evaluate({ task: { ...task, repo: reader.repo }, issue, pull,
      checks: results[0].value, statuses: results[1].value,
      threads: results[2].value, requiredChecks: results[3].value, timestamp });
  } catch (error) {
    return { ...partial, blockers: ['GITHUB_READ_FAILED'], detail: error.message };
  }
}

export async function buildReport(reader, registry, timestamp = new Date().toISOString()) {
  required(registry?.repo === reader.repo && Array.isArray(registry.tasks), 'registry mismatch');
  const seen = new Set();
  const tasks = [];
  for (const task of registry.tasks) {
    required(/^[a-z0-9-]+$/.test(task.id) && !seen.has(task.id), 'duplicate or invalid task id');
    seen.add(task.id);
    tasks.push(await scanTask(reader, task, timestamp));
  }
  return {
    schemaVersion: 1, generatedAt: timestamp, repo: reader.repo,
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