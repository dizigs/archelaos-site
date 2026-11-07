#!/usr/bin/env node
// Offline check of existing Brain/Self-Heal source. Never invokes providers.
import { closeSync, constants, openSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PATHS = Object.freeze({
  brain: 'brain/wrangler.toml',
  healer: 'automation/self-heal-worker/wrangler.toml',
  package: 'brain/package.json',
});
function read(rel) {
  const fd = openSync(join(ROOT, rel), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const text = readFileSync(fd, 'utf8');
    if (Buffer.byteLength(text, 'utf8') > 131072) throw Error('SOURCE_TOO_LARGE');
    return text;
  } finally { closeSync(fd); }
}
function section(text, name) {
  const lines = text.split(/\r?\n/);
  const content = [];
  let inside = false;
  for (const line of lines) {
    if (line.trim().startsWith('[')) {
      inside = line.trim() === '[' + name + ']';
    } else if (inside) {
      content.push(line);
    }
  }
  return content.join('\n');
}
function value(text, key) {
  const re = new RegExp('^\\s*' + key + '\\s*=\\s*(?:"([^"\\r\\n]*)"|(true|false))\\s*$', 'gm');
  const matches = [...text.matchAll(re)];
  return matches.length === 1 ? (matches[0][1] ?? matches[0][2]) : null;
}
export function inspectSources(brain, healer, pkg) {
  const meta = typeof pkg === 'string' ? JSON.parse(pkg) : pkg;
  if (typeof brain !== 'string' || typeof healer !== 'string' ||
      typeof meta?.devDependencies?.wrangler !== 'string') throw Error('INVALID_SOURCE');
  const bVars = section(brain, 'vars');
  const hVars = section(healer, 'vars');
  const off = [
    value(bVars, 'BRAIN_SELFHEAL_RECOVERY_ENABLED'),
    value(bVars, 'BRAIN_SELFHEAL_DISPATCH_ENABLED'),
    value(bVars, 'BRAIN_SELFHEAL_DURABLE_ACK_ENABLED'),
    value(hVars, 'HEALER_DURABLE_ACK_ENABLED'),
  ].every(v => v === 'false');
  const expired = value(bVars, 'STAGING_EXPIRES_AT') === '1970-01-01T00:00:00Z';
  const brainInfo = {
    name: value(brain, 'name'),
    workersDev: value(brain,'workers_dev'),
    previewUrls: value(brain,'preview_urls'),
    hasSQLiteClass: /new_sqlite_classes\s*=\s*\[\s*"BrainCoordinator"\s*\]/m.test(brain),
    hasServiceBinding: /binding\s*=\s*"HEALER"/m.test(brain),
    observabilityLogs: value(section(brain, 'observability.logs'), 'enabled'),
  };
  const healerInfo = {
    name: value(healer, 'name'),
    workersDev: value(healer,'workers_dev'),
    previewUrls: value(healer,'preview_urls'),
    hasSQLiteClass: /new_sqlite_classes\s*=\s*\[\s*"HealerMemory"\s*\]/m.test(healer),
    hasServiceBinding: /binding\s*=\s*"BRAIN_RECOVERY"/m.test(healer),
    observabilityLogs: value(section(healer, 'observability.logs'), 'enabled'),
  };
  const safeConfig = off && expired && [brainInfo,healerInfo].every(w =>
    w.name && w.workersDev === 'false' && w.previewUrls === 'false' &&
    w.hasSQLiteClass && w.hasServiceBinding && w.observabilityLogs === 'true');
  return {
    scope: 'SOURCE_ONLY_NO_PROVIDER_CALL',
    sourcePaths: PATHS,
    wranglerDeclaredVersion: meta.devDependencies.wrangler,
    brain: brainInfo,
    healer: healerInfo,
    sourceConfigGate: safeConfig ? 'PASS_SAFETY_OFF' : 'REVIEW_REQUIRED',
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
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
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
