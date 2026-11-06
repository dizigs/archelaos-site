import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, scanTask, GitHubReader } from './index.mjs';
const repo = 'dizigs/archelaos-site', sha = 'a'.repeat(40);
const task = { id: 'photo', worker: 'photo-staging', issue: 243, pr: 240, repo };
const issue = { number: 243, state: 'open', html_url: 'https://github.com/dizigs/archelaos-site/issues/243' };
const pull = { number: 240, state: 'open', draft: true, merged_at: null,
  head: { sha, ref: 'branch', repo: { full_name: repo } },
  base: { sha: 'b'.repeat(40), ref: 'main', repo: { full_name: repo } } };
const good = name => ({ name, head_sha: sha, status: 'completed', conclusion: 'success',
  started_at: '2026-11-06T00:00:00Z', app: { slug: 'github-actions' } });
const evidence = () => ({ task, issue, pull, timestamp: '2026-11-06T00:00:00Z',
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
test('API client requires token', async () => {
  const reader = new GitHubReader({ repo, token: '' });
  await assert.rejects(reader.issue(243), /TOKEN required/);
});