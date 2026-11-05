/**
 * Cross-PR synthetic acceptance: execute actual module exports from immutable
 * source checkouts. All provider and GitHub I/O is injected and mocked.
 * This suite NEVER contacts Gemini, Workers AI, GitHub REST, or a Brain runtime.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.env.ACCEPTANCE_SOURCE_DIR;
if (!root) throw new Error('ACCEPTANCE_SOURCE_DIR must point to the pinned, read-only PR checkouts');
const load = (name, path) => import(pathToFileURL(resolve(root, name, path)).href);
const [lanes, a, b, testing, integration, compat] = await Promise.all([
  load('scaffold', 'automation/brain-worker-executors/build-lanes.mjs'),
  load('gemini', 'automation/brain-worker-executors/providers/gemini/adapter.mjs'),
  load('gemma', 'automation/brain-worker-executors/providers/gemma/index.mjs'),
  load('testing', 'automation/brain-worker-executors/testing/index.mjs'),
  load('integration', 'automation/brain-worker-executors/integration/index.mjs'),
  load('integration', 'automation/brain-worker-executors/integration/compat.mjs')
]);

const SHA = 'a'.repeat(40);
const BAD_SHA = 'b'.repeat(40);
const PATH = 'automation/acceptance-example.mjs';
const NOW = Date.now();
const uuid = n => '11111111-1111-4111-8111-' + String(n).padStart(12, '0');
const task = (lane = 'A', n = 1, type = 'build') => ({
  taskId: uuid(n), receiptId: uuid(n + 100), commitSha: SHA,
  type, ...(type === 'build' ? { lane } : {}), paths: [PATH]
});
const receipt = t => ({
  verified: true, issuer: 'central-brain', audience: integration.AUDIENCE,
  repository: integration.REPOSITORY, approved: true, taskId: t.taskId,
  receiptId: t.receiptId, commitSha: t.commitSha, type: t.type,
  lane: t.type === 'build' ? t.lane : null,
  expiresAtMs: NOW + 60_000, allowedPaths: t.paths,
  permissions: { draftOnly: true, merge: false, deploy: false }
});
const proposalA = {
  summary: 'Synthetic edit',
  changes: [{ path: PATH, content: 'export const value = 2;', rationale: 'Mock fixture' }],
  testNotes: ['Run offline acceptance'], risks: ['Requires human review']
};
const geminiResponse = () => new Response(JSON.stringify({
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(proposalA) }] } }],
  usageMetadata: { promptTokenCount: 320, candidatesTokenCount: 85 }
}), { status: 200 });

function geminiFixture(t, overrides = {}) {
  const calls = { provider: 0, reserves: 0, receipts: [] };
  const job = { taskId: t.taskId, commitSha: t.commitSha, paths: t.paths,
    instruction: 'Propose one scoped adjustment', sourceFiles: [{ path: PATH, content: 'export const value = 1;' }],
    approved: true };
  const options = {
    job, key: 'FAKE_TEST_ONLY_NOT_A_REAL_SECRET', modelId: 'gemini-2.5-flash-lite',
    liveEnabled: true, timeoutMs: 250, now: () => NOW, sleep: async () => {},
    authorizeAttempt: async c => {
      calls.reserves++;
      return {
        authorized: true, source: 'central-brain', provider: 'gemini', operation: a.BUILD_A_OPERATION,
        taskId: c.taskId, commitSha: c.commitSha, modelId: c.modelId, requestHash: c.requestHash,
        scopeHash: c.scopeHash, attempt: c.attempt, modelAccessVerified: true,
        credentialBindingVerified: true, priceAndFxVerified: true, durableReservation: true,
        reservationId: 'test_reservation_' + c.attempt, budgetCapEurMicros: 20_000_000,
        reservedEurMicros: 30_000, quotedMaxEurMicros: 25_000,
        remainingAfterReserveEurMicros: 19_000_000, expiresAtEpochMs: NOW + 30_000,
        ledgerPeriod: new Date(NOW).toISOString().slice(0, 7)
      };
    },
    recordAttempt: async x => { calls.receipts.push(x); },
    fetchGoogle: async (url, init) => {
      calls.provider++;
      assert.match(url, /^https:\/\/generativelanguage\.googleapis\.com\//);
      assert.equal(init.redirect, 'manual');
      return geminiResponse();
    },
    ...overrides
  };
  return { options, calls };
}

function gemmaFixture(t, overrides = {}) {
  const calls = { provider: 0, reserves: 0, settlements: [] };
  const budget = {
    reserve: async r => {
      calls.reserves++;
      return { approved: true, currency: 'USD', modelId: r.modelId,
        eventId: r.eventId, amountUsd: r.amountUsd, reservationId: 'test_reservation_12345678',
        expiresAt: new Date(NOW + 60_000).toISOString() };
    },
    settle: async x => { calls.settlements.push(x); }
  };
  const api = { run: async () => {
    calls.provider++;
    return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
      summary: 'Synthetic edit', risk: 'low', files: [
        { path: PATH, replacement: 'export const value = 3;', reason: 'Mock fixture' }
      ], tests: ['node --test']
    }) } }] };
  } };
  const executor = b.createGemmaExecutor({
    api, budget, enabled: true, inventoryVerified: true,
    now: () => NOW, sleep: async () => {}, ...overrides
  });
  const nativeTask = { eventId: t.taskId, commitSha: t.commitSha,
    approved: true, paths: t.paths, prompt: 'Suggest a small fix' };
  return { executor, nativeTask, calls };
}

function githubFixture(sha = SHA, edits = {}) {
  const repo = 'dizigs/archelaos-site', repoId = 12345, branch = 'test/synthetic';
  const runs = testing.REQUIRED_WORKFLOWS.map((w, index) => ({
    id: 600 + index, workflow_id: 300 + index, path: w.path, head_sha: sha,
    head_branch: branch, repository: { id: repoId, full_name: repo },
    head_repository: { id: repoId, full_name: repo }, run_attempt: 1,
    status: 'completed', conclusion: 'success', event: 'pull_request'
  }));
  if (typeof edits.runs === 'function') edits.runs(runs);
  const fetchImpl = async url => {
    const u = new URL(url), path = u.pathname;
    let data;
    if (path === '/repos/' + repo) data = { full_name: repo, id: repoId };
    else if (path === '/repos/' + repo + '/commits/' + sha) {
      data = { sha, url: 'https://api.github.com/repos/' + repo + '/commits/' + sha };
    } else if (path === '/repos/' + repo + '/actions/runs') {
      data = { workflow_runs: runs, total_count: edits.totalCount ?? runs.length };
    } else {
      const match = path.match(/\/actions\/runs\/(\d+)\/jobs$/);
      if (!match) throw Error('unexpected mocked GET: ' + path);
      const run = runs.find(r => r.id === Number(match[1]));
      if (!run) throw Error('unknown run');
      const required = testing.REQUIRED_WORKFLOWS.find(w => w.path === run.path);
      const jobs = required.jobs.map((name, i) => ({
        id: run.id * 10 + i, run_id: run.id, run_attempt: run.run_attempt,
        name, status: 'completed', conclusion: 'success'
      }));
      if (typeof edits.jobs === 'function') edits.jobs(jobs, run);
      data = { jobs, total_count: jobs.length };
    }
    return new Response(JSON.stringify(data), { status: 200 });
  };
  const readback = report => report.checks.map(c => {
    const run = runs.find(r => r.id === c.runId);
    // Native test report does not itself prove provenance or run attempt:
    // do not mint verified evidence without independently reading the run.
    if (!run || run.head_sha !== sha || run.repository.full_name !== repo ||
        run.head_repository.full_name !== repo || run.path !== c.workflow) {
      throw Error('invalid mocked run provenance');
    }
    return {
      workflow: c.workflow.replace('.github/workflows/', ''),
      repository: run.repository.full_name, headSha: run.head_sha,
      provenanceVerified: true, runId: run.id, runAttempt: run.run_attempt,
      status: run.status, conclusion: run.conclusion, jobs: c.jobs
    };
  });
  return { fetchImpl, runs, readback, repo, branch };
}

test('native model registries and scaffold lane contracts match', () => {
  assert.equal(lanes.BUILD_LANES.A.provider, 'gemini');
  assert.equal(lanes.BUILD_LANES.B.provider, 'gemma');
  assert.ok(a.FLASH_LITE_MODELS.includes('gemini-2.5-flash-lite'));
  assert.equal(b.MODEL_ID, '@cf/google/gemma-4-26b-a4b-it');
  assert.equal(integration.MONTHLY_CAP_MICRO_EUR, 20_000_000);
});

test('both native providers remain disabled without operator enablement', async () => {
  const t = task();
  const f = geminiFixture(t, { liveEnabled: false });
  await assert.rejects(a.executeGeminiBuildA(f.options), { code: 'GEMINI_BUILD_A_DISABLED' });
  assert.equal(f.calls.provider, 0);
  assert.equal(f.calls.reserves, 0);
  const g = gemmaFixture(task('B', 2), { enabled: false });
  const response = await g.executor.run(g.nativeTask);
  assert.equal(response.reason, 'operator_disabled');
  assert.equal(g.calls.provider, 0);
  assert.equal(g.calls.reserves, 0);
});

test('Gemini mock transport -> real provider adapter -> real coordinator proposal contract', async () => {
  const t = task('A', 3), fixture = geminiFixture(t);
  const native = await a.executeGeminiBuildA(fixture.options);
  const normalized = compat.normalizeNativeProposal(t, receipt(t), native, NOW);
  assert.equal(fixture.calls.provider, 1);
  assert.equal(fixture.calls.reserves, 1);
  assert.equal(fixture.calls.receipts[0].kind, 'success');
  assert.equal(normalized.status, 'PROPOSAL_REVIEW_ONLY');
  assert.equal(normalized.changes[0].path, PATH);
  assert.equal(normalized.draftPrCreated, false);
  assert.equal(normalized.ledgerReconciled, false);
  assert.equal(normalized.mergeAllowed, false);
});

test('Gemma native output without an attested SHA is rejected by canonical integration', async () => {
  const t = task('B', 4), fixture = gemmaFixture(t);
  const native = await fixture.executor.run(fixture.nativeTask);
  // #211 currently omits commitSha. Supplying it from the task would forge
  // provenance and incorrectly promote an unverified proposal.
  assert.equal(native.commitSha, undefined);
  assert.throws(() => compat.normalizeNativeProposal(t, receipt(t), native, NOW),
    { code: 'GEMMA_OUTPUT_CONTRACT_MISMATCH' });
  assert.equal(fixture.calls.provider, 1);
  assert.equal(fixture.calls.reserves, 1);
  assert.equal(fixture.calls.settlements[0].status, 'consumed');
  assert.equal(native.writesPerformed, false);
  assert.equal(native.mergeAllowed, false);
});

test('unauthorized receipt and out-of-scope provider edits fail closed without writes', async () => {
  const t = task('A', 5), fixture = geminiFixture(t);
  const native = await a.executeGeminiBuildA(fixture.options);
  assert.throws(() => compat.normalizeNativeProposal(t, { ...receipt(t), approved: false }, native, NOW));
  const tampered = structuredClone(native);
  tampered.proposal.changes[0].path = 'automation/elsewhere.mjs';
  assert.throws(() => compat.normalizeNativeProposal(t, receipt(t), tampered, NOW));
  assert.equal(native.githubWritesPerformed, false);
});

test('Gemma budget validation blocks invalid reserve before mock model call', async () => {
  const t = task('B', 6), fixture = gemmaFixture(t);
  const denied = gemmaFixture(t, { budget: {
    reserve: async r => ({ approved: false, eventId: r.eventId }),
    settle: async () => { throw Error('must not settle'); }
  } });
  await assert.rejects(denied.executor.run(denied.nativeTask), { code: 'unverified_budget_reservation' });
  assert.equal(denied.calls.provider, 0);
  assert.equal(fixture.calls.provider, 0);
});

test('Testing executor checks all eight workflows for one immutable SHA', async () => {
  const fx = githubFixture();
  const report = await testing.runTestingExecutor({
    repo: fx.repo, sha: SHA, token: 'OFFLINE_FAKE_TOKEN', branch: fx.branch,
    fetchImpl: fx.fetchImpl, sleep: async () => {},
    limits: { maxPolls: 1, pollIntervalMs: 0 }
  });
  assert.equal(report.status, 'passed', JSON.stringify(report));
  assert.equal(report.sha, SHA);
  assert.equal(report.checks.length, integration.REQUIRED_CHECKS.length);
  const t = task(undefined, 7, 'testing');
  const native = compat.inspectNativeTestingReport(t, receipt(t), report, NOW);
  assert.equal(native.status, 'NEEDS_AUTHORITATIVE_RUN_ATTEMPT_READBACK');
  assert.equal(native.testingGatePassed, false);
  const gate = integration.evaluateTestingGate(SHA, fx.readback(report));
  assert.equal(gate.passed, true, JSON.stringify(gate));
});

test('newer failed CI run overrides older green run (exact SHA)', async () => {
  const fx = githubFixture(SHA, { runs: runs => {
    const stale = runs[0];
    runs.push({ ...stale, id: 9999, conclusion: 'failure' });
  } });
  const report = await testing.runTestingExecutor({
    repo: fx.repo, sha: SHA, token: 'OFFLINE_FAKE_TOKEN', branch: fx.branch,
    fetchImpl: fx.fetchImpl, sleep: async () => {},
    limits: { maxPolls: 1, pollIntervalMs: 0 }
  });
  assert.equal(report.status, 'blocked');
});

test('failed/skipped/missing/wrong SHA/duplicated runs all block the final gate', () => {
  const fx = githubFixture();
  const checks = integration.REQUIRED_CHECKS.map((workflow, i) => ({
    workflow, repository: fx.repo, headSha: SHA, provenanceVerified: true,
    runId: 400 + i, runAttempt: 1, status: 'completed', conclusion: 'success',
    jobs: integration.REQUIRED_JOBS[workflow].map(name => ({ name, status: 'completed', conclusion: 'success' }))
  }));
  assert.equal(integration.evaluateTestingGate(SHA, checks).passed, true);
  assert.equal(integration.evaluateTestingGate(SHA, checks.slice(1)).passed, false);
  assert.equal(integration.evaluateTestingGate(SHA, [...checks, checks[0]]).passed, false);
  assert.equal(integration.evaluateTestingGate(SHA, checks.map(c => ({ ...c, headSha: BAD_SHA }))).passed, false);
  assert.equal(integration.evaluateTestingGate(SHA,
    checks.map((c, i) => i === 0 ? { ...c, conclusion: 'skipped' } : c)).passed, false);
});

test('native testing executor blocks incomplete GitHub pagination', async () => {
  const fx = githubFixture(SHA, { totalCount: 999 });
  const report = await testing.runTestingExecutor({
    repo: fx.repo, sha: SHA, token: 'OFFLINE_FAKE_TOKEN', branch: fx.branch,
    fetchImpl: fx.fetchImpl, sleep: async () => {},
    limits: { maxPolls: 1, pollIntervalMs: 0, maxPages: 1 }
  });
  assert.equal(report.status, 'blocked');
});

test('legacy integration refuses even apparently approved double-reserving native adapters', async () => {
  const t = task('A', 10);
  const counters = { calls: 0, reserves: 0 };
  const port = {
    brain: {
      verifyTaskReceipt: async () => receipt(t),
      readControls: async () => ({ globalPaused: false, aiPaused: false }),
      ledger: {
        reserve: async () => { counters.reserves++; return { accepted: true }; },
        claim: async () => ({ authorized: true }),
        settle: async () => ({ confirmed: true })
      }
    },
    coordinator: { claim: () => ({ status: 'CLAIMED' }), finish: () => ({ status: 'SAFE_ABORT' }) },
    checks: { readVerified: async () => [] },
    builders: {
      A: { verified: true, billingContract: 'central-preclaimed-v1',
        reservesInternally: true, settlesInternally: true,
        execute: async () => { counters.calls++; } }
    }
  };
  assert.equal((await integration.runIntegration(t, port)).code, 'CANONICAL_BRAIN_ONLY');
  const result = await integration.runIntegration(t, port, {
    enabled: true, executionMode: 'staging-approved', providersAttested: true, centralLedgerConfirmed: true
  }, NOW);
  assert.equal(result.code, 'CANONICAL_BRAIN_ONLY');
  assert.equal(counters.calls, 0);
  assert.equal(counters.reserves, 0);
});

test('unverified positive Brain budget mocks cannot bypass review-only integration', async () => {
  for (const lane of ['A', 'B']) {
    const t = task(lane, lane === 'A' ? 11 : 12);
    const state = { reserves: 0, executes: 0, settles: 0 };
    const port = {
      brain: {
        verifyTaskReceipt: async () => receipt(t),
        readControls: async () => ({ globalPaused: false, aiPaused: false }),
        ledger: {
          reserve: async () => {
            state.reserves++;
            return { accepted: true, shared: true, amountMicroEur: 1000, reservationId: 'MOCK_1000' };
          },
          claim: async () => ({ authorized: true }),
          settle: async () => { state.settles++; return { confirmed: true }; }
        }
      },
      coordinator: { claim: () => ({ status: 'CLAIMED' }), finish: () => ({ status: 'COMPLETE' }) },
      checks: { readVerified: async () => [] },
      builders: {
        [lane]: {
          verified: true, billingContract: 'central-preclaimed-v1',
          reservesInternally: false, settlesInternally: false,
          quote: async () => ({ verified: true, modelId: 'SYNTHETIC_MODEL_ONLY', maxMicroEur: 1000 }),
          execute: async () => {
            state.executes++;
            return { verified: true, commitSha: SHA, draftOnly: true,
              mergeAllowed: false, deployAllowed: false, changedFiles: [PATH],
              draftRef: '#300', actualMicroEur: 100 };
          }
        }
      }
    };
    const result = await integration.runIntegration(t, port, {
      enabled: true, executionMode: 'staging-approved',
      providersAttested: true, centralLedgerConfirmed: true
    }, NOW);
    assert.equal(result.status, 'BLOCKED', JSON.stringify(result));
    assert.equal(result.code, 'CANONICAL_BRAIN_ONLY');
    assert.deepEqual(state, { reserves: 0, executes: 0, settles: 0 });
    assert.equal(result.mergeAllowed, false);
    assert.equal(result.deployAllowed, false);
  }
});
