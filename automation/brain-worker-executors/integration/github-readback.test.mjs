import test from 'node:test';
import assert from 'node:assert/strict';
import { createVerifiedTestingChecksPort } from './github-readback.mjs';
import { REPOSITORY, REQUIRED_CHECKS, REQUIRED_JOBS } from './index.mjs';

const sha = 'a'.repeat(40);
const base = `https://api.github.com/repos/${REPOSITORY}`;
function fixtures() {
  const runs = REQUIRED_CHECKS.map((name, i) => ({ id: 100 + i,
    path: `.github/workflows/${name}`, head_sha: sha,
    repository: { id: 1, full_name: REPOSITORY },
    head_repository: { id: 1, full_name: REPOSITORY },
    head_branch: 'feature', workflow_id: 500 + i, event: 'pull_request',
    run_attempt: 2, status: 'completed', conclusion: 'success' }));
  const jobs = new Map(runs.map((r, i) => [r.id, REQUIRED_JOBS[REQUIRED_CHECKS[i]].map((name, j) => ({
    id: 9000 + i * 10 + j, run_id: r.id, run_attempt: 2, name,
    status: 'completed', conclusion: 'success' }))]));
  const report = () => ({ status: 'passed', sha, checks: runs.map((r,i) => ({
    workflow: r.path, runId: r.id, conclusion: r.conclusion, state: 'passed',
    jobs: jobs.get(r.id) })) });
  return { runs, jobs, report };
}
function port(f, custom = {}) {
  let requests = 0;
  const fetchImpl = async (url, options) => {
    requests++;
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer dummy-secret');
    const u = new URL(url), p = u.pathname;
    let value;
    if (url === base) value = { full_name: REPOSITORY, id: 1 };
    else if (p.endsWith(`/commits/${sha}`)) value = { sha, url: base + `/commits/${sha}` };
    else if (p.endsWith('/actions/runs')) value = { total_count: f.runs.length, workflow_runs: f.runs };
    else if (p.includes('/actions/runs/') && !p.endsWith('/jobs')) value = f.runs.find(r => r.id === Number(p.split('/').at(-1)));
    else if (p.endsWith('/jobs')) {
      const id = Number(p.split('/').at(-2));
      value = { total_count: f.jobs.get(id)?.length || 0, jobs: f.jobs.get(id) || [] };
    }
    if (!value) throw Error('Unexpected REST path ' + url);
    return new Response(JSON.stringify(value), { status: 200 });
  };
  const nativeRunner = async () => f.report();
  const input = { token: 'dummy-secret', fetchImpl, nativeRunner, branch: 'feature', maxRetries: 0, ...custom };
  return { readVerified: createVerifiedTestingChecksPort(input).readVerified, calls: () => requests };
}

test('attested native pass independently readbacks SHA, run attempt, job IDs and exact workflow paths', async () => {
  const f = fixtures(); const p = port(f);
  const evidence = await p.readVerified({ repository: REPOSITORY, commitSha: sha });
  assert.equal(evidence.length, 8);
  assert.ok(evidence.every(c => c.provenanceVerified && c.runAttempt === 2 &&
    c.status === 'completed' && c.conclusion === 'success'));
  assert.ok(p.calls() >= 19);
});
test('missing required workflow never becomes a pass', async () => {
  const f = fixtures(); const removed = f.runs.pop();
  f.report = () => ({ status: 'blocked', sha, checks: [...f.runs.map(r => ({
    workflow: r.path, runId: r.id, conclusion: r.conclusion, state: 'passed' })),
    { workflow: removed.path, runId: null, conclusion: null, state: 'missing' }] });
  const e = await port(f).readVerified({ repository: REPOSITORY, commitSha: sha });
  assert.equal(e.at(-1).provenanceVerified, false);
  assert.equal(e.at(-1).status, 'missing');
});
test('failed run remains independently attributable to GitHub for bounded Self-Heal routing', async () => {
  const f = fixtures(); f.runs[0].conclusion = 'failure';
  f.report = () => ({ status: 'blocked', sha, checks: f.runs.map((r, i) => ({
    workflow: r.path, runId: r.id, conclusion: r.conclusion,
    state: i === 0 ? 'failed' : 'passed' })) });
  const evidence = await port(f).readVerified({ repository: REPOSITORY, commitSha: sha });
  assert.equal(evidence[0].conclusion, 'failure');
  assert.equal(evidence[0].runId, 100);
  assert.equal(evidence[0].provenanceVerified, true);
});
test('wrong attempt and foreign GitHub repository are rejected', async () => {
  for (const mutation of [f => { f.jobs.get(100)[0].run_attempt = 1; },
    f => { f.runs[0].head_repository.id = 999; }]) {
    const f = fixtures(); mutation(f);
    await assert.rejects(port(f).readVerified({ repository: REPOSITORY, commitSha: sha }), /GITHUB_PROVENANCE_UNVERIFIED/);
  }
});
test('stale green run cannot override newer failed run', async () => {
  const f = fixtures(); const newer = { ...f.runs[0], id: 300, conclusion: 'failure' };
  const frozenReport = f.report();
  f.runs.push(newer);
  f.report = () => frozenReport;
  await assert.rejects(port(f).readVerified({ repository: REPOSITORY, commitSha: sha }), /GITHUB_PROVENANCE_UNVERIFIED/);
});
test('bad SHA, different repository and incomplete native report block before trusted handoff', async () => {
  const f = fixtures(); const p = port(f);
  await assert.rejects(p.readVerified({ repository: 'evil/repo', commitSha: sha }));
  await assert.rejects(p.readVerified({ repository: REPOSITORY, commitSha: 'short' }));
  f.report = () => ({ status: 'passed', sha, checks: [] });
  await assert.rejects(p.readVerified({ repository: REPOSITORY, commitSha: sha }));
  assert.equal(p.calls(), 0);
});

test('native blocked outcome never passes even when GitHub checks are green', async () => {
  const f=fixtures();
  const original=f.report();
  f.report=()=>({...original,status:'blocked'});
  await assert.rejects(port(f).readVerified({repository:REPOSITORY,commitSha:sha}),
    /GITHUB_PROVENANCE_UNVERIFIED/);
});
test('native failed state cannot be promoted by independent green GitHub checks', async () => {
  const f=fixtures();
  const original=f.report();
  f.report=()=>({...original,status:'blocked',checks:original.checks.map((r,i)=>
    i===0?{...r,state:'failed'}:r)});
  await assert.rejects(port(f).readVerified({repository:REPOSITORY,commitSha:sha}),
    /GITHUB_PROVENANCE_UNVERIFIED/);
});
