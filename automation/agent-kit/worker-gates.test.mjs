import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFileSync,mkdirSync,mkdtempSync,readFileSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
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

test('commented, misplaced or redirected binding/migration declarations cannot pass',()=>{
  for(const changed of [
    brain.replace('binding = "HEALER"','# binding = "HEALER"'),
    brain.replace('new_sqlite_classes = ["BrainCoordinator"]','# new_sqlite_classes = ["BrainCoordinator"]'),
    brain.replace('service = "archelaos-self-heal"','service = "unapproved-worker"'),
    brain.replace('[[services]]','[[unrelated]]'),
    brain.replace('class_name = "BrainCoordinator"','class_name = "WrongClass"'),
    brain.replace('name = "archelaos-brain-staging"','name = "wrong-worker"'),
    brain.replace('BRAIN_SELFHEAL_BINDING_ATTESTED = "false"','BRAIN_SELFHEAL_BINDING_ATTESTED = "true"'),
  ])assert.equal(inspectSources(changed,healer,pkg).sourceConfigGate,'REVIEW_REQUIRED');
  assert.equal(inspectSources(brain,healer.replace('entrypoint = "BrainRecoveryPort"','entrypoint = "default"'),pkg).sourceConfigGate,'REVIEW_REQUIRED');
});
test('equivalent single quoted flags, comments and nested array values preserve safe TOML meaning',()=>{
  const changed=brain.replace('[vars]', '[vars]\nEXAMPLE = [\n [1,2],\n [3,4],\n]\n').replaceAll('= "false"',"= 'false' # still disabled");
  assert.equal(inspectSources(changed,healer,pkg).sourceConfigGate,'PASS_SAFETY_OFF');
});
test('duplicate or malformed TOML cannot masquerade as a safe source gate',()=>{
  assert.throws(()=>inspectSources(brain+'\n[vars]\nBRAIN_SELFHEAL_DISPATCH_ENABLED="true"\n',healer,pkg),/TOML_PARSE_FAILED/);
  assert.throws(()=>inspectSources(brain+'\nBROKEN=[',healer,pkg),/TOML_PARSE_FAILED/);
});
test('symlinked Worker gate CLI runs and fails unsafe configuration instead of silently succeeding',()=>{
  const root=mkdtempSync(join(tmpdir(),'agentkit cli with spaces '));try {
    const kit=join(root,'automation','agent-kit');mkdirSync(kit,{recursive:true});
    mkdirSync(join(root,'brain'));mkdirSync(join(root,'automation','self-heal-worker'));
    for(const name of ['worker-gates.mjs','private-io.mjs'])copyFileSync(new URL(name,import.meta.url),join(kit,name));
    writeFileSync(join(root,'brain','wrangler.toml'),brain);
    writeFileSync(join(root,'brain','package.json'),pkg);
    writeFileSync(join(root,'automation','self-heal-worker','wrangler.toml'),healer);
    const wrapper=join(root,'worker wrapper.mjs');symlinkSync(join(kit,'worker-gates.mjs'),wrapper);
    let r=spawnSync(process.execPath,[wrapper],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
    assert.equal(JSON.parse(r.stdout).sourceConfigGate,'PASS_SAFETY_OFF');
    writeFileSync(join(root,'brain','wrangler.toml'),brain.replace('BRAIN_SELFHEAL_DISPATCH_ENABLED = "false"','BRAIN_SELFHEAL_DISPATCH_ENABLED = "true"'));
    r=spawnSync(process.execPath,[wrapper],{encoding:'utf8'});assert.equal(r.status,2,r.stderr);
    assert.equal(JSON.parse(r.stdout).sourceConfigGate,'REVIEW_REQUIRED');
  }finally{rmSync(root,{recursive:true,force:true})}
});
