import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, scanTask, GitHubReader } from './index.mjs';
const repo = 'dizigs/archelaos-site', sha = 'a'.repeat(40);
const now = () => new Date().toISOString();
const task = { id: 'photo', worker: 'photo-staging', issue: 243, pr: 240, repo };
const issue = { number: 243, state: 'open', assignee: { login: 'owner' }, html_url: 'https://github.com/dizigs/archelaos-site/issues/243' };
const pull = { number: 240, state: 'open', draft: true, merged_at: null,
  head: { sha, ref: 'branch', repo: { full_name: repo } },
  base: { sha: 'b'.repeat(40), ref: 'main', repo: { full_name: repo } } };
const idFor = name => name === 'syntax' ? 101 : name === 'CodeQL' ? 102 : 103;
const good = name => ({ id: idFor(name), name, head_sha: sha,
  status: 'completed', conclusion: 'success',
  started_at: now(), completed_at: now(),
  app: { id: name.includes('Sonar') ? 99 : 1,
    slug: name.includes('Sonar') ? 'sonarcloud' : 'github-actions' } });
const runProofs = () => [101, 102].map((checkId, i) => ({
  source: 'github-actions-api', checkId, runId: 1000 + i,
  jobId: 2000 + i, attempt: 1, commitSha: sha, observedAt: now()
}));
const evidence = () => ({ task, issue, pull, timestamp: now(), runProofs: runProofs(),
  checks: [good('syntax'),good('CodeQL'),good('SonarCloud Code Analysis')],
  statuses: [], threads: [], requiredChecks: ['syntax'] });
test('valid checks are not deployment proof', () => {
  const result = evaluate(evidence());
  assert.equal(result.status, 'IN_REVIEW');
  assert.equal(result.providerDeployment, 'NOT_VERIFIED');
});
test('merge is not deployment proof', () => {
  const source = evidence(); source.pull = { ...pull, merged_at: '2026-11-06', state: 'closed' };
  assert.equal(evaluate(source).status, 'CODE_MERGED');
  assert.equal(evaluate(source).providerDeployment, 'NOT_VERIFIED');
});
test('missing required policy blocks', () => {
  const source = evidence(); source.requiredChecks = [];
  assert.equal(evaluate(source).status, 'BLOCKED');
});
test('stale SHA blocks', () => {
  const source = evidence(); source.checks = source.checks.map(c => ({ ...c, head_sha: 'b'.repeat(40) }));
  assert.equal(evaluate(source).status, 'BLOCKED');
});
test('failed check blocks', () => {
  const source = evidence(); source.checks[0].conclusion = 'failure';
  assert.equal(evaluate(source).status, 'BLOCKED');
});
test('missing Sonar blocks', () => {
  const source = evidence(); source.checks = source.checks.filter(c => !c.name.includes('Sonar'));
  assert.equal(evaluate(source).status, 'BLOCKED');
});
test('unresolved reviews block', () => {
  const source = evidence(); source.threads = [{ isResolved: false }];
  assert.equal(evaluate(source).status, 'BLOCKED');
});
test('unexpected repo blocks', () => {
  const source = evidence(); source.pull = { ...pull, head: { ...pull.head, repo: { full_name: 'other/repo' } } };
  assert.equal(evaluate(source).status, 'BLOCKED');
});
test('review API failure blocks instead of success', async () => {
  const reader = { repo, issue: async () => issue, pull: async () => pull,
    checkRuns: async () => evidence().checks, statuses: async () => [], rules: async () => ['syntax'],
    threads: async () => { throw new Error('permission'); } };
  assert.equal((await scanTask(reader, task)).status, 'BLOCKED');
});
test('invalid SHA blocks before other calls', async () => {
  const reader = { repo, issue: async () => issue, pull: async () => ({ ...pull, head: { sha: 'bad' } }) };
  assert.deepEqual((await scanTask(reader, task)).blockers, ['INVALID_HEAD_SHA']);
});
test('API client denies out-of-scope requests', async () => {
  const reader = new GitHubReader({ repo, token: 'mock' });
  await assert.rejects(reader.request('/repos/another/repo/issues/1'), /out-of-scope/);
});
test('missing Actions run/job/attempt proof blocks CI_PASS', () => {
  const source = evidence(); source.runProofs = [];
  const result = evaluate(source);
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.proofStates.ci, 'UNKNOWN');
  assert.ok(result.blockers.includes('EXACT_HEAD_RUN_JOB_PROOF_MISSING'));
});
test('immutable worker proof is not invented from GitHub evidence', () => {
  const result = evaluate(evidence());
  assert.equal(result.workerIdentity.providerWorkerId, null);
  assert.equal(result.version, null);
  assert.equal(result.proofStates.deployment, 'UNKNOWN');
  assert.equal(result.proofStates.connection, 'UNKNOWN');
  assert.equal(result.proofStates.authentication, 'UNKNOWN');
});
test('missing owner fails closed', () => {
  const source = evidence(); source.issue = { ...issue, assignee: null };
  assert.equal(evaluate(source).status, 'BLOCKED');
});
test('stale observation fails closed', () => {
  const source = evidence(); source.timestamp = '2020-01-01T00:00:00Z';
  assert.ok(evaluate(source).blockers.includes('OBSERVATION_STALE_OR_INVALID'));
});
test('forged check ID and source app cannot pass', () => {
  const source = evidence(); source.checks[0].id = 'fake';
  assert.ok(evaluate(source).blockers.includes('CHECK_PROVENANCE_INVALID'));
});
test('wrong SHA on a commit status fails closed', () => {
  const source = evidence();
  source.statuses = [{ id: 300, sha: 'b'.repeat(40), context: 'extra',
    state: 'success', updated_at: now() }];
  assert.ok(evaluate(source).blockers.includes('STATUS_PROVENANCE_INVALID'));
});
test('deduplicates repeated check IDs', () => {
  const source = evidence(); source.checks.push({ ...source.checks[0] });
  const result = evaluate(source);
  assert.equal(result.status, 'IN_REVIEW');
  assert.equal(result.evidence.checks.length, 3);
});
test('future completed timestamp cannot attest success', () => {
  const source = evidence(); source.checks[0].completed_at = '2099-01-01T00:00:00Z';
  assert.ok(evaluate(source).blockers.includes('CHECK_PROVENANCE_INVALID'));
});
test('PR head drift during collection fails closed', async () => {
  let reads = 0;
  const reader = { repo, issue: async () => issue,
    pull: async () => (++reads === 1 ? pull : {
      ...pull, head: { ...pull.head, sha: 'b'.repeat(40) }
    }),
    checkRuns: async () => evidence().checks, statuses: async () => [],
    rules: async () => ['syntax'], threads: async () => [],
    ciRunProofs: async () => runProofs()
  };
  assert.deepEqual((await scanTask(reader, task)).blockers, ['PR_CHANGED_DURING_SCAN']);
});
test('provider 429 remains a hard read failure', async () => {
  const reader = new GitHubReader({ repo, token: 'synthetic', fetcher: async () => ({
    ok: false, status: 429
  }) });
  await assert.rejects(reader.issue(243), /HTTP 429/);
});
test('GraphQL mutation calls are forbidden even with a token', async () => {
  const reader = new GitHubReader({ repo, token: 'synthetic' });
  await assert.rejects(reader.request('/graphql', {
    body: { query: 'mutation { createIssue(input:{}) { clientMutationId } }', variables: { number: 1 } }
  }), /unapproved GraphQL query/);
});
test('API client requires token', async () => {
  const reader = new GitHubReader({ repo, token: '' });
  await assert.rejects(reader.issue(243), /TOKEN required/);
});