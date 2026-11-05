/* One offline handoff from sanitized Ads evidence and the existing GA4/GSC export. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const core = require('./ad_grants_core.js');
const base = path.join(__dirname, '..', 'test-artifacts', 'ad-grants');
const output = path.join(base, 'handoff');
const blockers = ['CURRENT_POLICY_UNVERIFIED', 'ACCOUNT_SETUP_UNVERIFIED',
  'PRODUCTION_LANDINGS_UNVERIFIED', 'CONSENT_UNVERIFIED', 'REAL_CONVERSIONS_UNVERIFIED',
  'GOOGLE_ADS_PREVIEW_UNVERIFIED', 'UPSTREAM_RELEASE_APPROVAL_REQUIRED'];

function prepare(report, analytics, campaigns, {fixture, now}) {
  const source = fixture ? 'synthetic-fixture' : 'google-ads-readonly';
  if (report?.schema_version !== 1 || report.mode !== 'dry-run' || report.source_kind !== source ||
      report.policy_status !== 'current-policy-review-required' || !Array.isArray(report.findings)) {
    throw Error('Invalid evidence provenance');
  }
  core.fullMonths(report.as_of); // Also rejects nonexistent calendar dates.
  const age = (Date.parse(now) - Date.parse(report.as_of + 'T00:00:00Z')) / 86400000;
  // Account-local date may be ahead of UTC; it must not be stale or far future.
  if (!Number.isFinite(age) || age < -1 || age > 2) throw Error('Stale Ads evidence');
  if (!fixture && Object.hasOwn(analytics, 'fixture_clock')) throw Error('Fixture clock in real input');
  const used = new Set();
  const findings = report.findings.map(item => {
    if (Object.keys(item).sort((a, b) => a.localeCompare(b)).join(',') !== 'code,count' || !core.codes.includes(item.code) ||
        !Number.isInteger(item.count) || item.count < 1 || item.count > 10000 || used.has(item.code)) {
      throw Error('Invalid finding');
    }
    used.add(item.code);
    return {code:item.code, count:item.count};
  });
  const traffic = core.analyticsEvidence(analytics, now);
  if (traffic.ga4_days > 62 || traffic.search_console_days > 62) throw Error('Unexpected daily coverage');
  if (campaigns.mode !== 'dry-run' || campaigns.importable !== false || campaigns.budgets !== null ||
      !Array.isArray(campaigns.campaigns) || campaigns.campaigns.length !== 2 ||
      campaigns.campaigns.some(item => item.status !== 'DRAFT_NOT_IMPORTED')) throw Error('Invalid draft campaigns');
  const audit = {schema_version:1, mode:'dry-run', source_kind:source, as_of:report.as_of,
    policy_status:'current-policy-review-required', findings};
  return {audit, summary:{schema_version:1, mode:'dry-run', status:'INPUTS_VALIDATED',
    source_kind:source, assessed_at:now, ready_for_live_ads:false, campaign_count:2,
    analytics:traffic, findings, blockers:[...blockers,
      ...(!traffic.ga4_days || !traffic.search_console_days ? ['TRAFFIC_DATA_EMPTY'] : [])]}};
}

function finalize(summary, plan) {
  if (summary.status !== 'INPUTS_VALIDATED' || summary.ready_for_live_ads !== false ||
      plan.mode !== 'dry-run' || plan.can_publish !== false || plan.source_kind !== summary.source_kind ||
      !Array.isArray(plan.actions) || plan.actions.length !== summary.findings.length) throw Error('Incomplete Issue plan');
  const counts = {would_create:0, would_reopen:0, already_open:0}, seen = new Set();
  for (const action of plan.actions) {
    if (!Object.hasOwn(counts, action.action) || !summary.findings.some(item => item.code === action.code) ||
        seen.has(action.code)) throw Error('Invalid Issue action');
    seen.add(action.code); counts[action.action]++;
  }
  return {...summary, status:'DRY_RUN_COMPLETE', issue_actions:counts};
}

function readEvidence(name) {
  const maximum = 1_000_000;
  const descriptor = fs.openSync(name, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const before = fs.fstatSync(descriptor);
    if (!before.isFile() || before.nlink !== 1 || before.size > maximum) throw Error('Evidence must be a bounded ordinary file');
    const buffer = Buffer.alloc(maximum + 1);
    let size = 0;
    while (size <= maximum) {
      const count = fs.readSync(descriptor, buffer, size, maximum + 1 - size, null);
      if (count === 0) break;
      size += count;
    }
    const after = fs.fstatSync(descriptor);
    if (size > maximum || size !== before.size || after.size !== before.size || after.nlink !== 1 ||
        after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw Error('Evidence changed during bounded read');
    return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(buffer.subarray(0, size)));
  } finally { fs.closeSync(descriptor); }
}
function write(name, value) {
  fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n');
}
function main() {
  const args = process.argv.slice(2);
  if (new Set(args).size !== args.length || args.some(arg => !['--fixture', '--finalize'].includes(arg))) throw Error('Unsupported option');
  const fixture = args.includes('--fixture');
  fs.mkdirSync(output, {recursive:true});
  if (args.includes('--finalize')) {
    const summary = readEvidence(path.join(output, 'status.json'));
    if (summary.source_kind !== (fixture ? 'synthetic-fixture' : 'google-ads-readonly')) throw Error('Source mismatch');
    const done = finalize(summary, readEvidence(path.join(output, 'issue-plan.json')));
    write('status.json', done); console.log(JSON.stringify(done, null, 2));
    return;
  }
  write('status.json', {mode:'dry-run', status:'INCOMPLETE', ready_for_live_ads:false});
  const folder = fixture ? path.join(__dirname, 'fixtures') : base;
  const report = readEvidence(path.join(folder, 'audit-report.json'));
  const analytics = readEvidence(path.join(folder, fixture ? 'google-analytics-aggregate.synthetic.json' : 'google-analytics-aggregate.json'));
  const now = fixture ? analytics.fixture_clock : new Date().toISOString();
  const result = prepare(report, analytics, readEvidence(path.join(__dirname, 'campaigns.draft.json')), {fixture, now});
  write('audit-report.json', result.audit); write('status.json', result.summary);
}
if (require.main === module) {
  try { main(); } catch {
    fs.mkdirSync(output, {recursive:true});
    write('status.json', {mode:'dry-run', status:'INCOMPLETE', ready_for_live_ads:false,
      error_code:'EVIDENCE_UNAVAILABLE_OR_INVALID'});
    console.error('Ad Grants handoff incomplete: required evidence is missing or invalid; no activation.');
    process.exitCode = 1;
  }
}
module.exports = {prepare, finalize, readEvidence};
