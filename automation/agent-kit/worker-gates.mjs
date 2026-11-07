#!/usr/bin/env node
// Offline check of existing Brain/Self-Heal source. Never invokes providers.
import {spawnSync} from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {isMainModule,readBoundedFile} from './private-io.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PATHS = Object.freeze({
  brain: 'brain/wrangler.toml',
  healer: 'automation/self-heal-worker/wrangler.toml',
  package: 'brain/package.json',
});
function read(rel) {return readBoundedFile(join(ROOT,rel),131072);}
function parseToml(text) {
  if(Buffer.byteLength(text,'utf8')>131072)throw Error('SOURCE_TOO_LARGE');
  // Standard-library parser, isolated from repository modules and PYTHONPATH.
  const result=spawnSync('/usr/bin/python3',['-I','-S','-c',
    'import sys,json,tomllib; json.dump(tomllib.loads(sys.stdin.read()),sys.stdout)'],
    {input:text,encoding:'utf8',timeout:5000,maxBuffer:524288});
  if(result.error||result.status!==0)throw Error('TOML_PARSE_FAILED');
  return JSON.parse(result.stdout);
}
function workerInfo(config,role) {
  const brain=role==='brain',name=brain?'archelaos-brain-staging':'archelaos-self-heal';
  const className=brain?'BrainCoordinator':'HealerMemory',binding=brain?'BRAIN':'HEALER_MEMORY';
  const services=config.services,migrations=config.migrations,objects=config.durable_objects?.bindings;
  const service=Array.isArray(services)&&services.length===(brain?2:1)?services[0]:null;
  const qaPeer=brain&&Array.isArray(services)&&services.length===2?services[1]:null;
  const correctService=service&&service.binding===(brain?'HEALER':'BRAIN_RECOVERY')&&
    service.service===(brain?'archelaos-self-heal':'archelaos-brain-staging')&&
    !Object.hasOwn(service,'environment')&&
    (brain?(service.entrypoint===undefined||service.entrypoint==='default'):service.entrypoint==='BrainRecoveryPort')&&
    (!brain||(qaPeer.binding==='HMAC_PEER'&&qaPeer.service==='archelaos-self-heal'&&
      qaPeer.entrypoint==='HealerHmacAcceptancePort'&&
      Object.keys(qaPeer).length===3))&&
    Object.keys(service).length===(brain?(service.entrypoint===undefined?2:3):3);
  const correctClass=Array.isArray(objects)&&objects.length===2&&objects[0].name===binding&&
    objects[0].class_name===className&&!Object.hasOwn(objects[0],'script_name')&&
    Object.keys(objects[0]).length===2&&
    objects[1].name==='HMAC_NONCES'&&objects[1].class_name==='PrivateHmacNonceStore'&&
    Object.keys(objects[1]).length===2&&Array.isArray(migrations)&&migrations.length===2&&
    migrations[0].tag===(brain?'brain-staging-v1':'healer-sqlite-v1')&&
    JSON.stringify(migrations[0].new_sqlite_classes)==='["'+className+'"]'&&
    Object.keys(migrations[0]).length===2&&
    migrations[1].tag===(brain?'brain':'healer')+'-private-hmac-qa-v1'&&
    JSON.stringify(migrations[1].new_sqlite_classes)==='["PrivateHmacNonceStore"]'&&
    Object.keys(migrations[1]).length===2;
  return {name:config.name??null,workersDev:config.workers_dev===false?'false':null,
    previewUrls:config.preview_urls===false?'false':null,hasSQLiteClass:!!correctClass,
    hasServiceBinding:!!correctService,observabilityLogs:config.observability?.logs?.enabled===true?'true':null,
    nameMatches:config.name===name};
}
export function inspectSources(brain, healer, pkg) {
  if(typeof brain!=='string'||typeof healer!=='string')throw Error('INVALID_SOURCE');
  let meta;
  try {meta=typeof pkg==='string'?JSON.parse(pkg):pkg;}catch{throw Error('INVALID_SOURCE');}
  if(typeof meta?.devDependencies?.wrangler!=='string')throw Error('INVALID_SOURCE');
  const b=parseToml(brain),h=parseToml(healer),violations=[];
  const flags=['BRAIN_SELFHEAL_RECOVERY_ENABLED','BRAIN_SELFHEAL_BINDING_ATTESTED',
    'BRAIN_SELFHEAL_DISPATCH_ENABLED','BRAIN_SELFHEAL_DURABLE_ACK_ENABLED'];
  for(const key of flags)if(b.vars?.[key]!=='false')violations.push(key+'_NOT_OFF');
  if(h.vars?.HEALER_DURABLE_ACK_ENABLED!=='false')violations.push('HEALER_DURABLE_ACK_ENABLED_NOT_OFF');
  if(b.vars?.STAGING_EXPIRES_AT!=='1970-01-01T00:00:00Z')violations.push('STAGING_NOT_EXPIRED');
  for(const [role,config] of [['brain',b],['healer',h]]) {
    const vars=config.vars||{};
    const expected={
      PRIVATE_HMAC_ACCEPTANCE_ISOLATED:'false',
      PRIVATE_HMAC_ACCEPTANCE_ROLE:role,
      PRIVATE_HMAC_ACCEPTANCE_SESSION:'',
      PRIVATE_HMAC_ACCEPTANCE_APPROVED_SHA:'0'.repeat(40),
      PRIVATE_HMAC_ACCEPTANCE_STARTED_AT:'1970-01-01T00:00:00Z',
      PRIVATE_HMAC_ACCEPTANCE_EXPIRES_AT:'1970-01-01T00:00:00Z',
      DEPLOY_SHA:'0'.repeat(40),
    };
    if(Object.entries(expected).some(([key,value])=>vars[key]!==value))
      violations.push(role+'.QA_ACCEPTANCE_PERMIT_NOT_OFF');
  }
  const brainInfo=workerInfo(b,'brain'),healerInfo=workerInfo(h,'healer');
  for(const [role,info] of [['brain',brainInfo],['healer',healerInfo]]) {
    if(!info.nameMatches)violations.push(role+'.WORKER_NAME_UNVERIFIED');
    if(info.workersDev!=='false'||info.previewUrls!=='false')violations.push(role+'.PUBLIC_EXPOSURE_UNVERIFIED');
    if(!info.hasSQLiteClass)violations.push(role+'.SQLITE_DECLARATION_UNVERIFIED');
    if(!info.hasServiceBinding)violations.push(role+'.SERVICE_BINDING_UNVERIFIED');
    if(info.observabilityLogs!=='true')violations.push(role+'.LOGS_NOT_ENABLED');
  }
  if(!/^\d+\.\d+\.\d+$/.test(meta.devDependencies.wrangler))violations.push('WRANGLER_NOT_EXACTLY_PINNED');
  const safeConfig=violations.length===0;
  return {
    scope: 'SOURCE_ONLY_NO_PROVIDER_CALL',
    sourcePaths: PATHS,
    wranglerDeclaredVersion: meta.devDependencies.wrangler,
    brain: brainInfo,
    healer: healerInfo,
    sourceConfigGate: safeConfig ? 'PASS_SAFETY_OFF' : 'REVIEW_REQUIRED',
    violations,
    maturity: {
      CODE_READY: 'SOURCE_INSPECTED',
      CI_PASS: 'UNKNOWN_NOT_MEASURED_HERE',
      DEPLOYED: 'UNKNOWN_NOT_MEASURED_HERE',
      CONNECTED: 'UNKNOWN_NOT_MEASURED_HERE',
      AUTHENTICATED: 'UNKNOWN_NOT_MEASURED_HERE',
    },
    caution: 'Config and declared bindings are not evidence of live authenticated RPC.',
  };
}
export function inspectRepository() {
  return inspectSources(read(PATHS.brain), read(PATHS.healer), read(PATHS.package));
}
if (isMainModule(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw Error('USAGE: node worker-gates.mjs');
    const report = inspectRepository();
    console.log(JSON.stringify(report, null, 2));
    if (report.sourceConfigGate !== 'PASS_SAFETY_OFF') process.exitCode = 2;
  } catch (err) {
    console.error('WORKER_GATE_ERROR:', err.message);
    process.exitCode = 1;
  }
}
