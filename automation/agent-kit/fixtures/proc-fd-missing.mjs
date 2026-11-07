// Static test fixture: simulate loss of /proc/self/fd at documented points.
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { run } from './cli.mjs';

const input = JSON.parse(process.argv[2]);
const original = fs.openSync;
let unavailable = input.mode === 'before-private';
fs.openSync = (path, ...args) => {
  if (input.mode === 'at-log-open' && String(path).endsWith('/activity.jsonl')) unavailable = true;
  if (unavailable && String(path).startsWith('/proc/self/fd/')) {
    const error = new Error('SIMULATED_DESCRIPTOR_PATH_MISSING');
    error.code = 'ENOENT';
    throw error;
  }
  const fd = original(path, ...args);
  if (input.mode === 'after-private' && String(path).endsWith('/.private')) unavailable = true;
  return fd;
};
syncBuiltinESMExports();
try {
  console.log(JSON.stringify(run(['verify'])));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
