/**
 * Independent coordinator capacity and budget contract tests.
 * Uses the production SqlCoordinator class with an in-memory SQLite-shaped fake.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (!process.env.ACCEPTANCE_SOURCE_DIR) throw Error('Missing pinned sources');
const file = resolve(process.env.ACCEPTANCE_SOURCE_DIR, 'integration',
  'automation/brain-worker-executors/integration/index.mjs');
const { SqlCoordinator, normalizeIntent, MONTHLY_CAP_MICRO_EUR, evaluateTestingGate } =
  await import(pathToFileURL(file).href);

const SHA = 'c'.repeat(40);
const id = n => '22222222-2222-4222-8222-' + String(n).padStart(12, '0');
const task = (n, lane, path) => normalizeIntent({
  taskId: id(n), receiptId: id(900 + n), type: 'build',
  lane, commitSha: SHA, paths: [path]
});
class FakeSql {
  constructor() { this.rows = new Map(); }
  exec(query, ...args) {
    if (query.startsWith('CREATE TABLE')) return [];
    if (query.startsWith('SELECT fingerprint,state')) {
      const r = this.rows.get(args[0]); return r ? [r] : [];
    }
    if (query.startsWith('SELECT type,scopes')) return [...this.rows.values()]
      .filter(r => ['CLAIMED', 'UNKNOWN'].includes(r.state)).slice(0, 201);
    if (query.startsWith('INSERT INTO integration_claims')) {
      const [task_id, fingerprint, type, state, scopes, created, updated] = args;
      this.rows.set(task_id, { task_id, fingerprint, type, state, scopes, created, updated });
      return [];
    }
    if (query.startsWith('SELECT state FROM')) {
      const r = this.rows.get(args[0]); return r ? [r] : [];
    }
    if (query.startsWith('UPDATE integration_claims')) {
      const [state, updated, id] = args;
      Object.assign(this.rows.get(id), { state, updated });
      return [];
    }
    throw Error('Unexpected SQL in synthetic fixture');
  }
}
class FakeStore {
  constructor() { this.sql = new FakeSql(); }
  transactionSync(fn) { return fn(); }
}

test('at most two concurrent builds; UNKNOWN holds the lease until reconciled', () => {
  const c = new SqlCoordinator(new FakeStore());
  const first = task(1, 'A', 'automation/scope-a.mjs');
  const second = task(2, 'B', 'automation/scope-b.mjs');
  const third = task(3, 'A', 'automation/scope-c.mjs');
  assert.equal(c.claim(first).status, 'CLAIMED');
  assert.equal(c.claim(second).status, 'CLAIMED');
  assert.throws(() => c.claim(third), /TWO_BUILD_LIMIT_REACHED/);
  c.finish(first.taskId, 'UNKNOWN');
  assert.throws(() => c.claim(third), /TWO_BUILD_LIMIT_REACHED/);
  c.finish(second.taskId, 'COMPLETE');
  assert.equal(c.claim(third).status, 'CLAIMED');
});

test('file-scope overlap, replay and idempotency payload mutation fail closed', () => {
  const c = new SqlCoordinator(new FakeStore());
  const first = task(4, 'A', 'automation/scope-a.mjs');
  assert.equal(c.claim(first).status, 'CLAIMED');
  assert.equal(c.claim(first).status, 'REPLAY_BLOCKED');
  assert.throws(() => c.claim(task(5, 'B', 'automation/scope-a.mjs')), /FILE_SCOPE_BUSY/);
  assert.throws(() => c.claim({ ...first, paths: ['automation/changed.mjs'] }),
    /IDEMPOTENCY_PAYLOAD_CONFLICT/);
  c.finish(first.taskId, 'COMPLETE');
  assert.equal(c.claim(first).status, 'REPLAY_COMPLETE');
});

test('EUR20 ceiling and absent/unauthenticated testing evidence never grant permission', () => {
  assert.equal(MONTHLY_CAP_MICRO_EUR, 20_000_000);
  assert.equal(evaluateTestingGate(SHA, []).passed, false);
  assert.equal(evaluateTestingGate(SHA, [{
    workflow: 'rebuild-check.yml', headSha: SHA, repository: 'dizigs/archelaos-site',
    runId: 5, runAttempt: 1, status: 'completed', conclusion: 'success',
    provenanceVerified: false, jobs: []
  }]).passed, false);
});
