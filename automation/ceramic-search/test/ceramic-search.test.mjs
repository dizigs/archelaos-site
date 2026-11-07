import test from 'node:test';
import assert from 'node:assert/strict';
import { ceramicSearch } from '../ceramic-search.mjs';

const approval = () => ({ authorized: true, reservationId: 'synthetic-reservation-1' });
const fixture = { items: [
  { url: 'https://example.com/report', title: 'Verified source?', description: 'Needs independent verification' },
  { url: 'javascript:alert(1)', title: 'Disallowed' },
] };

function ports() {
  const calls = [];
  const audits = [];
  return {
    calls, audits,
    ai: { async websearch(args) { calls.push(args); return new Response(JSON.stringify(fixture), { status: 200 }); } },
    authorize: approval,
    audit: async event => audits.push(event),
    enabled: true,
  };
}

test('off by default: no provider call or budget authorization', async () => {
  let called = false;
  const result = await ceramicSearch({ ai: { websearch: () => { called = true; } }, query: 'Archelaos' });
  assert.equal(result.status, 'CERAMIC_DISABLED');
  assert.equal(called, false);
});

test('one approved public search goes through default AI Gateway using ceramic', async () => {
  const p = ports();
  const result = await ceramicSearch({ ...p, query: 'ΓΑΣ Αρχέλαος Κατερίνης', limit: 5 });
  assert.deepEqual(p.calls, [{ gatewayId: 'default', query: 'ΓΑΣ Αρχέλαος Κατερίνης', provider: 'ceramic', limit: 5 }]);
  assert.deepEqual(result, { status: 'REVIEW_REQUIRED', providerCalls: 1, items: [{ url: 'https://example.com/report', title: 'Verified source?', description: 'Needs independent verification' }] });
  assert.equal(p.audits[0].state, 'SUCCESS_REQUIRES_BILLING_RECONCILIATION');
  assert.equal(JSON.stringify(p.audits).includes('ΓΑΣ'), false);
});

test('BYOK alias never silently falls back to paid Gateway', async () => {
  const p = ports();
  await ceramicSearch({ ...p, query: 'handball', byokAlias: 'ceramic_free' });
  assert.equal(p.calls[0].byokAlias, 'ceramic_free');
});

test('unapproved budget and missing ports refuse calls', async () => {
  const p = ports();
  await assert.rejects(ceramicSearch({ ...p, query: 'test', authorize: () => ({ authorized: false }) }), /CERAMIC_BUDGET_NOT_AUTHORIZED/);
  assert.equal(p.calls.length, 0);
  await assert.rejects(ceramicSearch({ ...p, query: 'test', authorize: undefined }), /CERAMIC_BRAIN_PORTS_MISSING/);
  assert.equal(p.calls.length, 0);
});

test('invalid query and alias rejected before authorizing', async () => {
  const p = ports();
  await assert.rejects(ceramicSearch({ ...p, query: ' ' }), /INVALID_PUBLIC_SEARCH_QUERY/);
  await assert.rejects(ceramicSearch({ ...p, query: 'a', byokAlias: 'no spaces allowed' }), /INVALID_BYOK_ALIAS/);
  await assert.rejects(ceramicSearch({ ...p, query: 'a', limit: 50 }), /INVALID_SEARCH_LIMIT/);
  assert.equal(p.calls.length, 0);
});

test('a failed upstream call is not retried, reservation remains unreconciled', async () => {
  const p = ports();
  p.ai.websearch = async () => { p.calls.push('called'); throw Error('timeout'); };
  await assert.rejects(ceramicSearch({ ...p, query: 'Archelaos' }), /CERAMIC_OUTCOME_REQUIRES_RECONCILIATION/);
  assert.equal(p.calls.length, 1);
  assert.equal(p.audits[0].state, 'OUTCOME_UNKNOWN_RECONCILE');
});

test('untrusted invalid response never becomes verified evidence', async () => {
  const p = ports();
  p.ai.websearch = async () => new Response('{}');
  await assert.rejects(ceramicSearch({ ...p, query: 'test' }), /CERAMIC_OUTCOME_REQUIRES_RECONCILIATION/);
  assert.equal(p.audits[0].state, 'OUTCOME_UNKNOWN_RECONCILE');
});
