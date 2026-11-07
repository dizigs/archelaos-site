import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspectRepository, inspectSources } from './worker-gates.mjs';

const brain = readFileSync(new URL('../../brain/wrangler.toml', import.meta.url), 'utf8');
const healer = readFileSync(new URL('../../automation/self-heal-worker/wrangler.toml', import.meta.url), 'utf8');
const pkg = readFileSync(new URL('../../brain/package.json', import.meta.url), 'utf8');

test('actual source uses pinned Wrangler 4.157.0 and staging safety flags OFF', () => {
  const report = inspectRepository();
  assert.equal(report.wranglerDeclaredVersion, '4.157.0');
  assert.equal(report.sourceConfigGate, 'PASS_SAFETY_OFF');
  assert.equal(report.brain.name, 'archelaos-brain-staging');
  assert.equal(report.healer.name, 'archelaos-self-heal');
  assert.ok(report.brain.hasSQLiteClass && report.healer.hasSQLiteClass);
  assert.ok(report.brain.hasServiceBinding && report.healer.hasServiceBinding);
  assert.equal(report.brain.observabilityLogs, 'true');
  assert.equal(report.healer.observabilityLogs, 'true');
});

test('source configuration never proves CI, deployment, RPC or authentication', () => {
  const report = inspectRepository();
  assert.equal(report.maturity.CODE_READY, 'SOURCE_INSPECTED');
  assert.ok(Object.entries(report.maturity)
    .filter(([key]) => key !== 'CODE_READY')
    .every(([,state]) => state.startsWith('UNKNOWN_')));
  assert.equal(report.scope, 'SOURCE_ONLY_NO_PROVIDER_CALL');
  assert.ok(!('authenticated' in report));
});

test('unsafe recovery enabling fails closed at static gate without any provider call', () => {
  const changed = brain.replace('BRAIN_SELFHEAL_DISPATCH_ENABLED = "false"',
                                'BRAIN_SELFHEAL_DISPATCH_ENABLED = "true"');
  assert.equal(inspectSources(changed, healer, pkg).sourceConfigGate, 'REVIEW_REQUIRED');
  const changedHealer = healer.replace('HEALER_DURABLE_ACK_ENABLED = "false"',
                                       'HEALER_DURABLE_ACK_ENABLED = "true"');
  assert.equal(inspectSources(brain, changedHealer, pkg).sourceConfigGate, 'REVIEW_REQUIRED');
});

test('staging expiry change and unintended hostname exposure block static acceptance', () => {
  const changed = brain.replace('STAGING_EXPIRES_AT = "1970-01-01T00:00:00Z"',
                                'STAGING_EXPIRES_AT = "2099-01-01T00:00:00Z"');
  assert.equal(inspectSources(changed, healer, pkg).sourceConfigGate, 'REVIEW_REQUIRED');
  const exposed = healer.replace('workers_dev = false', 'workers_dev = true');
  assert.equal(inspectSources(brain, exposed, pkg).sourceConfigGate, 'REVIEW_REQUIRED');
});

test('undefined or malformed configuration fails closed', () => {
  assert.throws(() => inspectSources(null, healer, pkg), /INVALID_SOURCE/);
  assert.throws(() => inspectSources(brain, healer, '{"devDependencies":{}}'), /INVALID_SOURCE/);
  assert.equal(inspectSources('', healer, pkg).sourceConfigGate, 'REVIEW_REQUIRED');
});

test('source report is metadata-only, no secrets, no raw provider logs', () => {
  const marker = 'SYNTHETIC_SECRET_FOR_TESTS_NEVER_EXPORT';
  const report = inspectSources(brain + '\n# ' + marker, healer, pkg);
  assert.doesNotMatch(JSON.stringify(report), /SYNTHETIC_SECRET_FOR_TESTS_NEVER_EXPORT/);
});
