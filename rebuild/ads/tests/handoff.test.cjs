'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {prepare, finalize} = require('../prepare_handoff.cjs');
const load = name => JSON.parse(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'));
function inputs() {
  return {report:load('fixtures/audit-report.json'), analytics:load('fixtures/google-analytics-aggregate.synthetic.json'),
    campaigns:load('campaigns.draft.json'), options:{fixture:true, now:'2026-11-03T08:00:00Z'}};
}
function run(input) { return prepare(input.report, input.analytics, input.campaigns, input.options); }
function planFor(summary) {
  return {mode:'dry-run', can_publish:false, source_kind:summary.source_kind,
    actions:summary.findings.map(item => ({code:item.code, action:'would_create'}))};
}

test('combined evidence retains provenance, missing conversions and explicit activation blockers', () => {
  const {summary} = run(inputs());
  assert.equal(summary.status, 'INPUTS_VALIDATED');
  assert.equal(summary.ready_for_live_ads, false);
  assert.equal(summary.source_kind, 'synthetic-fixture');
  assert.equal(summary.analytics.conversions, 'unavailable');
  assert.equal(summary.campaign_count, 2);
  assert.ok(summary.blockers.includes('CONSENT_UNVERIFIED'));
});
test('real-input mode cannot consume a synthetic report or fixture clock', () => {
  const input = inputs(); input.options.fixture = false;
  assert.throws(() => run(input));
  input.report.source_kind = 'google-ads-readonly';
  assert.throws(() => run(input));
  delete input.analytics.fixture_clock;
  assert.equal(run(input).summary.ready_for_live_ads, false);
});
test('stale or nonexistent Ads dates and stale/future analytics cannot produce a handoff', () => {
  for (const date of ['2026-10-01', '2026-11-08', '2026-02-30']) {
    const input = inputs(); input.report.as_of = date;
    assert.throws(() => run(input));
  }
  for (const date of ['2026-10-01T00:00:00Z', '2026-11-05T00:00:00Z']) {
    const input = inputs(); input.analytics.generated_utc = date;
    assert.throws(() => run(input));
  }
});
test('handoff strips raw values and rejects unknown or duplicate findings', () => {
  const input = inputs(); input.report.raw = 'must-not-escape'; input.analytics.raw = 'must-not-escape';
  assert.ok(!JSON.stringify(run(input)).includes('must-not-escape'));
  input.report.findings.push({...input.report.findings[0]});
  assert.throws(() => run(input));
});
test('empty traffic stays empty and cannot establish real conversions', () => {
  const input = inputs(); input.analytics.ga4.daily = [];
  const {summary} = run(input);
  assert.ok(summary.blockers.includes('TRAFFIC_DATA_EMPTY'));
  assert.equal(summary.analytics.conversions, 'unavailable');
});
test('importable campaigns or budgets cannot enter the dry-run handoff', () => {
  const input = inputs(); input.campaigns.importable = true;
  assert.throws(() => run(input));
  input.campaigns.importable = false; input.campaigns.budgets = 1;
  assert.throws(() => run(input));
});
test('completion requires a matching, non-publishable Issue plan with all finding codes', () => {
  const {summary} = run(inputs()), plan = planFor(summary);
  const done = finalize(summary, plan);
  assert.equal(done.status, 'DRY_RUN_COMPLETE');
  assert.equal(done.ready_for_live_ads, false);
  assert.equal(done.issue_actions.would_create, 6);
  assert.throws(() => finalize(summary, {...plan, can_publish:true}));
  assert.throws(() => finalize(summary, {...plan, actions:plan.actions.slice(1)}));
  assert.throws(() => finalize({...summary, status:'INCOMPLETE'}, plan));
  assert.throws(() => finalize(summary, {...plan, source_kind:'google-ads-readonly'}));
  assert.throws(() => finalize(summary, {...plan, actions:plan.actions.map(() => plan.actions[0])}));
});
