'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const core = require('../ad_grants_core.js');
const preview = require('../google_ads_audit.js');
const snapshot = () => ({schema_version:1, source_kind:'synthetic-fixture', as_of:'2026-11-03',
  ads:[{approval:'APPROVED'}], keywords:[{text:'αθλητικός σύλλογος Κατερίνη', quality:8}],
  urls:[{url:'https://www.archelaos.club/tmimata.html', status:200}],
  months:[{month:'2026-09', clicks:60, impressions:1000}, {month:'2026-10', clicks:70, impressions:1000}]});
const granted = {analytics_storage:'granted', ad_storage:'granted', ad_user_data:'granted', ad_personalization:'denied'};

test('no findings means only checked rules pass; policy review is always required', () => {
  const report = core.audit(snapshot());
  assert.deepEqual(report.findings, []);
  assert.equal(report.policy_status, 'current-policy-review-required');
  assert.equal(report.mode, 'dry-run');
});

test('disapprovals, broken URLs, low quality and single words produce public counts', () => {
  const input = snapshot();
  input.ads[0].approval = 'DISAPPROVED';
  input.urls[0].status = 404;
  input.keywords = [{text:'άθληση', quality:2}, {text:'Αρχέλαος', quality:8}, {text:'archelaos', quality:8}];
  assert.deepEqual(core.audit(input).findings, [
    {code:'AD_DISAPPROVED', count:1}, {code:'URL_BROKEN', count:1},
    {code:'KEYWORD_LOW_QUALITY', count:1}, {code:'KEYWORD_SINGLE_WORD', count:1}]);
});

test('off-site, credentials, queries and redirects remain unchecked; no inferred HTTP result', () => {
  const input = snapshot();
  for (const url of ['http://www.archelaos.club/history.html', 'https://archelaos.club.evil.invalid/history.html',
    'https://user@archelaos.club/history.html', 'https://archelaos.club/history.html?email=private',
    'https://archelaos.club/%2e%2e/private', 'https://archelaos.club:443/history.html']) assert.equal(core.allowedUrl(url), false);
  input.urls = [{url:'https://archelaos.club/history.html', status:301},
    {url:'https://evil.invalid/', status:200}, {url:'https://archelaos.club/contact.html', status:null}];
  assert.deepEqual(core.audit(input).findings, [{code:'URL_UNCHECKED', count:3}]);
});

test('CTR uses two complete account-local months, including year and leap boundaries', () => {
  assert.deepEqual(core.fullMonths('2027-01-01'), {start:'2026-11-01', end:'2026-12-31', months:['2026-11','2026-12']});
  assert.equal(core.fullMonths('2024-03-15').end, '2024-02-29');
  assert.throws(() => core.fullMonths('2026-02-30'));
  const input = snapshot();
  input.months = [{month:'2026-09', clicks:1, impressions:100}, {month:'2026-11', clicks:1, impressions:100}];
  assert.deepEqual(core.audit(input).findings, [{code:'CTR_BELOW_TARGET', count:1}, {code:'CTR_DATA_UNAVAILABLE', count:1}]);
});

test('unknown quality and zero/malformed impressions cannot pass as healthy metrics', () => {
  const input = snapshot();
  input.keywords[0].quality = null;
  input.months[0].impressions = 0;
  input.months[1].clicks = 2000;
  assert.deepEqual(core.audit(input).findings, [{code:'KEYWORD_QUALITY_UNAVAILABLE', count:1}, {code:'CTR_DATA_UNAVAILABLE', count:2}]);
  assert.throws(() => core.audit({...input, source_kind:'untrusted'}));
  assert.throws(() => core.audit({schema_version:1}));
});

test('conversion requires accepted server receipt, consent and dedup; emits no PII', () => {
  const receipt = {status:'accepted', form_kind:'academy_interest', id:'synthetic-receipt-1', email:'fixture@example.invalid', name:'Synthetic fixture'};
  const seen = new Set();
  assert.equal(core.conversion({...receipt, status:'submitted'}, granted, seen), null);
  assert.equal(core.conversion(receipt, {analytics_storage:'denied'}, seen), null);
  assert.deepEqual(core.conversion(receipt, granted, seen), {name:'generate_lead', params:{form_kind:'academy_interest'}, ads_eligible:true});
  assert.equal(core.conversion(receipt, granted, seen), null);
  assert.equal(core.conversion({...receipt, id:'synthetic-receipt-2'}, {...granted, ad_user_data:'denied'}, seen).ads_eligible, false);
});

