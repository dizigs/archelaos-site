import test from 'node:test';
import assert from 'node:assert/strict';
import { AUDIENCE, REPOSITORY, REQUIRED_JOBS } from './index.mjs';
import { normalizeNativeProposal, inspectNativeTestingReport } from './compat.mjs';

const commitSha = 'b'.repeat(40);
const uuid = n => '11111111-1111-4111-8111-' + String(n).padStart(12, '0');
const path = 'automation/example.js';
const task = (lane = 'A', type = 'build') => ({
  taskId: uuid(1), receiptId: uuid(2), commitSha, type,
  ...(type === 'build' ? { lane } : {}), paths: [path]
});
const authorized = t => ({
  verified: true, issuer: 'central-brain', audience: AUDIENCE,
  repository: REPOSITORY, approved: true, receiptId: t.receiptId,
  taskId: t.taskId, commitSha, type: t.type,
  lane: t.type === 'build' ? t.lane : null,
  expiresAtMs: Date.now() + 60_000, allowedPaths: [path],
  permissions: { draftOnly: true, merge: false, deploy: false }
});
const a = t => ({
  status: 'DRAFT_REVIEW_REQUIRED', provider: 'gemini', modelId: 'gemini-3.5-flash-lite',
  taskId: t.taskId, commitSha, reservationId: 'res_00000001',
  githubWritesPerformed: false, testsExecuted: false, mergeAllowed: false,
  deployAllowed: false,
  proposal: { summary: 'Patch', changes: [{ path, content: 'export const x = 1;', rationale: 'Test' }],
    testNotes: ['Run tests'], risks: ['Review'] }
});
const b = t => ({
  status: 'proposed', modelId: '@cf/google/gemma-4-26b-a4b-it',
  eventId: t.taskId, writesPerformed: false, mergeAllowed: false,
  deployAllowed: false,
  proposal: { summary: 'Patch', files: [{ path, replacement: 'export const x = 2;', reason: 'Fix' }],
    tests: ['Run tests'], risk: 'low' }
});
const native = () => ({
  status: 'passed', sha: commitSha, checks: Object.entries(REQUIRED_JOBS).map(([workflow, names],i) => ({
    workflow: '.github/workflows/' + workflow, runId: 300 + i,
    state: 'passed', conclusion: 'success',
    jobs: names.map(name => ({ name, status: 'completed', conclusion: 'success' }))
  }))
});

test('Gemini proposal is normalized but never represented as PR/CI/settled money', () => {
  const t = task(), r = normalizeNativeProposal(t, authorized(t), a(t));
  assert.equal(r.status, 'PROPOSAL_REVIEW_ONLY');
  assert.equal(r.modelId, 'gemini-3.5-flash-lite');
  assert.equal(r.changes[0].path, path);
  assert.equal(r.draftPrCreated, false);
  assert.equal(r.testsPassed, false);
  assert.equal(r.ledgerReconciled, false);
  assert.equal(r.mergeAllowed, false);
  assert.equal(Object.isFrozen(r.changes), true);
});

test('Gemma proposal uses its actual files/replacement/risks schema', () => {
  const t = task('B'), r = normalizeNativeProposal(t, authorized(t), b(t));
  assert.equal(r.status, 'PROPOSAL_REVIEW_ONLY');
  assert.equal(r.modelId, '@cf/google/gemma-4-26b-a4b-it');
  assert.equal(r.changes[0].content, 'export const x = 2;');
  assert.deepEqual(r.risks, ['low']);
});

test('missing Brain approval, receipt mismatch or wrong lane blocks proposals', () => {
  const t = task();
  assert.throws(() => normalizeNativeProposal(t, { ...authorized(t), approved: false }, a(t)));
  assert.throws(() => normalizeNativeProposal(t, authorized(t), { ...a(t), commitSha: 'f'.repeat(40) }));
  assert.throws(() => normalizeNativeProposal(t, authorized(t), b(t)));
  assert.throws(() => normalizeNativeProposal(t, authorized(t), { ...a(t), githubWritesPerformed: true }));
});

test('out of scope, traversal, duplicate path and oversized model output block', () => {
  const t = task(), good = a(t);
  for (const changes of [
    [{ path: 'brain/secrets.json', content: 'x', rationale: 'bad' }],
    [{ path: 'automation/../hello.js', content: 'x', rationale: 'bad' }],
    [good.proposal.changes[0], good.proposal.changes[0]],
    [{ path, content: 'a'.repeat(6001), rationale: 'bad' }],
    []
  ]) {
    assert.throws(() => normalizeNativeProposal(t, authorized(t), {
      ...good, proposal: { ...good.proposal, changes }
    }));
  }
});

test('Gemma output must have exact task binding and no false draft proof', () => {
  const t = task('B');
  assert.throws(() => normalizeNativeProposal(t, authorized(t), { ...b(t), eventId: uuid(3) }));
  assert.throws(() => normalizeNativeProposal(t, authorized(t), { ...b(t), mergeAllowed: true }));
  assert.throws(() => normalizeNativeProposal(t, authorized(t), {
    ...b(t), proposal: { ...b(t).proposal, files: [{ path: 'tests/unapproved.mjs', replacement: 'x', reason: 'x' }] }
  }));
});

test('native Testing report even passed requires independent run-attempt readback', () => {
  const t = task(undefined, 'testing');
  const r = inspectNativeTestingReport(t, authorized(t), native());
  assert.equal(r.status, 'NEEDS_AUTHORITATIVE_RUN_ATTEMPT_READBACK');
  assert.equal(r.testingGatePassed, false);
  assert.equal(r.mergeAllowed, false);
});

test('native Testing report blocks skipped, missing, failed and wrong SHA', () => {
  const t = task(undefined, 'testing'), good = native();
  assert.equal(inspectNativeTestingReport(t, authorized(t), {
    ...good, checks: good.checks.slice(1)
  }).status, 'TESTING_BLOCKED');
  assert.equal(inspectNativeTestingReport(t, authorized(t), {
    ...good, checks: good.checks.map((c,i) => i === 0 ? { ...c, state: 'skipped' } : c)
  }).status, 'TESTING_BLOCKED');
  assert.equal(inspectNativeTestingReport(t, authorized(t), {
    ...good, status: 'blocked'
  }).status, 'TESTING_BLOCKED');
  assert.throws(() => inspectNativeTestingReport(t, authorized(t), {
    ...good, sha: 'c'.repeat(40)
  }));
});
