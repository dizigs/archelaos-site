import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { parseFinding, classification, FINDING_CODES } from '../src/policy.mjs';
import { HealerLedger } from '../src/ledger.mjs';
import { REVIEWED_RECIPES } from '../src/recipes.mjs';

const NOW = Date.parse('2026-11-04T20:35:00Z');
const good = (overrides = {}) => ({
  schemaVersion: 1, source: 'site_watch', repository: 'dizigs/archelaos-site',
  code: 'HTML_ESCAPED_TEXT', resource: '/news.html', commit: 'a'.repeat(40),
  observedAt: '2026-11-04T20:35:00Z', evidenceId: 'actions:41900012345', ...overrides
});

function storageFixture() {
  const db = new DatabaseSync(':memory:');
  const storage = {
    sql: {
      exec(query, ...params) {
        const stmt = db.prepare(query);
        if (/^\s*SELECT\b/i.test(query)) return stmt.all(...params);
        stmt.run(...params);
        return [];
      }
    },
    transactionSync(fn) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = fn();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
  };
  return { storage, db, ledger: new HealerLedger(storage) };
}

test('strict approved metadata only: unknown fields, raw logs and credentials rejected', () => {
  assert.deepEqual(parseFinding(good(), NOW), good());
  for (const extra of [{ rawLog: 'Bearer very-sensitive-value' }, { token: 'secret' },
    { command: 'curl malicious' }, { privateEmail: 'someone@example.com' }]) {
    assert.throws(() => parseFinding(good(extra), NOW), /INVALID_FINDING_ENVELOPE/);
  }
  assert.throws(() => parseFinding(good({ repository: 'other-org/other-repo' }), NOW), /INVALID_FINDING_IDENTITY/);
  assert.throws(() => parseFinding(good({ code: 'RUN_COMMAND' }), NOW), /INVALID_FINDING_IDENTITY/);
  assert.throws(() => parseFinding(good({ resource: 'https://evil.example/callback' }), NOW), /UNAPPROVED_RESOURCE/);
  assert.throws(() => parseFinding(good({ resource: '/private/mail' }), NOW), /UNAPPROVED_RESOURCE/);
  assert.throws(() => parseFinding(good({ observedAt: '2026-10-01T00:00:00Z' }), NOW), /STALE_FINDING/);
  assert.throws(() => parseFinding(good({ evidenceId: 'pages:fd91d812-a3e0-4ac7-bb10-2d4821aa1798' }), NOW), /INVALID_EVIDENCE_ID/);
  assert.throws(() => parseFinding(good({ source: 'cloudflare_pages' }), NOW), /INVALID_EVIDENCE_ID/);
});

test('policy cannot authorize auto merges or repair from metadata alone', () => {
  for (const code of Object.keys(FINDING_CODES)) {
    const d = classification(code);
    assert.equal(d.autoRepairAllowed, false);
    assert.equal(d.mergeAllowed, false);
    assert.equal(d.deployAllowed, false);
    assert.equal(d.provenance, 'INPUT_METADATA_UNVERIFIED');
  }
  assert.equal(classification('HTML_ESCAPED_TEXT').recipe, 'ARCH-HTML-ESCAPES-001');
  assert.equal(classification('HTML_ESCAPED_TEXT').policy, 'DRAFT_REVIEW_ONLY');
  assert.equal(classification('LIVE_HEALTH_FAILURE').policy, 'DIAGNOSE_ONLY');
  assert.throws(() => classification('UNKNOWN'), /UNKNOWN_FINDING_CODE/);
});

test('persistent SQLite ledger stores one observation for repeated delivery', async () => {
  const { ledger, db } = storageFixture();
  const first = await ledger.record(good(), NOW);
  assert.equal(first.status, 'RECORDED');
  assert.equal(first.observationCount, 1);
  const second = await ledger.record(good(), NOW + 2000);
  assert.equal(second.status, 'DUPLICATE');
  assert.equal(second.incidentId, first.incidentId);
  assert.equal(second.observationCount, 1);
  const third = await ledger.record(good({ evidenceId: 'actions:41900012346' }), NOW + 10000);
  assert.equal(third.observationCount, 2);
  assert.equal(third.incidentId, first.incidentId);
  const found = ledger.find('HTML_ESCAPED_TEXT', '/news.html');
  assert.equal(found.status, 'FOUND');
  assert.equal(found.observationCount, 2);
  assert.equal(ledger.status().incidentCount, 1);
  assert.equal(ledger.status().reviewedRecipeCount, 3);
  assert.equal(found.reviewedRecipe.id, 'ARCH-HTML-ESCAPES-001');
  assert.equal(found.reviewedRecipe.executable, false);
  assert.equal(found.reviewedRecipe.productionVerified, false);
  assert.equal(ledger.status().observationCount, 2);
  assert.equal(db.prepare('SELECT count(*) AS n FROM observations').get().n, 2);
  db.close();
});

test('all reviewed catalog entries are inert and match known diagnosis codes', () => {
  const { ledger, db } = storageFixture();
  assert.equal(REVIEWED_RECIPES.length, 3);
  for (const recipe of REVIEWED_RECIPES) {
    assert.equal(classification(recipe.incidentCode).recipe, recipe.id);
    const persisted = ledger.reviewedRecipe(recipe.id);
    assert.equal(persisted.executable, false);
    assert.equal(persisted.productionVerified, false);
    assert.equal(persisted.revision, '2026-11-03');
  }
  assert.throws(() => ledger.reviewedRecipe('UNTRUSTED-RECIPE'), /UNREVIEWED_RECIPE/);
  db.close();
});

test('new deployment evidence is recorded as metadata, never considered repair proof', async () => {
  const { ledger, db } = storageFixture();
  const report = await ledger.record(good({
    source: 'cloudflare_pages', code: 'DEPLOYMENT_UNVERIFIED', resource: '/deployment',
    evidenceId: 'pages:fd91d812-a3e0-4ac7-bb10-2d4821aa1798'
  }), NOW);
  assert.equal(report.status, 'RECORDED');
  assert.equal(report.diagnosis.autoRepairAllowed, false);
  assert.equal(report.diagnosis.provenance, 'INPUT_METADATA_UNVERIFIED');
  assert.equal(ledger.find('CI_FAILURE', '/ci').status, 'NOT_FOUND');
  assert.throws(() => ledger.find('CI_FAILURE', '/secrets'), /INVALID_INCIDENT_QUERY/);
  db.close();
});

test('new Evidence ID, same incident: observation count increments but no new incident', async () => {
  const { ledger, db } = storageFixture();
  await ledger.record(good({ code: 'LIVE_HEALTH_FAILURE' }), NOW);
  await ledger.record(good({ code: 'LIVE_HEALTH_FAILURE', evidenceId: 'actions:41900012347', commit: 'b'.repeat(40) }), NOW + 500);
  const s = ledger.status();
  assert.deepEqual([s.incidentCount, s.observationCount], [1, 2]);
  db.close();
});
