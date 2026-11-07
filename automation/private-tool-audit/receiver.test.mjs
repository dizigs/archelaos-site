import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  AuditFault, authenticateSignedEnvelope, canonicalBytes,
  canonicalEnvelope, createSignedAuditReceiver,
  signForTrustedProducer,
} from './receiver.mjs';

const SECRET = 'local-only-synthetic-HMAC-key-for-automated-tests-0000000000';
const UUID = n => '00000000-0000-4000-8000-' + n.toString(16).padStart(12, '0');
const TIME = Date.parse('2026-11-07T05:00:00.000Z');
const evidence = 'https://github.com/dizigs/archelaos-site/actions/runs/42344875512';
const READ_CAP = Symbol('private-verified-reader');

function record(id = 1, outcome = 'PASS') {
  return {
    eventId: UUID(id), toolId: 'github', commandId: 'checks', outcome,
    taskId: 'PR-280', commitSha: 'a'.repeat(40), evidenceUrl: evidence,
  };
}
function envelope(id = 1, nonce = 100, now = TIME, status = 'PASS') {
  return { v: 1, source: 'github-actions', issuedAt: now, nonce: UUID(nonce), record: record(id, status) };
}

function sqliteStorage() {
  const db = new DatabaseSync(':memory:');
  let injectFailure = false;
  const storage = {
    sql: {
      exec(query, ...args) {
        if (injectFailure && query.startsWith('INSERT INTO tool_audit_events(')) {
          injectFailure = false;
          throw new Error('SYNTHETIC_SQL_FAILURE');
        }
        const statement = db.prepare(query);
        return query.startsWith('SELECT') ? statement.all(...args) : (statement.run(...args), []);
      },
    },
    transactionSync(fn) {
      db.exec('BEGIN');
      try {
        const result = fn();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    failOneInsert() { injectFailure = true; },
    close() { db.close(); },
  };
  return storage;
}
function receiver(storage, options = {}, now = () => TIME) {
  return createSignedAuditReceiver({
    storage, secrets: new Map([['github-actions', SECRET]]),
    allowedCommands: new Map([['github-actions', new Map([['github', new Set(['checks'])]])]]),
    options, readerCapability: READ_CAP, now,
  });
}
function read(agent, query) { return agent.listAuthorized(READ_CAP, query); }
function submit(agent, e, key = SECRET) {
  return agent.ingest(e, signForTrustedProducer(e, key));
}
function assertError(fn, code) {
  assert.throws(fn, e => e instanceof AuditFault && e.code === code);
}

test('canonical envelope has an exact immutable record shape', () => {
  assert.deepEqual(JSON.parse(canonicalBytes(envelope())), canonicalEnvelope(envelope()));
  const bad = envelope(); bad.record.output = 'possibly private text';
  assertError(() => canonicalEnvelope(bad), 'INVALID_ENVELOPE');
});

test('strict evidence URLs reject query tokens and outside domains', () => {
  for (const url of [
    'https://github.com/dizigs/archelaos-site/actions/runs/1?token=xyz',
    'https://github.com.evil.example/dizigs/archelaos-site/actions/runs/1',
    'http://github.com/dizigs/archelaos-site/actions/runs/1',
    'https://docs.google.com/document/d/private',
  ]) {
    const bad = envelope(); bad.record.evidenceUrl = url;
    assertError(() => canonicalBytes(bad), 'INVALID_RECORD');
  }
});

test('signed claim validates actor, signature and 5-minute wall-clock', () => {
  const good = envelope();
  assert.equal(authenticateSignedEnvelope({
    envelope: good, signature: signForTrustedProducer(good, SECRET),
    secrets: { 'github-actions': SECRET }, now: TIME,
  }).source, 'github-actions');
  assertError(() => authenticateSignedEnvelope({
    envelope: good, signature: 'f'.repeat(64), secrets: { 'github-actions': SECRET }, now: TIME,
  }), 'BAD_SIGNATURE');
  assertError(() => authenticateSignedEnvelope({
    envelope: good, signature: signForTrustedProducer(good, SECRET),
    secrets: {}, now: TIME,
  }), 'UNKNOWN_SOURCE');
  assertError(() => authenticateSignedEnvelope({
    envelope: good, signature: signForTrustedProducer(good, SECRET),
    secrets: { 'github-actions': SECRET }, now: TIME + 300001,
  }), 'STALE_OR_FUTURE_RECEIPT');
});

test('signature covers every permitted field and prevents outcome tampering', () => {
  const signed = envelope();
  const sig = signForTrustedProducer(signed, SECRET);
  const tampered = structuredClone(signed);
  tampered.record.outcome = 'FAIL';
  assertError(() => authenticateSignedEnvelope({
    envelope: tampered, signature: sig, secrets: new Map([['github-actions', SECRET]]), now: TIME,
  }), 'BAD_SIGNATURE');
});

test('no source-only receiver can accept unknown commands', () => {
  const s = sqliteStorage();
  try {
    const api = receiver(s);
    const e = envelope(); e.record.commandId = 'deploy';
    assertError(() => submit(api, e), 'COMMAND_NOT_ALLOWLISTED');
    assert.equal(read(api, ).length, 0);
  } finally { s.close(); }
});


test('source-scoped HMAC producer cannot use another producer command', () => {
  const s = sqliteStorage();
  const otherSecret = 'synthetic-second-source-secret-with-at-least-32-bytes';
  try {
    const api = createSignedAuditReceiver({
      storage: s,
      secrets: new Map([['github-actions', SECRET], ['manual-review', otherSecret]]),
      allowedCommands: new Map([
        ['github-actions', new Map([['github', new Set(['checks'])]])],
        ['manual-review', new Map([['github', new Set(['annotations'])]])],
      ]),
      readerCapability: READ_CAP, now: () => TIME,
    });
    const stolenCommand = envelope(20, 120);
    stolenCommand.record.commandId = 'annotations';
    assertError(() => submit(api, stolenCommand), 'COMMAND_NOT_ALLOWLISTED');
    const reversed = envelope(21, 121);
    reversed.source = 'manual-review';
    assertError(() => submit(api, reversed, otherSecret), 'COMMAND_NOT_ALLOWLISTED');
    assert.equal(read(api).length, 0);
    const allowed = envelope(22, 122);
    allowed.source = 'manual-review';
    allowed.record.commandId = 'annotations';
    assert.equal(submit(api, allowed, otherSecret).status, 'RECORDED');
    assert.equal(read(api).length, 1);
  } finally { s.close(); }
});

test('legacy global tool grants are refused instead of silently inherited', () => {
  const s = sqliteStorage();
  try {
    assertError(() => createSignedAuditReceiver({
      storage: s, secrets: new Map([['github-actions', SECRET]]),
      allowedCommands: new Map([['github', new Set(['checks'])]]),
      readerCapability: READ_CAP, now: () => TIME,
    }), 'TRUSTED_POLICY_REQUIRED');
    assert.equal(receiver(s) !== null, true);
  } finally { s.close(); }
});

test('accepted command is persisted with hash chain and private pagination', () => {
  const s = sqliteStorage();
  try {
    const api = receiver(s);
    const first = submit(api, envelope());
    const second = submit(api, envelope(2, 101));
    assert.equal(first.status, 'RECORDED');
    assert.equal(second.status, 'RECORDED');
    assertError(() => api.listAuthorized(null, {}), 'READ_NOT_AUTHORIZED');
    assertError(() => api.listAuthorized(Symbol('other'), {}), 'READ_NOT_AUTHORIZED');
    assert.equal(first.seq, 1);
    assert.equal(second.seq, 2);
    assert.notEqual(first.hash, second.hash);
    const pages = read(api, { after: 0, limit: 1 });
    assert.equal(pages.length, 1);
    const tail = read(api, { after: pages[0].seq, limit: 2, toolId: 'github' });
    assert.equal(tail.length, 1);
    assert.equal(tail[0].prev_hash, pages[0].receipt_hash);
    assert.equal(tail[0].receipt_hash, second.hash);
    assert.equal(tail[0].evidence_url, evidence);
    assert.ok(!('secret' in tail[0]));
    assertError(() => read(api, { limit: 1000 }), 'INVALID_QUERY');
  } finally { s.close(); }
});

test('replay of same signed nonce is blocked, new nonce is idempotent', () => {
  const s = sqliteStorage();
  try {
    const api = receiver(s);
    const first = envelope();
    const stored = submit(api, first);
    assertError(() => submit(api, first), 'REPLAY_BLOCKED');
    const replayWithNewNonce = envelope(1, 102);
    const duplicate = submit(api, replayWithNewNonce);
    assert.equal(duplicate.status, 'DUPLICATE');
    assert.equal(duplicate.seq, stored.seq);
    assert.equal(duplicate.hash, stored.hash);
    assert.equal(read(api, ).length, 1);
  } finally { s.close(); }
});

test('conflicting eventId with changed receipt is rejected and rolled back', () => {
  const s = sqliteStorage();
  try {
    const api = receiver(s);
    submit(api, envelope());
    const conflict = envelope(1, 102, TIME, 'FAIL');
    assertError(() => submit(api, conflict), 'IDEMPOTENCY_CONFLICT');
    const recovered = envelope(1, 102);
    assert.equal(submit(api, recovered).status, 'DUPLICATE');
    assert.equal(read(api, ).length, 1);
  } finally { s.close(); }
});

test('per-source rate limit fails closed within same minute', () => {
  const s = sqliteStorage();
  try {
    const api = receiver(s, { maxPerMinute: 1 });
    submit(api, envelope());
    assertError(() => submit(api, envelope(2, 102)), 'RATE_BLOCKED');
    assert.equal(read(api, ).length, 1);
  } finally { s.close(); }
});

test('storage cap fails closed without appending a partial receipt', () => {
  const s = sqliteStorage();
  try {
    const api = receiver(s, { maxRecords: 1 });
    submit(api, envelope());
    assertError(() => submit(api, envelope(2, 101)), 'AUDIT_CAPACITY_REACHED');
    assert.equal(read(api, ).length, 1);
  } finally { s.close(); }
});

test('SQL failure rolls back nonce, rate and sequence, then safe retry works', () => {
  const s = sqliteStorage();
  try {
    const api = receiver(s, { maxPerMinute: 1 });
    s.failOneInsert();
    const one = envelope();
    assert.throws(() => submit(api, one), /SYNTHETIC_SQL_FAILURE/);
    assert.equal(read(api, ).length, 0);
    const saved = submit(api, one);
    assert.equal(saved.status, 'RECORDED');
    assert.equal(saved.seq, 1);
    assert.equal(read(api, ).length, 1);
  } finally { s.close(); }
});

test('reader access and policy are NOT supplied by untrusted HTTP input', () => {
  const s = sqliteStorage();
  try {
    assertError(() => createSignedAuditReceiver({
      storage: s, secrets: { 'github-actions': SECRET },
      allowedCommands: {}, now: () => TIME,
    }), 'TRUSTED_POLICY_REQUIRED');
    const api = receiver(s);
    const result = submit(api, envelope());
    assert.equal(result.status, 'RECORDED');
    // No Worker fetch() or public URL is exported by this module.
    assert.equal(typeof api.fetch, 'undefined');
  } finally { s.close(); }
});
