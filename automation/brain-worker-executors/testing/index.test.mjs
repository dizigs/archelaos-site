import test from 'node:test';
import assert from 'node:assert/strict';
import { runTestingExecutor, REQUIRED_WORKFLOWS } from './index.mjs';

const repo = 'dizigs/archelaos-site';
const sha = 'a'.repeat(40);
const token = 'mock-never-print';
const jobsFor = (spec, runId) => spec.jobs.map((name, i) => ({ id: runId * 10 + i, name, run_id: runId, run_attempt: 1, status: 'completed', conclusion: 'success' }));
function fixture() {
  const runs = REQUIRED_WORKFLOWS.map((spec, i) => ({ id: 1000 + i, path: spec.path, head_sha: sha, workflow_id: 900 + i, run_attempt: 1,
    event: 'pull_request', head_branch: 'feature/testing', status: 'completed', conclusion: 'success',
    repository: { full_name: repo, id: 77 }, head_repository: { full_name: repo, id: 77 } }));
  const jobs = new Map(runs.map((r, i) => [r.id, jobsFor(REQUIRED_WORKFLOWS[i], r.id)]));
  return { runs, jobs };
}
function mockApi(data, { httpError = 0, incomplete = false } = {}) {
  const requests = [];
  const fetchImpl = async (input, init) => {
    const u = new URL(input);
    requests.push({ path: u.pathname, method: init.method, auth: init.headers.Authorization });
    assert.equal(u.origin, 'https://api.github.com');
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    if (httpError) return new Response('error', { status: httpError });
    let body;
    if (u.pathname === `/repos/${repo}`) body = { full_name: repo, id: 77 };
    else if (u.pathname === `/repos/${repo}/commits/${sha}`) body = { sha, url: `https://api.github.com/repos/${repo}/commits/${sha}` };
    else if (u.pathname.endsWith('/actions/runs')) body = { total_count: incomplete ? 300 : data.runs.length, workflow_runs: data.runs };
    else {
      const id = Number(u.pathname.match(/\/actions\/runs\/(\d+)\/jobs$/)?.[1]);
      if (!id) throw new Error(`unexpected URL ${u.pathname}`);
      const jobs = data.jobs.get(id) || [];
      body = { total_count: jobs.length, jobs };
    }
    return new Response(JSON.stringify(body), { status: 200 });
  };
  return { fetchImpl, requests };
}
function options(api, more = {}) {
  return { repo, sha, token, branch: 'feature/testing', limits: { maxPolls: 1, maxRetries: 0, pollIntervalMs: 0 }, fetchImpl: api.fetchImpl, ...more };
}

test('eight real workflow paths and both CodeQL language jobs are pinned', () => {
  assert.equal(REQUIRED_WORKFLOWS.length, 8);
  assert.deepEqual(REQUIRED_WORKFLOWS.find(c => c.path.endsWith('codeql-security.yml')).jobs, ['CodeQL (javascript-typescript)', 'CodeQL (python)']);
});
test('passes only after all required workflows and jobs succeed on the exact SHA', async () => {
  const api = mockApi(fixture());
  const result = await runTestingExecutor(options(api));
  assert.equal(result.status, 'passed');
  assert.equal(result.sha, sha);
  assert.equal(result.checks.length, REQUIRED_WORKFLOWS.length);
  assert.ok(result.checks.every(x => x.state === 'passed'));
  assert.ok(api.requests.every(x => x.method === 'GET' && x.auth === `Bearer ${token}`));
});
test('missing required workflow cannot pass', async () => {
  const f = fixture(); f.runs.pop();
  const result = await runTestingExecutor(options(mockApi(f)));
  assert.equal(result.status, 'blocked');
  assert.ok(result.checks.some(x => x.state === 'missing'));
});
test('failed and cancelled runs block approval', async () => {
  for (const conclusion of ['failure', 'cancelled', 'skipped', 'timed_out']) {
    const f = fixture(); f.runs[0].conclusion = conclusion;
    const result = await runTestingExecutor(options(mockApi(f)));
    assert.equal(result.status, 'blocked');
    assert.equal(result.checks[0].state, 'failed');
  }
});
test('skipped job fails even if workflow claims success', async () => {
  const f = fixture(); f.jobs.get(f.runs[0].id)[0].conclusion = 'skipped';
  const r = await runTestingExecutor(options(mockApi(f)));
  assert.equal(r.status, 'blocked'); assert.equal(r.checks[0].state, 'failed');
});
test('missing CodeQL matrix language blocks', async () => {
  const f = fixture(); const codeql = f.runs.find(x => x.path.endsWith('codeql-security.yml'));
  f.jobs.set(codeql.id, [f.jobs.get(codeql.id)[0]]);
  const r = await runTestingExecutor(options(mockApi(f)));
  assert.equal(r.status, 'blocked');
});
test('commit and head-repository mismatch reject forged success', async () => {
  for (const edit of [f => { f.runs[0].head_sha = 'b'.repeat(40); }, f => { f.runs[0].head_repository.id = 999; }, f => { f.runs[0].repository.full_name = 'other/repo'; }, f => { f.runs[0].head_branch = 'main'; }]) {
    const f = fixture(); edit(f);
    const r = await runTestingExecutor(options(mockApi(f)));
    assert.equal(r.status, 'blocked');
  }
});
test('newer failed run takes precedence over earlier passed run', async () => {
  const f = fixture(); const failed = { ...f.runs[0], id: 9999, conclusion: 'failure' };
  f.runs.push(failed);
  const r = await runTestingExecutor(options(mockApi(f)));
  assert.equal(r.status, 'blocked'); assert.equal(r.checks[0].runId, 9999);
});
test('job from another attempt is rejected', async () => {
  const f = fixture(); f.jobs.get(f.runs[0].id)[0].run_attempt = 2;
  const r = await runTestingExecutor(options(mockApi(f)));
  assert.equal(r.status, 'blocked'); assert.equal(r.checks[0].state, 'untrusted');
});
test('pending required check exhausts bounded polls', async () => {
  const f = fixture(); f.runs[0].status = 'in_progress'; f.runs[0].conclusion = null;
  const api = mockApi(f); let sleeps = 0;
  const r = await runTestingExecutor(options(api, { limits: { maxPolls: 2, maxRetries: 0, pollIntervalMs: 0 }, sleep: async () => { sleeps++; } }));
  assert.equal(r.status, 'blocked'); assert.equal(sleeps, 1); assert.equal(r.checks[0].state, 'pending');
});
test('network errors and pagination truncation fail closed', async () => {
  const f = fixture();
  assert.equal((await runTestingExecutor(options(mockApi(f, { httpError: 503 })))).status, 'blocked');
  assert.equal((await runTestingExecutor(options(mockApi(f, { incomplete: true }), { limits: { maxPolls: 1, maxPages: 1, maxRetries: 0, pollIntervalMs: 0 } }))).status, 'blocked');
});
test('invalid identity and limits are rejected before network access', async () => {
  const api = mockApi(fixture());
  await assert.rejects(runTestingExecutor(options(api, { sha: 'short' })), /invalid/);
  await assert.rejects(runTestingExecutor(options(api, { token: '' })), /token required/);
  await assert.rejects(runTestingExecutor(options(api, { limits: { maxPolls: 1000 } })), /invalid maxPolls/);
  assert.equal(api.requests.length, 0);
});