test('traffic export adapter distinguishes existing metrics from missing conversions and stale evidence', () => {
  const source = {range:{endDate:'2026-10-31'}, daily:[{date:'2026-10-31'}]};
  const input = {generated_utc:'2026-11-03T07:40:00Z', ga4:source, search_console:source};
  assert.deepEqual(core.analyticsEvidence(input, '2026-11-03T08:00:00Z'), {schema_version:1,
    ga4_days:1, search_console_days:1, conversions:'unavailable',
    note:'Existing aggregate has traffic totals, not verified lead events or Ads attribution'});
  assert.throws(() => core.analyticsEvidence(input, '2026-11-06T08:00:00Z'));
  assert.throws(() => core.analyticsEvidence({...input, ga4:{daily:[]}}, '2026-11-03T08:00:00Z'));
  assert.throws(() => core.analyticsEvidence({...input, generated_utc:'2026-11-04T00:00:00Z'}, '2026-11-03T08:00:00Z'));
});

test('actual preview collector uses only read APIs and approved GET URLs; never logs raw records', () => {
  const logs = [], fetched = [], queries = [];
  const ads = new Proxy({currentAccount:() => ({getTimeZone:() => 'Europe/Athens'}), search:query => {
    queries.push(query);
    const rows = query.includes('FROM ad_group_ad') ? [{adGroupAd:{policySummary:{approvalStatus:'DISAPPROVED'},
      ad:{finalUrls:['https://www.archelaos.club/history.html', 'https://evil.invalid/?secret=never-log']}}}]
      : query.includes('FROM keyword_view') ? [{adGroupCriterion:{keyword:{text:'never-log-keyword'}, qualityInfo:{qualityScore:2}}}]
      : [{segments:{month:'2026-09-01'}, metrics:{clicks:'60', impressions:'1000'}},
        {segments:{month:'2026-10-01'}, metrics:{clicks:'60', impressions:'1000'}}];
    let i = 0;
    return {hasNext:() => i < rows.length, next:() => rows[i++]};
  }}, {get:(object, key) => { if (!(key in object)) throw Error('Unexpected Ads operation: ' + String(key)); return object[key]; }});
  preview(core, ads, {formatDate:() => '2026-11-03'}, {fetch:(url, options) => {
    assert.equal(options.method, 'get'); assert.equal(options.followRedirects, false);
    assert.equal(options.validateHttpsCertificates, true); fetched.push(url);
    return {getResponseCode:() => 404};
  }}, {log:line => logs.push(line)});
  assert.equal(queries.length, 3);
  assert.ok(queries[2].includes("'2026-09-01' AND '2026-10-31'"));
  assert.deepEqual(fetched, ['https://www.archelaos.club/history.html']);
  assert.equal(logs.length, 1);
  assert.ok(!/never-log|https:/.test(logs[0]));
  assert.ok(JSON.parse(logs[0]).findings.some(item => item.code === 'URL_UNCHECKED'));
});

test('draft campaigns have two groups, multiple creatives/sitelinks and bounded RSA copy, with no budgets', () => {
  const plan = JSON.parse(readFileSync(path.join(__dirname, '..', 'campaigns.draft.json'), 'utf8'));
  assert.equal(plan.mode, 'dry-run'); assert.equal(plan.importable, false);
  assert.equal(plan.budgets, null); assert.equal(plan.campaigns.length, 2);
  for (const campaign of plan.campaigns) {
    assert.equal(campaign.status, 'DRAFT_NOT_IMPORTED');
    assert.ok(campaign.sitelinks.length >= 2);
    for (const link of campaign.sitelinks) assert.ok(core.allowedUrl(link.url));
    assert.ok(campaign.ad_groups.length >= 2);
    for (const group of campaign.ad_groups) {
      assert.ok(core.allowedUrl(group.landing)); assert.ok(group.rsa_drafts.length >= 2);
      for (const keyword of group.phrase_keywords) assert.ok(keyword.split(/\s+/).length >= 2);
      for (const ad of group.rsa_drafts) {
        assert.ok(ad.headlines.length >= 3 && ad.headlines.every(text => [...text].length <= 30));
        assert.ok(ad.descriptions.length >= 2 && ad.descriptions.every(text => [...text].length <= 90));
      }
    }
  }
});

test('committed synthetic example matches the executed audit used by the Issue planner', () => {
  const fixture = name => JSON.parse(readFileSync(path.join(__dirname, '..', 'fixtures', name), 'utf8'));
  assert.deepEqual(core.audit(fixture('snapshot.synthetic.json')), fixture('audit-report.json'));
});
